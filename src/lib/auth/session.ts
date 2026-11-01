import { createHash, randomBytes } from "node:crypto";
import { appUrl } from "@/lib/config";
import { Session } from "@/lib/models/session";
import { User } from "@/lib/models/user";

export const SESSION_COOKIE = "session";
export const STATE_COOKIE = "oauth_state";
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7;
export const STATE_TTL_SECONDS = 60 * 10;

export interface AuthUser {
  id: string;
  username: string;
  avatarUrl: string;
}

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url");

export function parseCookies(header: string | null | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (header ?? "").split(";")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const name = part.slice(0, i).trim();
    if (!name || name in out) continue;
    try {
      out[name] = decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      // 잘못된 인코딩의 쿠키는 무시한다
    }
  }
  return out;
}

/**
 * Secure 속성 여부. https 주소이거나, production이면서 localhost가 아닌 주소면 Secure.
 * production 빌드를 http://localhost 에서 실행(next start)할 때는 Secure 쿠키를 저장하지 않는 브라우저가 있어
 * 로그인이 조용히 실패하므로 그 경우만 제외한다.
 */
export function isSecureCookie(): boolean {
  const url = new URL(appUrl());
  if (url.protocol === "https:") return true;
  if (process.env.NODE_ENV !== "production") return false;
  return !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
}

export function serializeCookie(name: string, value: string, opts: { maxAge: number }): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, "Path=/", "HttpOnly", "SameSite=Lax", `Max-Age=${opts.maxAge}`];
  if (isSecureCookie()) parts.push("Secure");
  return parts.join("; ");
}

export const clearCookie = (name: string) => serializeCookie(name, "", { maxAge: 0 });

export async function createSession(userId: string): Promise<{ token: string; expiresAt: Date }> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_TTL_SECONDS * 1000);
  await Session.create({ tokenHash: hashToken(token), userId, expiresAt });
  return { token, expiresAt };
}

export function sessionTokenFrom(req: Request): string | null {
  return parseCookies(req.headers.get("cookie"))[SESSION_COOKIE] || null;
}

export async function getUserFromRequest(req: Request): Promise<AuthUser | null> {
  const token = sessionTokenFrom(req);
  if (!token) return null;
  const session = await Session.findOne({ tokenHash: hashToken(token), expiresAt: { $gt: new Date() } }).lean();
  if (!session) return null;
  const user = await User.findById(session.userId).lean();
  if (!user) return null;
  return { id: String(user._id), username: user.username, avatarUrl: user.avatarUrl ?? "" };
}

/** 세션 문서를 DB에서 완전히 삭제한다. 토큰이 없거나 알 수 없어도 오류 없이 false. */
export async function deleteSession(token: string | null): Promise<boolean> {
  if (!token) return false;
  const res = await Session.deleteOne({ tokenHash: hashToken(token) });
  return res.deletedCount > 0;
}
