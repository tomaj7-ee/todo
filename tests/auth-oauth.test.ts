import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as start from "@/app/auth/github/route";
import * as callback from "@/app/auth/github/callback/route";
import * as logout from "@/app/auth/logout/route";
import * as me from "@/app/api/me/route";
import { Session } from "@/lib/models/session";
import { User } from "@/lib/models/user";
import { clearDb, startDb, stopDb } from "./helpers";

const CLIENT_ID = "test-client-id";
const CLIENT_SECRET = "test-client-secret-value";
const ACCESS_TOKEN = "gho_FAKE_ACCESS_TOKEN";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(async () => {
  await clearDb();
  vi.stubEnv("GITHUB_CLIENT_ID", CLIENT_ID);
  vi.stubEnv("GITHUB_CLIENT_SECRET", CLIENT_SECRET);
  vi.stubEnv("APP_URL", "http://localhost:3000");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

type GithubUserPayload = { id: number | string; login: string; avatar_url?: string };

/** GitHub 엔드포인트를 모킹한다. 호출 기록은 calls에 남는다. */
function mockGithub(opts: {
  token?: Record<string, unknown>;
  tokenStatus?: number;
  user?: GithubUserPayload;
  userStatus?: number;
  throwOn?: "token" | "user";
}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const reply = (status: number, body: unknown) =>
        ({ ok: status < 400, status, json: async () => body }) as Response;
      if (url === "https://github.com/login/oauth/access_token") {
        if (opts.throwOn === "token") throw new Error("network down");
        return reply(opts.tokenStatus ?? 200, opts.token ?? { access_token: ACCESS_TOKEN });
      }
      if (url === "https://api.github.com/user") {
        if (opts.throwOn === "user") throw new Error("network down");
        return reply(opts.userStatus ?? 200, opts.user ?? { id: 123, login: "octocat", avatar_url: "https://avatars.example/o.png" });
      }
      throw new Error(`unexpected fetch ${url}`);
    }),
  );
  return calls;
}

const cookieHeader = (res: Response, name: string) =>
  res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`)) ?? "";
const cookieValue = (res: Response, name: string) => decodeURIComponent(cookieHeader(res, name).split(";")[0].slice(name.length + 1));

const callbackReq = (qs: string, cookie?: string) =>
  new Request(`http://localhost:3000/auth/github/callback?${qs}`, { headers: cookie ? { cookie } : {} });

async function login(user?: GithubUserPayload) {
  mockGithub({ user });
  const res = await callback.GET(callbackReq("code=abc&state=S1", "oauth_state=S1"));
  expect(res.status).toBe(302);
  return { res, cookie: `session=${cookieValue(res, "session")}` };
}

describe("GET /auth/github", () => {
  it("redirects to GitHub with client_id, redirect_uri, state, scope and sets an HttpOnly state cookie", async () => {
    const res = await start.GET();
    expect(res.status).toBe(302);
    const loc = new URL(res.headers.get("location") as string);
    expect(`${loc.origin}${loc.pathname}`).toBe("https://github.com/login/oauth/authorize");
    expect(loc.searchParams.get("client_id")).toBe(CLIENT_ID);
    expect(loc.searchParams.get("redirect_uri")).toBe("http://localhost:3000/auth/github/callback");
    expect(loc.searchParams.get("scope")).toBe("read:user");
    const state = loc.searchParams.get("state") as string;
    expect(state.length).toBeGreaterThanOrEqual(24);
    const set = cookieHeader(res, "oauth_state");
    expect(set).toContain(`oauth_state=${state}`);
    expect(set).toContain("HttpOnly");
    expect(set).toContain("SameSite=Lax");
    expect(res.headers.get("location")).not.toContain(CLIENT_SECRET);
  });

  it("uses a fresh state on every call", async () => {
    const a = new URL((await start.GET()).headers.get("location") as string).searchParams.get("state");
    const b = new URL((await start.GET()).headers.get("location") as string).searchParams.get("state");
    expect(a).not.toBe(b);
  });

  it("redirects with a fixed error code when GitHub credentials are not configured", async () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "");
    const res = await start.GET();
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost:3000/?auth_error=not_configured");
  });
});

