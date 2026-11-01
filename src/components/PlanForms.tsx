"use client";

import { useState } from "react";
import type { GoalDTO, WeekDTO } from "@/types";
import type { GoalInput, WeekInput } from "@/lib/api";

export function GoalForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial?: GoalDTO;
  onSubmit: (v: GoalInput) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [year, setYear] = useState(String(initial?.year ?? new Date().getFullYear()));
  const yearNum = Number(year);
  const valid = title.trim() !== "" && Number.isInteger(yearNum) && yearNum >= 1900 && yearNum <= 3000;
  return (
    <form
      className="flex flex-wrap items-end gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        const ok = await onSubmit({ title: title.trim(), year: yearNum });
        if (ok && !initial) setTitle("");
      }}
    >
      <label className="flex flex-col">
        목표 제목
        <input className="rounded border px-2 py-1" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="flex flex-col">
        연도
        <input className="w-24 rounded border px-2 py-1" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} />
      </label>
      <button type="submit" disabled={!valid} className="rounded bg-zinc-900 px-3 py-1 text-white disabled:opacity-40">
        {initial ? "저장" : "목표 추가"}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="rounded border px-3 py-1">
          취소
        </button>
      )}
    </form>
  );
}

export function WeekForm({
  goals,
  initial,
  defaultGoalId,
  onSubmit,
  onCancel,
}: {
  goals: GoalDTO[];
  initial?: WeekDTO;
  defaultGoalId?: string;
  onSubmit: (v: WeekInput) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [goalId, setGoalId] = useState(initial?.goalId ?? defaultGoalId ?? "");
  const [startDate, setStart] = useState(initial?.startDate ?? "");
  const [endDate, setEnd] = useState(initial?.endDate ?? "");

  if (goals.length === 0) {
    return <p className="text-sm text-amber-700">먼저 1년 목표를 만드세요. 주간계획은 반드시 목표에 연결되어야 합니다.</p>;
  }

  const rangeOk = startDate !== "" && endDate !== "" && endDate >= startDate;
  const valid = title.trim() !== "" && goalId !== "" && rangeOk;
  return (
    <form
      className="flex flex-wrap items-end gap-2 text-sm"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!valid) return;
        const ok = await onSubmit({ title: title.trim(), goalId, startDate, endDate });
        if (ok && !initial) setTitle("");
      }}
    >
      <label className="flex flex-col">
        주간계획 제목
        <input className="rounded border px-2 py-1" value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="flex flex-col">
        1년 목표
        <select className="rounded border px-2 py-1" value={goalId} onChange={(e) => setGoalId(e.target.value)}>
          <option value="">선택하세요</option>
          {goals.map((g) => (
            <option key={g.id} value={g.id}>
              {g.title} ({g.year})
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col">
        시작일
        <input type="date" className="rounded border px-2 py-1" value={startDate} onChange={(e) => setStart(e.target.value)} />
      </label>
      <label className="flex flex-col">
        종료일
        <input type="date" className="rounded border px-2 py-1" value={endDate} onChange={(e) => setEnd(e.target.value)} />
      </label>
      {startDate && endDate && !rangeOk && <span className="text-xs text-red-700">종료일은 시작일 이후여야 합니다</span>}
      <button type="submit" disabled={!valid} className="rounded bg-zinc-900 px-3 py-1 text-white disabled:opacity-40">
        {initial ? "저장" : "주간계획 추가"}
      </button>
      {onCancel && (
        <button type="button" onClick={onCancel} className="rounded border px-3 py-1">
          취소
        </button>
      )}
    </form>
  );
}
