import { HttpError, handle } from "@/lib/http";
import { getUserFromRequest, type AuthUser } from "@/lib/auth/session";

/**
 * 기존 handle()(DB 연결 + 오류 매핑)에 "로그인 필수"만 더한 래퍼.
 * 세션이 없으면 핸들러 본문을 실행하기 전에 401을 반환하므로 DB를 변경하지 않는다.
 */
export function authed<A extends [Request, ...unknown[]]>(
  fn: (user: AuthUser, ...args: A) => Promise<Response>,
): (...args: A) => Promise<Response> {
  return handle(async (...args: A) => {
    const user = await getUserFromRequest(args[0]);
    if (!user) throw new HttpError(401, "로그인이 필요합니다");
    return fn(user, ...args);
  });
}
