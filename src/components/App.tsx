"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GoalDTO, Status, TodoDTO, WeekDTO } from "@/types";
import { api, type GoalInput, type TodoInput, type WeekInput } from "@/lib/api";
import { persistMove } from "@/lib/board";
import { Board } from "./Board";
import { PlanPanel } from "./PlanPanel";
import { ProgressBar } from "./ProgressBar";
import { TodoForm } from "./TodoForm";
import { ToastStack, useToasts } from "./Toast";

type Tab = "daily" | "weekly" | "yearly";
const TABS: { id: Tab; label: string }[] = [
  { id: "daily", label: "일일" },
  { id: "weekly", label: "주간" },
  { id: "yearly", label: "1년" },
];

function today(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function App() {
  const { toasts, push, dismiss } = useToasts();
  const [tab, setTab] = useState<Tab>("daily");
  const [date, setDate] = useState(today);
  const todayStr = today();
  const [year, setYear] = useState(() => new Date().getFullYear());
  const [yearDraft, setYearDraft] = useState(() => String(new Date().getFullYear()));
  const [weekId, setWeekId] = useState("");
  const [goals, setGoals] = useState<GoalDTO[]>([]);
  const [yearGoals, setYearGoals] = useState<GoalDTO[]>([]);
  const [todos, setTodos] = useState<TodoDTO[]>([]);
  const [editing, setEditing] = useState<TodoDTO | null>(null);
  const [loaded, setLoaded] = useState(false);

  const weeks: WeekDTO[] = useMemo(() => goals.flatMap((g) => g.weeks), [goals]);
  const selectedWeek = weeks.find((w) => w.id === weekId);

  const fetchData = useCallback(async () => {
    const [g, yg, t] = await Promise.all([
      api.listGoals(),
      tab === "yearly" ? api.listGoals(year) : Promise.resolve([] as GoalDTO[]),
      tab === "daily"
        ? api.listTodos({ date, includeOverdue: true })
        : tab === "weekly" && weekId
          ? api.listTodos({ weekId })
          : Promise.resolve([] as TodoDTO[]),
    ]);
    return { g, yg, t };
  }, [tab, date, year, weekId]);

  const apply = useCallback((d: { g: GoalDTO[]; yg: GoalDTO[]; t: TodoDTO[] }) => {
    setGoals(d.g);
    setYearGoals(d.yg);
    setTodos(d.t);
    setLoaded(true);
  }, []);

  // 가장 최근 요청의 응답만 반영한다 (탭 전환/연속 갱신 시 오래된 응답이 덮어쓰지 않도록)
  const seq = useRef(0);
  const load = useCallback(async () => {
    const mine = ++seq.current;
    const d = await fetchData();
    return mine === seq.current ? d : null;
  }, [fetchData]);

  const reload = useCallback(async () => {
    try {
      const d = await load();
      if (d) apply(d);
    } catch (e) {
      push(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다");
      setLoaded(true);
    }
  }, [load, apply, push]);

  useEffect(() => {
    let cancelled = false;
    load()
      .then((d) => {
        if (!cancelled && d) apply(d);
      })
      .catch((e) => {
        if (cancelled) return;
        push(e instanceof Error ? e.message : "데이터를 불러오지 못했습니다");
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [load, apply, push]);

  const run = useCallback(
    async (fn: () => Promise<unknown>) => {
      try {
        await fn();
        await reload();
        return true;
      } catch (e) {
        push(e instanceof Error ? e.message : "요청에 실패했습니다");
        return false;
      }
    },
    [reload, push],
  );

  const moveTodo = (id: string, status: Status) =>
    persistMove({
      todos,
      id,
      target: status,
      save: (tid, s) => api.updateTodo(tid, { status: s }),
      update: setTodos,
      onSaved: reload,
      onError: push,
    });

  const deleteTodo = async (t: TodoDTO) => {
    if (window.confirm(`할 일 "${t.title}"을(를) 삭제할까요?`)) await run(() => api.deleteTodo(t.id));
  };
  const deleteWeek = async (w: WeekDTO) => {
    if (window.confirm(`주간계획 "${w.title}"을(를) 삭제할까요?`)) await run(() => api.deleteWeek(w.id));
  };
  const deleteGoal = async (g: GoalDTO) => {
    if (window.confirm(`1년 목표 "${g.title}"을(를) 삭제할까요?`)) await run(() => api.deleteGoal(g.id));
  };

  const saveTodo = async (v: TodoInput) => {
    const ok = await run(() => (editing ? api.updateTodo(editing.id, v) : api.createTodo(v)));
    if (ok) setEditing(null);
    return ok;
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4 p-4 lg:flex-row">
      <aside className="w-full shrink-0 lg:w-96">
        <h2 className="mb-2 text-lg font-semibold">1년 목표 · 주간계획</h2>
        <PlanPanel
          goals={goals}
          selectedWeekId={weekId}
          onSelectWeek={(id) => {
            setWeekId(id);
            setTab("weekly");
          }}
          onCreateGoal={(v: GoalInput) => run(() => api.createGoal(v))}
          onUpdateGoal={(id, v) => run(() => api.updateGoal(id, v))}
          onDeleteGoal={deleteGoal}
          onCreateWeek={(v: WeekInput) => run(() => api.createWeek(v))}
          onUpdateWeek={(id, v) => run(() => api.updateWeek(id, v))}
          onDeleteWeek={deleteWeek}
        />
      </aside>

      <main className="min-w-0 flex-1">
        <h1 className="mb-3 text-2xl font-bold">할 일 관리</h1>
        <div role="tablist" className="mb-3 flex gap-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className={`rounded px-3 py-1 text-sm ${tab === t.id ? "bg-zinc-900 text-white" : "border"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {!loaded && <p className="text-sm text-zinc-500">불러오는 중…</p>}

        {tab === "daily" && (
          <label className="mb-3 flex items-center gap-2 text-sm">
            날짜
            <input type="date" className="rounded border px-2 py-1" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        )}

        {tab === "weekly" && (
          <div className="mb-3 flex flex-col gap-2 text-sm">
            <label className="flex items-center gap-2">
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
            {selectedWeek && (
              <div className="max-w-md">
                <div className="mb-1 text-xs text-zinc-500">목표: {selectedWeek.goalTitle ?? "-"}</div>
                <ProgressBar progress={selectedWeek.progress} label="주간 진행률" />
              </div>
            )}
          </div>
        )}

        {tab === "yearly" ? (
          <section aria-label="1년 목표 조회">
            <label className="mb-3 flex items-center gap-2 text-sm">
              연도
              <input
                className="w-24 rounded border px-2 py-1"
                inputMode="numeric"
                value={yearDraft}
                aria-label="조회 연도"
                onChange={(e) => {
                  setYearDraft(e.target.value);
                  const n = Number(e.target.value);
                  if (/^\d{4}$/.test(e.target.value) && n >= 1900 && n <= 3000) setYear(n);
                }}
              />
            </label>
            <PlanPanel goals={yearGoals} readOnly />
          </section>
        ) : (
          <>
            <div className="mb-3 rounded border bg-white p-3">
              <h2 className="mb-2 text-sm font-semibold">{editing ? "할 일 수정" : "할 일 추가"}</h2>
              <TodoForm
                key={editing?.id ?? `new-${tab}-${date}-${weekId}`}
                weeks={weeks}
                initial={editing ?? undefined}
                defaultDate={tab === "daily" ? date : (selectedWeek?.startDate ?? date)}
                defaultWeekId={tab === "weekly" ? weekId : undefined}
                onSubmit={saveTodo}
                onCancel={editing ? () => setEditing(null) : undefined}
              />
            </div>
            {tab === "weekly" && !weekId ? (
              <p className="text-sm text-zinc-500">주간계획을 선택하면 해당 주간계획의 할 일이 표시됩니다.</p>
            ) : (
              <Board todos={todos} today={todayStr} onMove={moveTodo} onEdit={setEditing} onDelete={deleteTodo} />
            )}
          </>
        )}
      </main>

      <ToastStack toasts={toasts} dismiss={dismiss} />
    </div>
  );
}
