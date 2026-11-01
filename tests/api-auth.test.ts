import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import * as goals from "@/app/api/goals/route";
import * as goalById from "@/app/api/goals/[id]/route";
import * as weeks from "@/app/api/weeks/route";
import * as weekById from "@/app/api/weeks/[id]/route";
import * as todos from "@/app/api/todos/route";
import * as todoById from "@/app/api/todos/[id]/route";
import { Goal } from "@/lib/models/goal";
import { Week } from "@/lib/models/week";
import { Todo } from "@/lib/models/todo";
import { Session } from "@/lib/models/session";
import { hashToken } from "@/lib/auth/session";
import { clearDb, createTestUser, startDb, stopDb } from "./helpers";

beforeAll(startDb);
afterAll(stopDb);

let A: { id: string; cookie: string };
let B: { id: string; cookie: string };
beforeEach(async () => {
  await clearDb();
  A = await createTestUser("user-a");
  B = await createTestUser("user-b");
});

const mk = (cookie: string | undefined, method: string, path: string, body?: unknown) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const call = async (res: Response | Promise<Response>) => {
  const r = await res;
  return { status: r.status, body: await r.json() };
};

/** 사용자 A 또는 B 이름으로 요청을 보내는 작은 클라이언트 */
const as = (u: { cookie: string } | undefined) => {
  const c = u?.cookie;
  return {
    goals: {
      list: (qs = "") => call(goals.GET(mk(c, "GET", `/api/goals${qs}`))),
      create: (b: unknown) => call(goals.POST(mk(c, "POST", "/api/goals", b))),
      patch: (id: string, b: unknown) => call(goalById.PATCH(mk(c, "PATCH", `/api/goals/${id}`, b), ctx(id))),
      del: (id: string) => call(goalById.DELETE(mk(c, "DELETE", `/api/goals/${id}`), ctx(id))),
    },
    weeks: {
      list: (qs = "") => call(weeks.GET(mk(c, "GET", `/api/weeks${qs}`))),
      create: (b: unknown) => call(weeks.POST(mk(c, "POST", "/api/weeks", b))),
      patch: (id: string, b: unknown) => call(weekById.PATCH(mk(c, "PATCH", `/api/weeks/${id}`, b), ctx(id))),
      del: (id: string) => call(weekById.DELETE(mk(c, "DELETE", `/api/weeks/${id}`), ctx(id))),
    },
    todos: {
      list: (qs = "") => call(todos.GET(mk(c, "GET", `/api/todos${qs}`))),
      create: (b: unknown) => call(todos.POST(mk(c, "POST", "/api/todos", b))),
      patch: (id: string, b: unknown) => call(todoById.PATCH(mk(c, "PATCH", `/api/todos/${id}`, b), ctx(id))),
      del: (id: string) => call(todoById.DELETE(mk(c, "DELETE", `/api/todos/${id}`), ctx(id))),
    },
  };
};

/** 사용자 한 명 분량의 목표/주간계획/할 일을 만든다 */
async function seed(u: { cookie: string }, tag: string) {
  const api = as(u);
  const goal = (await api.goals.create({ title: `goal-${tag}`, year: 2026 })).body;
  const week = (await api.weeks.create({ title: `week-${tag}`, goalId: goal.id, startDate: "2026-11-02", endDate: "2026-11-08" })).body;
  const todo = (await api.todos.create({ title: `todo-${tag}`, weekId: week.id, date: "2026-11-03" })).body;
  return { goal, week, todo };
}

const counts = async () => ({
  goals: await Goal.countDocuments(),
  weeks: await Week.countDocuments(),
  todos: await Todo.countDocuments(),
});

describe("authentication required (401)", () => {
  it.each([
    ["no cookie", undefined],
    ["unknown session token", { cookie: "session=not-a-real-token" }],
  ])("every goals/weeks/todos handler returns 401 with %s and changes nothing", async (_label, anon) => {
    const { goal, week, todo } = await seed(A, "a");
    const before = JSON.stringify([await Goal.find().lean(), await Week.find().lean(), await Todo.find().lean()]);
    const api = as(anon);
    const results = await Promise.all([
      api.goals.list(),
      api.goals.create({ title: "x", year: 2026 }),
      api.goals.patch(goal.id, { title: "hijack" }),
      api.goals.del(goal.id),
      api.weeks.list(),
      api.weeks.create({ title: "x", goalId: goal.id, startDate: "2026-11-02", endDate: "2026-11-08" }),
      api.weeks.patch(week.id, { title: "hijack" }),
      api.weeks.del(week.id),
      api.todos.list(),
      api.todos.create({ title: "x", weekId: week.id, date: "2026-11-03" }),
      api.todos.patch(todo.id, { status: "done" }),
      api.todos.del(todo.id),
    ]);
    for (const r of results) {
      expect(r.status).toBe(401);
      expect(r.body.error).toBeTruthy();
    }
    expect(await counts()).toEqual({ goals: 1, weeks: 1, todos: 1 });
    expect(JSON.stringify([await Goal.find().lean(), await Week.find().lean(), await Todo.find().lean()])).toBe(before);
  });

  it("an expired or deleted session is rejected", async () => {
    const token = A.cookie.split("=")[1];
    await Session.updateOne({ tokenHash: hashToken(token) }, { expiresAt: new Date(Date.now() - 1000) });
    expect((await as(A).goals.list()).status).toBe(401);
    await Session.deleteMany({});
    expect((await as(A).todos.list()).status).toBe(401);
  });
});

