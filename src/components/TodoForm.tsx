"use client";

import { useState } from "react";
import type { TodoDTO, WeekDTO } from "@/types";
import type { TodoInput } from "@/lib/api";

interface Props {
  weeks: WeekDTO[];
  initial?: TodoDTO;
  defaultDate: string;
  defaultWeekId?: string;
  onSubmit: (v: TodoInput) => Promise<boolean>;
  onCancel?: () => void;
}

export function TodoForm({ weeks, initial, defaultDate, defaultWeekId, onSubmit, onCancel }: Props) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [weekId, setWeekId] = useState(initial?.weekId ?? defaultWeekId ?? "");
  const [busy, setBusy] = useState(false);

  if (weeks.length === 0) {
    return <p className="text-sm text-amber-700">먼저 주간계획을 만드세요. 할 일은 반드시 주간계획에 연결되어야 합니다.</p>;
  }

  const valid = title.trim().length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date) && weekId !== "";

  return (
    <form
      className="flex flex-wrap items-end gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid || busy) return;
        setBusy(true);
        try {
          const ok = await onSubmit({ title: title.trim(), date, weekId });
          if (ok && !initial) setTitle("");
        } finally {
          setBusy(false);
        }
      }}
    >
      <label className="flex flex-col">
        제목
        <input className="rounded border px-2 py-1" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="flex flex-col">
        날짜
        <input type="date" className="rounded border px-2 py-1" value={date} onChange={(e) => setDate(e.target.value)} />
      </label>
      <label className="flex flex-col">
        주간계획
        <select className="rounded border px-2 py-1" value={weekId} onChange={(e) => setWeekId(e.target.value)}>
          <option value="">선택하세요</option>
          {weeks.map((w) => (
            <option key={w.id} value={w.id}>
              {w.title} ({w.startDate}~{w.endDate})
            </option>
          ))}
        </select>
      </label>
      <button type="submit" disabled={!valid || busy} className="rounded bg-zinc-900 px-3 py-1 text-white disabled:opacity-40">
        {initial ? "저장" : "추가"}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="rounded border px-3 py-1">
          취소
        </button>
      )}
    </form>
  );
}
