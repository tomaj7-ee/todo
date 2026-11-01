"use client";

import dynamic from "next/dynamic";

// 오늘 날짜를 사용하므로 서버 prerender/hydration 불일치를 피하기 위해 브라우저에서만 렌더한다.
const App = dynamic(() => import("./AuthGate").then((m) => m.AuthGate), {
  ssr: false,
  loading: () => <p className="p-4 text-sm text-zinc-500">불러오는 중…</p>,
});

export function AppClient() {
  return <App />;
}
