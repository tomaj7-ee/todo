import { appUrl } from "@/lib/config";

/**
 * 302 리다이렉트. Response.redirect()는 헤더가 불변이라 Set-Cookie를 붙일 수 없어 직접 만든다.
 * 이동 경로는 항상 APP_URL 기준의 고정 경로이며 요청에서 받은 값을 사용하지 않는다(open redirect 방지).
 */
export function redirectWithCookies(path: string, cookies: string[]): Response {
  const headers = new Headers({ Location: `${appUrl()}${path}`, "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(null, { status: 302, headers });
}

export function jsonWithCookies(data: unknown, status: number, cookies: string[] = []): Response {
  const headers = new Headers({ "Content-Type": "application/json", "Cache-Control": "no-store" });
  for (const c of cookies) headers.append("Set-Cookie", c);
  return new Response(JSON.stringify(data), { status, headers });
}