describe("userId ownership", () => {
  it("sets userId from the session on create", async () => {
    const { goal, week, todo } = await seed(A, "a");
    expect(String((await Goal.findById(goal.id).lean())!.userId)).toBe(A.id);
    expect(String((await Week.findById(week.id).lean())!.userId)).toBe(A.id);
    expect(String((await Todo.findById(todo.id).lean())!.userId)).toBe(A.id);
  });

  it("rejects a userId supplied in the request body (cannot create or move data into another account)", async () => {
    const a = as(A);
    const { goal, week, todo } = await seed(A, "a");
    expect((await as(B).goals.create({ title: "x", year: 2026, userId: A.id })).status).toBe(400);
    expect((await as(B).weeks.create({ title: "x", goalId: goal.id, startDate: "2026-11-02", endDate: "2026-11-08", userId: A.id })).status).toBe(400);
    expect((await as(B).todos.create({ title: "x", weekId: week.id, date: "2026-11-03", userId: A.id })).status).toBe(400);
    // 본인 문서의 소유자를 PATCH로 바꿀 수도 없다
    expect((await a.goals.patch(goal.id, { userId: B.id })).status).toBe(400);
    expect((await a.weeks.patch(week.id, { userId: B.id })).status).toBe(400);
    expect((await a.todos.patch(todo.id, { userId: B.id })).status).toBe(400);
    expect(await counts()).toEqual({ goals: 1, weeks: 1, todos: 1 });
    expect(String((await Todo.findById(todo.id).lean())!.userId)).toBe(A.id);
  });
});

describe("isolation between users", () => {
  it("B sees none of A's goals, weeks or todos (including filtered and overdue queries)", async () => {
    await seed(A, "a");
    const b = as(B);
    expect((await b.goals.list()).body).toEqual([]);
    expect((await b.goals.list("?year=2026")).body).toEqual([]);
    expect((await b.weeks.list()).body).toEqual([]);
    expect((await b.weeks.list("?date=2026-11-03")).body).toEqual([]);
    expect((await b.todos.list()).body).toEqual([]);
    expect((await b.todos.list("?date=2026-11-03")).body).toEqual([]);
    expect((await b.todos.list("?date=2026-11-10&includeOverdue=true")).body).toEqual([]);
    expect((await b.todos.list("?status=todo")).body).toEqual([]);
    expect((await b.todos.list("?date=2026-11-10&includeOverdue=true&status=todo")).body).toEqual([]);
  });

  it("each user only sees their own data when both have some", async () => {
    await seed(A, "a");
    await seed(B, "b");
    expect((await as(A).goals.list()).body.map((g: { title: string }) => g.title)).toEqual(["goal-a"]);
    expect((await as(B).goals.list()).body.map((g: { title: string }) => g.title)).toEqual(["goal-b"]);
    expect((await as(A).todos.list("?date=2026-11-10&includeOverdue=true")).body.map((t: { title: string }) => t.title)).toEqual(["todo-a"]);
    expect((await as(B).weeks.list()).body.map((w: { title: string }) => w.title)).toEqual(["week-b"]);
  });

  it("B gets 404 (same as for a nonexistent id) on PATCH/DELETE of A's documents and nothing changes", async () => {
    const { goal, week, todo } = await seed(A, "a");
    const before = JSON.stringify([await Goal.find().lean(), await Week.find().lean(), await Todo.find().lean()]);
    const b = as(B);
    const ghost = "f".repeat(24);
    const attempts: Array<[Awaited<ReturnType<typeof b.goals.patch>>, Awaited<ReturnType<typeof b.goals.patch>>]> = [
      [await b.goals.patch(goal.id, { title: "hijack" }), await b.goals.patch(ghost, { title: "hijack" })],
      [await b.goals.del(goal.id), await b.goals.del(ghost)],
      [await b.weeks.patch(week.id, { title: "hijack" }), await b.weeks.patch(ghost, { title: "hijack" })],
      [await b.weeks.del(week.id), await b.weeks.del(ghost)],
      [await b.todos.patch(todo.id, { status: "done" }), await b.todos.patch(ghost, { status: "done" })],
      [await b.todos.del(todo.id), await b.todos.del(ghost)],
    ];
    for (const [others, nonexistent] of attempts) {
      expect(others.status).toBe(404);
      expect(others).toEqual(nonexistent); // 존재 여부를 응답으로 구분할 수 없다
    }
    expect(JSON.stringify([await Goal.find().lean(), await Week.find().lean(), await Todo.find().lean()])).toBe(before);
  });

  it("B cannot attach new or existing items to A's parents (400)", async () => {
    const { goal, week } = await seed(A, "a");
    const mine = await seed(B, "b");
    const b = as(B);
    expect((await b.todos.create({ title: "x", weekId: week.id, date: "2026-11-03" })).status).toBe(400);
    expect((await b.weeks.create({ title: "x", goalId: goal.id, startDate: "2026-11-02", endDate: "2026-11-08" })).status).toBe(400);
    expect((await b.todos.patch(mine.todo.id, { weekId: week.id })).status).toBe(400);
    expect((await b.weeks.patch(mine.week.id, { goalId: goal.id })).status).toBe(400);
    // 아무것도 A의 부모로 옮겨지지 않았다
    expect(String((await Todo.findById(mine.todo.id).lean())!.weekId)).toBe(mine.week.id);
    expect(String((await Week.findById(mine.week.id).lean())!.goalId)).toBe(mine.goal.id);
    expect(await Todo.countDocuments({ weekId: week.id })).toBe(1);
  });

  it("progress and delete blocking only consider the caller's own data", async () => {
    const a = await seed(A, "a");
    await as(A).todos.patch(a.todo.id, { status: "done" });
    await seed(B, "b");
    // B의 주간계획 진행률은 B의 할 일만 반영한다 (A의 완료 항목이 섞이지 않는다)
    const bWeeks = (await as(B).weeks.list()).body;
    expect(bWeeks[0].progress).toEqual({ done: 0, total: 1, percent: 0 });
    const aWeeks = (await as(A).weeks.list()).body;
    expect(aWeeks[0].progress).toEqual({ done: 1, total: 1, percent: 100 });
    // 삭제 차단(409)은 본인 하위 항목 개수로 계산된다
    const blocked = await as(A).weeks.del(a.week.id);
    expect(blocked.status).toBe(409);
    expect(blocked.body.error).toContain("1개");
  });
});

