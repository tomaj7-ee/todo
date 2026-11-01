"use client";

import { useState } from "react";
import type { GoalDTO, WeekDTO } from "@/types";
import type { GoalInput, WeekInput } from "@/lib/api";
import { ProgressBar } from "./ProgressBar";
import { GoalForm, WeekForm } from "./PlanForms";

interface Props {
  goals: GoalDTO[];
  /** 읽기 전용 트리(1년 탭)에서는 편집 UI를 숨긴다 */
  readOnly?: boolean;
  selectedWeekId?: string;
  onSelectWeek?: (id: string) => void;
  onCreateGoal?: (v: GoalInput) => Promise<boolean>;
  onUpdateGoal?: (id: string, v: GoalInput) => Promise<boolean>;
  onDeleteGoal?: (g: GoalDTO) => Promise<void>;
  onCreateWeek?: (v: WeekInput) => Promise<boolean>;
  onUpdateWeek?: (id: string, v: WeekInput) => Promise<boolean>;
  onDeleteWeek?: (w: WeekDTO) => Promise<void>;
}

export function PlanPanel(p: Props) {
  const [editingGoal, setEditingGoal] = useState<string | null>(null);
  const [editingWeek, setEditingWeek] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      {p.goals.length === 0 && <p className="text-sm text-zinc-500">등록된 1년 목표가 없습니다.</p>}
      {p.goals.map((g) => (
        <article key={g.id} className="rounded border bg-white p-3" data-testid={`goal-${g.id}`}>
          {editingGoal === g.id && p.onUpdateGoal ? (
            <GoalForm
              initial={g}
              onSubmit={async (v) => {
                const ok = await p.onUpdateGoal!(g.id, v);
                if (ok) setEditingGoal(null);
                return ok;
              }}
              onCancel={() => setEditingGoal(null)}
            />
          ) : (
            <>
              <div className="flex items-center gap-2">
                <h3 className="flex-1 font-semibold">
                  {g.title} <span className="text-xs font-normal text-zinc-500">{g.year}</span>
                </h3>
                {!p.readOnly && (
                  <>
                    <button className="text-xs underline" onClick={() => setEditingGoal(g.id)}>
                      수정
                    </button>
                    <button className="text-xs text-red-700 underline" onClick={() => p.onDeleteGoal?.(g)}>
                      삭제
                    </button>
                  </>
                )}
              </div>
              <div aria-label={`${g.title} 목표 진행률`}>
                <ProgressBar progress={g.progress} label="목표 진행률" />
              </div>
            </>
          )}

          <ul className="mt-2 flex flex-col gap-2">
            {g.weeks.length === 0 && <li className="text-xs text-zinc-500">연결된 주간계획이 없습니다.</li>}
            {g.weeks.map((w) => (
              <li
                key={w.id}
                data-testid={`week-${w.id}`}
                className={`rounded border p-2 text-sm ${p.selectedWeekId === w.id ? "border-emerald-500" : ""}`}
              >
                {editingWeek === w.id && p.onUpdateWeek ? (
                  <WeekForm
                    goals={p.goals}
                    initial={w}
                    onSubmit={async (v) => {
                      const ok = await p.onUpdateWeek!(w.id, v);
                      if (ok) setEditingWeek(null);
                      return ok;
                    }}
                    onCancel={() => setEditingWeek(null)}
                  />
                ) : (
                  <>
                    <div className="flex items-center gap-2">
                      <button
                        className="flex-1 text-left font-medium"
                        onClick={() => p.onSelectWeek?.(w.id)}
                        disabled={!p.onSelectWeek}
                      >
                        {w.title}
                        <span className="ml-2 text-xs font-normal text-zinc-500">
                          {w.startDate} ~ {w.endDate} · 목표: {w.goalTitle ?? "-"}
                        </span>
                      </button>
                      {!p.readOnly && (
                        <>
                          <button className="text-xs underline" onClick={() => setEditingWeek(w.id)}>
                            수정
                          </button>
                          <button className="text-xs text-red-700 underline" onClick={() => p.onDeleteWeek?.(w)}>
                            삭제
                          </button>
                        </>
                      )}
                    </div>
                    <ProgressBar progress={w.progress} label="주간 진행률" />
                  </>
                )}
              </li>
            ))}
          </ul>
        </article>
      ))}

      {!p.readOnly && p.onCreateGoal && p.onCreateWeek && (
        <div className="flex flex-col gap-3 rounded border border-dashed p-3">
          <GoalForm onSubmit={p.onCreateGoal} />
          <WeekForm goals={p.goals} onSubmit={p.onCreateWeek} />
        </div>
      )}
    </div>
  );
}
