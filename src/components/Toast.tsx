"use client";

import { useCallback, useEffect, useState } from "react";

export interface ToastItem {
  id: number;
  message: string;
  kind: "error" | "info";
}

export function useToasts() {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const push = useCallback((message: string, kind: ToastItem["kind"] = "error") => {
    setToasts((t) => [...t, { id: Date.now() + Math.random(), message, kind }]);
  }, []);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  return { toasts, push, dismiss };
}

function Toast({ item, dismiss }: { item: ToastItem; dismiss: (id: number) => void }) {
  const { id } = item;
  useEffect(() => {
    const timer = setTimeout(() => dismiss(id), 6000);
    return () => clearTimeout(timer);
  }, [id, dismiss]);
  return (
    <div
      role={item.kind === "error" ? "alert" : "status"}
      className={`flex items-start gap-3 rounded border px-3 py-2 text-sm shadow ${
        item.kind === "error" ? "border-red-300 bg-red-50 text-red-900" : "border-zinc-300 bg-white"
      }`}
    >
      <span className="flex-1">{item.message}</span>
      <button onClick={() => dismiss(id)} aria-label="닫기" className="font-bold">
        ×
      </button>
    </div>
  );
}

export function ToastStack({ toasts, dismiss }: { toasts: ToastItem[]; dismiss: (id: number) => void }) {
  return (
    <div className="fixed bottom-4 right-4 z-50 flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <Toast key={t.id} item={t} dismiss={dismiss} />
      ))}
    </div>
  );
}