describe("race: week deleted between the lookup and the update", () => {
  it("PATCH /api/weeks/[id] answers 404 instead of crashing with 500", async () => {
    const { week } = await seed(A, "a");
    const spy = vi.spyOn(Week, "findOneAndUpdate").mockReturnValueOnce({ lean: async () => null } as never);
    const res = await as(A).weeks.patch(week.id, { title: "renamed" });
    spy.mockRestore();
    expect(res.status).toBe(404);
  });
});

describe("defense in depth (data that bypassed the API)", () => {
  it("a foreign todo pointing at A's week is neither counted in A's progress nor shown to A", async () => {
    const a = await seed(A, "a");
    // API로는 만들 수 없는 상태: B 소유 문서가 A의 주간계획을 가리킨다
    await Todo.create({ userId: B.id, title: "foreign", status: "done", weekId: a.week.id, date: "2026-11-03" });
    const week = (await as(A).weeks.list()).body[0];
    expect(week.progress).toEqual({ done: 0, total: 1, percent: 0 });
    expect((await as(A).todos.list()).body.map((t: { title: string }) => t.title)).toEqual(["todo-a"]);
    // 하위 항목 개수(409)에도 포함되지 않아 A의 삭제 판단이 타인 데이터에 좌우되지 않는다
    await as(A).todos.del(a.todo.id);
    expect((await as(A).weeks.del(a.week.id)).status).toBe(200);
  });
});

describe("existing CRUD behaviour is unchanged for an authenticated owner", () => {
  it("create, list, update, delete and the 409 / 400 rules still work end to end", async () => {
    const api = as(A);
    const { goal, week, todo } = await seed(A, "a");
    expect((await api.todos.patch(todo.id, { title: "renamed", status: "doing" })).body).toMatchObject({ title: "renamed", status: "doing" });
    expect((await api.weeks.del(week.id)).status).toBe(409);
    expect((await api.goals.del(goal.id)).status).toBe(409);
    expect((await api.todos.create({ title: "x", date: "2026-11-03" })).status).toBe(400);
    expect((await api.todos.del(todo.id)).status).toBe(200);
    expect((await api.weeks.del(week.id)).status).toBe(200);
    expect((await api.goals.del(goal.id)).status).toBe(200);
    expect(await counts()).toEqual({ goals: 0, weeks: 0, todos: 0 });
  });
});
