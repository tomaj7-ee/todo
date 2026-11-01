"use client";

import { useCallback, useEffect, useState } from "react";
import { UNAUTHORIZED_EVENT } from "@/lib/api";
import { App } from "./App";

interface Me {
  id: string;
  username: string;
  avatarUrl: string;
}

type Status = { kind: "loading" } | { kind: "anonymous" } | { kind: "error" } | { kind: "authed"; user: Me };

const AUTH_ERRORS: Record<string, string> = {
  access_denied: "GitHub 로그인이 취소되었습니다.",
  invalid_state: "로그인 요청이 올바르지 않거나 만료되었습니다. 다시 시도해 주세요.",
  missing_code: "GitHub에서 인증 코드를 받지 못했습니다. 다시 시도해 주세요.",
  login_failed: "GitHub 로그인에 실패했습니다. 잠시 후 다시 시도해 주세요.",
  not_configured: "서버에 GitHub 로그인 설정이 되어 있지 않습니다. 관리자에게 문의하세요.",
};

function authErrorFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get("auth_error");
  return code ? (AUTH_ERRORS[code] ?? "로그인 중 오류가 발생했습니다.") : null;
}

function LoginScreen({ message }: { message: string | null }) {
  return (
    <main className="mx-auto flex min-h-[60vh] max-w-sm flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-bold">할 일 관리</h1>
      <p className="text-sm text-zinc-600">1년 목표와 연결된 할 일을 관리하려면 로그인하세요.</p>
      {message && (
        <p role="alert" className="rounded border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-900">
          {message}
        </p>
      )}
      <a href="/auth/github" className="rounded bg-zinc-900 px-4 py-2 text-white">
        GitHub로 로그인
      </a>
    </main>
  );
}

export function AuthGate() {
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [loginMessage, setLoginMessage] = useState<string | null>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/me", { cache: "no-store" })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 401) {
          setLoginMessage(authErrorFromUrl());
          setStatus({ kind: "anonymous" });
        } else if (res.ok) {
          setStatus({ kind: "authed", user: (await res.json()) as Me });
        } else {
          setStatus({ kind: "error" });
        }
      })
      .catch(() => {
        if (!cancelled) setStatus({ kind: "error" });
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  // 세션이 만료되어 데이터 API가 401을 돌려주면 즉시 로그인 화면으로 전환한다
  useEffect(() => {
    const onUnauthorized = () => {
      setLoginMessage("세션이 만료되었습니다. 다시 로그인해 주세요.");
      setStatus({ kind: "anonymous" });
    };
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  const logout = useCallback(async () => {
    setLogoutError(null);
    try {
      const res = await fetch("/auth/logout", { method: "POST" });
      if (!res.ok) throw new Error("logout failed");
    } catch {
      // 서버에서 세션이 삭제되었는지 확인할 수 없으면 로그아웃된 것처럼 보이지 않게 한다
      setLogoutError("로그아웃에 실패했습니다. 다시 시도해 주세요.");
      return;
    }
    setLoginMessage(null);
    setStatus({ kind: "anonymous" });
  }, []);

  if (status.kind === "loading") return <p className="p-4 text-sm text-zinc-500">불러오는 중…</p>;

  if (status.kind === "error") {
    return (
      <main className="mx-auto flex max-w-sm flex-col items-center gap-3 p-6 text-center">
        <p role="alert" className="text-sm text-red-900">
          서버에 연결할 수 없습니다.
        </p>
        <button className="rounded border px-3 py-1 text-sm" onClick={() => setAttempt((n) => n + 1)}>
          다시 시도
        </button>
      </main>
    );
  }

  if (status.kind === "anonymous") return <LoginScreen message={loginMessage} />;

  const { user } = status;
  return (
    <>
      <header className="mx-auto flex max-w-7xl items-center justify-end gap-3 px-4 pt-3 text-sm">
        {/* 외부(GitHub) 아바타 도메인은 next/image 설정 없이 쓰기 위해 일반 img를 사용한다 */}
        {user.avatarUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.avatarUrl} alt={`${user.username} 프로필`} width={28} height={28} className="rounded-full" />
        )}
        <span className="font-medium">{user.username}</span>
        <button className="rounded border px-2 py-1" onClick={logout}>
          로그아웃
        </button>
      </header>
      {logoutError && (
        <p role="alert" className="mx-auto max-w-7xl px-4 pt-2 text-sm text-red-900">
          {logoutError}
        </p>
      )}
      <App />
    </>
  );
}
