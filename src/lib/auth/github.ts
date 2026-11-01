import { appUrl, githubConfig } from "@/lib/config";

const AUTHORIZE_URL = "https://github.com/login/oauth/authorize";
const TOKEN_URL = "https://github.com/login/oauth/access_token";
const USER_URL = "https://api.github.com/user";
const TIMEOUT_MS = 10_000;

/** 메시지에 토큰/시크릿/응답 본문을 넣지 않는다 (로그로 새어 나가지 않도록). */
export class OAuthError extends Error {}

export const callbackUrl = () => `${appUrl()}/auth/github/callback`;

export function buildAuthorizeUrl(state: string): string {
  const { clientId } = githubConfig();
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", callbackUrl());
  url.searchParams.set("state", state);
  url.searchParams.set("scope", "read:user");
  return url.toString();
}

export async function exchangeCodeForToken(code: string): Promise<string> {
  const { clientId, clientSecret } = githubConfig();
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: callbackUrl() }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new OAuthError("GitHub 토큰 교환 요청에 실패했습니다");
  }
  if (!res.ok) throw new OAuthError(`GitHub 토큰 교환이 실패했습니다 (HTTP ${res.status})`);
  const data = (await res.json().catch(() => null)) as { access_token?: unknown; error?: unknown } | null;
  if (!data || data.error || typeof data.access_token !== "string" || !data.access_token) {
    throw new OAuthError("GitHub가 access token을 발급하지 않았습니다");
  }
  return data.access_token;
}

export interface GithubUser {
  githubId: string;
  username: string;
  avatarUrl: string;
}

export async function fetchGithubUser(accessToken: string): Promise<GithubUser> {
  let res: Response;
  try {
    res = await fetch(USER_URL, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "todo-app",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new OAuthError("GitHub 사용자 조회 요청에 실패했습니다");
  }
  if (!res.ok) throw new OAuthError(`GitHub 사용자 조회가 실패했습니다 (HTTP ${res.status})`);
  const data = (await res.json().catch(() => null)) as { id?: unknown; login?: unknown; avatar_url?: unknown } | null;
  if (!data || (typeof data.id !== "number" && typeof data.id !== "string") || typeof data.login !== "string" || !data.login) {
    throw new OAuthError("GitHub 사용자 정보가 올바르지 않습니다");
  }
  return {
    githubId: String(data.id),
    username: data.login,
    avatarUrl: typeof data.avatar_url === "string" ? data.avatar_url : "",
  };
}
