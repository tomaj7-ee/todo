import { connectDB } from "@/lib/db";
import { jsonWithCookies } from "@/lib/auth/response";
import { SESSION_COOKIE, clearCookie, deleteSession, sessionTokenFrom } from "@/lib/auth/session";

/** 로그아웃: DB의 세션 문서를 삭제하고 쿠키를 만료시킨다. POST만 허용(SameSite=Lax 쿠키로 교차 사이트 요청 차단). */
export async function POST(req: Request): Promise<Response> {
  try {
    await connectDB();
    await deleteSession(sessionTokenFrom(req));
  } catch {
    // 세션 삭제 여부를 확신할 수 없으므로 쿠키를 지우지 않는다. 지우면 재시도 요청에 쿠키가 없어
    // DB의 세션이 7일간 살아남은 채 로그아웃된 것처럼 보이게 된다.
    return jsonWithCookies({ error: "로그아웃 처리 중 오류가 발생했습니다" }, 500);
  }
  return jsonWithCookies({ ok: true }, 200, [clearCookie(SESSION_COOKIE)]);
}
