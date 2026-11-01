/** 시크릿은 코드에 두지 않고 항상 process.env(.env)에서만 읽는다. */
export function githubConfig(): { clientId: string; clientSecret: string } {
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("GITHUB_CLIENT_ID / GITHUB_CLIENT_SECRET 환경변수가 설정되지 않았습니다");
  }
  return { clientId, clientSecret };
}

/** OAuth redirect_uri 등 절대 URL의 기준. 요청 Host 헤더를 신뢰하지 않기 위해 환경변수로 고정한다. */
export function appUrl(): string {
  return (process.env.APP_URL || "http://localhost:3000").replace(/\/+$/, "");
}
