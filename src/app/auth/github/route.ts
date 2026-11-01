import { buildAuthorizeUrl } from "@/lib/auth/github";
import { redirectWithCookies } from "@/lib/auth/response";
import { STATE_COOKIE, STATE_TTL_SECONDS, randomToken, serializeCookie } from "@/lib/auth/session";

/** 로그인 시작: CSRF 방지용 난수 state를 HttpOnly 쿠키에 저장하고 GitHub 승인 화면으로 이동한다. */
export async function GET(): Promise<Response> {
  const state = randomToken(24);
  let authorizeUrl: string;
  try {
    authorizeUrl = buildAuthorizeUrl(state);
  } catch {
    // GITHUB_CLIENT_ID/SECRET 미설정 등 서버 설정 문제
    return redirectWithCookies("/?auth_error=not_configured", []);
  }
  const headers = new Headers({ Location: authorizeUrl, "Cache-Control": "no-store" });
  headers.append("Set-Cookie", serializeCookie(STATE_COOKIE, state, { maxAge: STATE_TTL_SECONDS }));
  return new Response(null, { status: 302, headers });
}
