import { timingSafeEqual } from "node:crypto";
import { connectDB } from "@/lib/db";
import { User } from "@/lib/models/user";
import { exchangeCodeForToken, fetchGithubUser } from "@/lib/auth/github";
import { redirectWithCookies } from "@/lib/auth/response";
import {
  SESSION_COOKIE,
  SESSION_TTL_SECONDS,
  STATE_COOKIE,
  clearCookie,
  createSession,
  deleteSession,
  parseCookies,
  serializeCookie,
} from "@/lib/auth/session";

function sameState(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** 오류는 고정된 코드로만 알린다 (GitHub 응답/토큰/예외 메시지를 URL이나 화면에 싣지 않는다). */
const fail = (code: string) => redirectWithCookies(`/?auth_error=${code}`, [clearCookie(STATE_COOKIE)]);

export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const cookies = parseCookies(req.headers.get("cookie"));

  if (params.get("error")) return fail("access_denied");

  // state 검증 전에는 코드를 교환하지 않는다
  const expected = cookies[STATE_COOKIE];
  const received = params.get("state");
  if (!expected || !received || !sameState(expected, received)) return fail("invalid_state");

  const code = params.get("code");
  if (!code) return fail("missing_code");

  try {
    const accessToken = await exchangeCodeForToken(code);
    const gh = await fetchGithubUser(accessToken);

    await connectDB();
    const user = await User.findOneAndUpdate(
      { githubId: gh.githubId },
      { $set: { username: gh.username, avatarUrl: gh.avatarUrl } },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true },
    );

    // 세션 고정 방지: 기존 세션이 있으면 지우고 항상 새 토큰을 발급한다
    await deleteSession(cookies[SESSION_COOKIE] ?? null);
    const { token } = await createSession(String(user._id));

    return redirectWithCookies("/", [
      serializeCookie(SESSION_COOKIE, token, { maxAge: SESSION_TTL_SECONDS }),
      clearCookie(STATE_COOKIE),
    ]);
  } catch {
    return fail("login_failed");
  }
}
