import mongoose from "mongoose";
import { Goal } from "@/lib/models/goal";
import { Week } from "@/lib/models/week";
import { Todo } from "@/lib/models/todo";
import { calcPercent } from "@/lib/progress";
import type { GoalDTO, Progress, TodoDTO, WeekDTO } from "@/types";

type Id = mongoose.Types.ObjectId;

export async function weekProgressMap(weekIds: Id[], userId: string): Promise<Map<string, Progress>> {
  const rows = await Todo.aggregate<{ _id: Id; total: number; done: number }>([
    // aggregate는 문자열 id를 자동 캐스팅하지 않으므로 ObjectId로 변환한다
    { $match: { userId: new mongoose.Types.ObjectId(userId), weekId: { $in: weekIds } } },
    { $group: { _id: "$weekId", total: { $sum: 1 }, done: { $sum: { $cond: [{ $eq: ["$status", "done"] }, 1, 0] } } } },
  ]);
  const map = new Map<string, Progress>();
  for (const r of rows) map.set(String(r._id), { done: r.done, total: r.total, percent: calcPercent(r.done, r.total) });
  return map;
}

const EMPTY: Progress = { done: 0, total: 0, percent: 0 };

export async function toWeekDTOs(
  weeks: Array<{ _id: Id; title: string; goalId: Id; startDate: string; endDate: string }>,
  userId: string,
): Promise<WeekDTO[]> {
  const progress = await weekProgressMap(
    weeks.map((w) => w._id),
    userId,
  );
  const goals = await Goal.find({ userId, _id: { $in: [...new Set(weeks.map((w) => String(w.goalId)))] } }).lean();
  const titles = new Map(goals.map((g) => [String(g._id), g.title]));
  return weeks.map((w) => ({
    id: String(w._id),
    title: w.title,
    goalId: String(w.goalId),
    goalTitle: titles.get(String(w.goalId)) ?? null,
    startDate: w.startDate,
    endDate: w.endDate,
    progress: progress.get(String(w._id)) ?? { ...EMPTY },
  }));
}

export async function toGoalDTOs(
  goals: Array<{ _id: Id; title: string; year: number }>,
  userId: string,
): Promise<GoalDTO[]> {
  const weeks = await Week.find({ userId, goalId: { $in: goals.map((g) => g._id) } })
    .sort({ startDate: 1 })
    .lean();
  const weekDTOs = await toWeekDTOs(weeks, userId);
  return goals.map((g) => {
    const ws = weekDTOs.filter((w) => w.goalId === String(g._id));
    const percent = ws.length ? Math.round(ws.reduce((s, w) => s + w.progress.percent, 0) / ws.length) : 0;
    // 목표 진행률(P1): 연결된 주간계획 진행률의 단순 평균. done/total은 하위 할 일 합산(참고용).
    const done = ws.reduce((s, w) => s + w.progress.done, 0);
    const total = ws.reduce((s, w) => s + w.progress.total, 0);
    return { id: String(g._id), title: g.title, year: g.year, weeks: ws, progress: { done, total, percent } };
  });
}

export async function toTodoDTOs(
  todos: Array<{ _id: Id; title: string; status: string; weekId: Id; date: string }>,
  userId: string,
): Promise<TodoDTO[]> {
  const weeks = await Week.find({ userId, _id: { $in: [...new Set(todos.map((t) => String(t.weekId)))] } }).lean();
  const goals = await Goal.find({ userId, _id: { $in: weeks.map((w) => w.goalId) } }).lean();
  const goalTitle = new Map(goals.map((g) => [String(g._id), g.title]));
  const weekMap = new Map(weeks.map((w) => [String(w._id), w]));
  return todos.map((t) => {
    const w = weekMap.get(String(t.weekId));
    return {
      id: String(t._id),
      title: t.title,
      status: t.status as TodoDTO["status"],
      weekId: String(t.weekId),
      weekTitle: w?.title ?? "",
      goalId: w ? String(w.goalId) : null,
      goalTitle: w ? (goalTitle.get(String(w.goalId)) ?? null) : null,
      date: t.date,
    };
  });
}
