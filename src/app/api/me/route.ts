import { connectDB } from "@/lib/db";
import { jsonWithCookies } from "@/lib/auth/response";
import { getUserFromRequest } from "@/lib/auth/session";

export async function GET(req: Request): Promise<Response> {
  try {
    await connectDB();
    const user = await getUserFromRequest(req);
    if (!user) return jsonWithCookies({ error: "로그인이 필요합니다" }, 401);
    return jsonWithCookies(user, 200);
  } catch {
    return jsonWithCookies({ error: "서버 오류가 발생했습니다" }, 500);
  }
}