describe("GET /auth/github/callback - state check", () => {
  it.each([
    ["no state cookie", "code=abc&state=S1", undefined],
    ["no state in query", "code=abc", "oauth_state=S1"],
    ["state mismatch", "code=abc&state=OTHER", "oauth_state=S1"],
  ])("%s -> error redirect without calling GitHub or creating a session", async (_label, qs, cookie) => {
    const calls = mockGithub({});
    const res = await callback.GET(callbackReq(qs, cookie));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost:3000/?auth_error=invalid_state");
    expect(calls).toHaveLength(0);
    expect(await Session.countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(0);
  });

  it("access_denied from GitHub -> error redirect, no calls", async () => {
    const calls = mockGithub({});
    const res = await callback.GET(callbackReq("error=access_denied&state=S1", "oauth_state=S1"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/?auth_error=access_denied");
    expect(calls).toHaveLength(0);
  });

  it("missing code -> error redirect", async () => {
    const calls = mockGithub({});
    const res = await callback.GET(callbackReq("state=S1", "oauth_state=S1"));
    expect(res.headers.get("location")).toBe("http://localhost:3000/?auth_error=missing_code");
    expect(calls).toHaveLength(0);
  });
});

describe("GET /auth/github/callback - login", () => {
  it("stores username and avatar_url, issues a session cookie, clears the state cookie and redirects to /", async () => {
    const calls = mockGithub({});
    const res = await callback.GET(callbackReq("code=abc&state=S1", "oauth_state=S1"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost:3000/");

    const users = await User.find().lean();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ githubId: "123", username: "octocat", avatarUrl: "https://avatars.example/o.png" });

    expect(await Session.countDocuments()).toBe(1);
    const session = cookieHeader(res, "session");
    expect(session).toContain("HttpOnly");
    expect(session).toContain("SameSite=Lax");
    expect(cookieHeader(res, "oauth_state")).toContain("Max-Age=0");

    // 토큰 교환 요청에는 code가 들어가고, 사용자 조회에는 Bearer 토큰이 사용된다
    expect(JSON.parse(calls[0].init?.body as string)).toMatchObject({ code: "abc", client_id: CLIENT_ID });
    expect((calls[1].init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${ACCESS_TOKEN}`);
  });

  it("never exposes the access token or client secret in the response, cookies, User or Session documents", async () => {
    mockGithub({});
    const res = await callback.GET(callbackReq("code=abc&state=S1", "oauth_state=S1"));
    const stored = JSON.stringify({
      location: res.headers.get("location"),
      body: await res.text(),
      users: await User.find().lean(),
      sessions: await Session.find().lean(),
    });
    const withCookies = stored + JSON.stringify(res.headers.getSetCookie());
    // GitHub access token / client secret은 응답(쿠키 포함), DB 어디에도 없다
    expect(withCookies).not.toContain(ACCESS_TOKEN);
    expect(withCookies).not.toContain(CLIENT_SECRET);
    // 원본 세션 토큰은 쿠키로만 전달되고 DB·URL·본문에는 없다 (DB에는 해시만)
    expect(cookieValue(res, "session").length).toBeGreaterThanOrEqual(40);
    expect(stored).not.toContain(cookieValue(res, "session"));
  });

  it("re-login updates username/avatar without duplicating the user and replaces the old session", async () => {
    const first = await login();
    const second = await (async () => {
      mockGithub({ user: { id: 123, login: "octocat-renamed", avatar_url: "https://avatars.example/new.png" } });
      const res = await callback.GET(callbackReq("code=abc&state=S2", `oauth_state=S2; ${first.cookie}`));
      return { res, cookie: `session=${cookieValue(res, "session")}` };
    })();
    const users = await User.find().lean();
    expect(users).toHaveLength(1);
    expect(users[0]).toMatchObject({ username: "octocat-renamed", avatarUrl: "https://avatars.example/new.png" });
    expect(second.cookie).not.toBe(first.cookie);
    expect(await Session.countDocuments()).toBe(1); // 세션 고정 방지: 이전 세션은 삭제됨
    const old = await me.GET(new Request("http://localhost/api/me", { headers: { cookie: first.cookie } }));
    expect(old.status).toBe(401);
  });

  it.each([
    ["GitHub returns an error for the code", { token: { error: "bad_verification_code" } }],
    ["token response has no access_token", { token: {} }],
    ["token endpoint returns HTTP 500", { tokenStatus: 500 }],
    ["user lookup returns HTTP 401", { userStatus: 401 }],
    ["user payload has no login", { user: { id: 1 } as unknown as GithubUserPayload }],
    ["network failure on token exchange", { throwOn: "token" as const }],
    ["network failure on user lookup", { throwOn: "user" as const }],
  ])("%s -> no session is created", async (_label, opts) => {
    mockGithub(opts);
    const res = await callback.GET(callbackReq("code=abc&state=S1", "oauth_state=S1"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("http://localhost:3000/?auth_error=login_failed");
    expect(cookieHeader(res, "session")).toBe("");
    expect(await Session.countDocuments()).toBe(0);
    expect(await User.countDocuments()).toBe(0);
  });
});

describe("GET /api/me and POST /auth/logout", () => {
  it("/api/me is 401 without a session and returns only id/username/avatarUrl with one", async () => {
    expect((await me.GET(new Request("http://localhost/api/me"))).status).toBe(401);
    const { cookie } = await login();
    const res = await me.GET(new Request("http://localhost/api/me", { headers: { cookie } }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(Object.keys(body).sort()).toEqual(["avatarUrl", "id", "username"]);
    expect(body).toMatchObject({ username: "octocat", avatarUrl: "https://avatars.example/o.png" });
  });

  it("logout deletes the Session document, expires the cookie and the old cookie no longer works", async () => {
    const { cookie } = await login();
    expect(await Session.countDocuments()).toBe(1);
    const res = await logout.POST(new Request("http://localhost/auth/logout", { method: "POST", headers: { cookie } }));
    expect(res.status).toBe(200);
    expect(await Session.countDocuments()).toBe(0);
    expect(cookieHeader(res, "session")).toContain("Max-Age=0");
    const after = await me.GET(new Request("http://localhost/api/me", { headers: { cookie } }));
    expect(after.status).toBe(401);
  });

  it("when deleting the session fails, logout returns 500 WITHOUT clearing the cookie so a retry can still delete it", async () => {
    const { cookie } = await login();
    const spy = vi.spyOn(Session, "deleteOne").mockRejectedValueOnce(new Error("db down"));
    const failed = await logout.POST(new Request("http://localhost/auth/logout", { method: "POST", headers: { cookie } }));
    spy.mockRestore();
    expect(failed.status).toBe(500);
    expect(cookieHeader(failed, "session")).toBe("");
    expect(await Session.countDocuments()).toBe(1);
    const retry = await logout.POST(new Request("http://localhost/auth/logout", { method: "POST", headers: { cookie } }));
    expect(retry.status).toBe(200);
    expect(await Session.countDocuments()).toBe(0);
  });

  it("logout without a session is harmless", async () => {
    const res = await logout.POST(new Request("http://localhost/auth/logout", { method: "POST" }));
    expect(res.status).toBe(200);
    expect(cookieHeader(res, "session")).toContain("Max-Age=0");
  });
});
