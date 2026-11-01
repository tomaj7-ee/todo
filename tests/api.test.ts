import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import * as goals from "@/app/api/goals/route";
import * as goalById from "@/app/api/goals/[id]/route";
import * as weeks from "@/app/api/weeks/route";
import * as weekById from "@/app/api/weeks/[id]/route";
import * as todos from "@/app/api/todos/route";
import * as todoById from "@/app/api/todos/[id]/route";
import { clearDb, createTestUser, startDb, stopDb } from "./helpers";

beforeAll(startDb);
afterAll(stopDb);
// 기존 테스트는 모두 로그인한 사용자 A로 실행된다
let cookie = "";
beforeEach(async () => {
  await clearDb();
  cookie = (await createTestUser("user-a")).cookie;
});

const req = (method: string, path: string, body?: unknown) =>
  new Request(`http://localhost${path}`, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const call = async (res: Response | Promise<Response>) => {
  const r = await res;
  return { status: r.status, body: await r.json() };
};

async function mkGoal(title = "G", year = 2026) {
  return (await call(goals.POST(req("POST", "/api/goals", { title, year })))).body;
}
async function mkWeek(goalId: string, title = "W", startDate = "2026-11-02", endDate = "2026-11-08") {
  return (await call(weeks.POST(req("POST", "/api/weeks", { title, goalId, startDate, endDate })))).body;
}
async function mkTodo(weekId: string, title = "T", date = "2026-11-02") {
  return (await call(todos.POST(req("POST", "/api/todos", { title, weekId, date })))).body;
}
const setStatus = (id: string, status: string) =>
  call(todoById.PATCH(req("PATCH", `/api/todos/${id}`, { status }), ctx(id)));

describe("CRUD", () => {
  it("goal create/list/update/delete", async () => {
    const g = await mkGoal();
    expect((await call(goals.GET(req("GET", "/api/goals")))).body).toHaveLength(1);
    const upd = await call(goalById.PATCH(req("PATCH", `/api/goals/${g.id}`, { title: "G2", year: 2027 }), ctx(g.id)));
    expect(upd.body).toMatchObject({ title: "G2", year: 2027 });
    expect((await call(goalById.DELETE(req("DELETE", `/api/goals/${g.id}`), ctx(g.id)))).status).toBe(200);
    expect((await call(goals.GET(req("GET", "/api/goals")))).body).toHaveLength(0);
  });

  it("week and todo create/update/delete reflect in lists", async () => {
    const g = await mkGoal();
    const w = await mkWeek(g.id);
    const t = await mkTodo(w.id);
    expect(t).toMatchObject({ status: "todo", weekTitle: "W", goalTitle: "G" });
    const w2 = await mkWeek(g.id, "W2", "2026-11-09", "2026-11-15");
    const upd = await call(todoById.PATCH(req("PATCH", `/api/todos/${t.id}`, { title: "T2", weekId: w2.id }), ctx(t.id)));
    expect(upd.body).toMatchObject({ title: "T2", weekTitle: "W2" });
    expect((await call(todoById.DELETE(req("DELETE", `/api/todos/${t.id}`), ctx(t.id)))).status).toBe(200);
    expect((await call(todos.GET(req("GET", "/api/todos")))).body).toHaveLength(0);
    const wu = await call(weekById.PATCH(req("PATCH", `/api/weeks/${w.id}`, { title: "Wx" }), ctx(w.id)));
    expect(wu.body.title).toBe("Wx");
  });
});

describe("required parents and validation", () => {
  it("todo without or with unknown weekId -> 400", async () => {
    const noWeek = await call(todos.POST(req("POST", "/api/todos", { title: "t", date: "2026-11-02" })));
    expect(noWeek.status).toBe(400);
    const ghost = await call(
      todos.POST(req("POST", "/api/todos", { title: "t", date: "2026-11-02", weekId: "a".repeat(24) })),
    );
    expect(ghost.status).toBe(400);
  });

  it("week without or with unknown goalId -> 400", async () => {
    const noGoal = await call(
      weeks.POST(req("POST", "/api/weeks", { title: "w", startDate: "2026-11-02", endDate: "2026-11-08" })),
    );
    expect(noGoal.status).toBe(400);
    const ghost = await call(
      weeks.POST(
        req("POST", "/api/weeks", { title: "w", goalId: "b".repeat(24), startDate: "2026-11-02", endDate: "2026-11-08" }),
      ),
    );
    expect(ghost.status).toBe(400);
  });

  it("endDate before startDate -> 400 (create and update)", async () => {
    const g = await mkGoal();
    const bad = await call(
      weeks.POST(req("POST", "/api/weeks", { title: "w", goalId: g.id, startDate: "2026-11-08", endDate: "2026-11-02" })),
    );
    expect(bad.status).toBe(400);
    const w = await mkWeek(g.id);
    const upd = await call(weekById.PATCH(req("PATCH", `/api/weeks/${w.id}`, { endDate: "2026-10-01" }), ctx(w.id)));
    expect(upd.status).toBe(400);
  });

  it("invalid ObjectId and invalid status -> 400", async () => {
    expect((await call(todoById.PATCH(req("PATCH", "/api/todos/xyz", { status: "done" }), ctx("xyz")))).status).toBe(400);
    const g = await mkGoal();
    const w = await mkWeek(g.id);
    const t = await mkTodo(w.id);
    expect((await setStatus(t.id, "bogus")).status).toBe(400);
    expect((await call(todos.GET(req("GET", "/api/todos?status=bogus")))).status).toBe(400);
  });

  it("unknown id -> 404", async () => {
    const id = "c".repeat(24);
    expect((await call(todoById.DELETE(req("DELETE", `/api/todos/${id}`), ctx(id)))).status).toBe(404);
    expect((await call(goalById.DELETE(req("DELETE", `/api/goals/${id}`), ctx(id)))).status).toBe(404);
  });
});

describe("delete blocking (409)", () => {
  it("week with todos cannot be deleted; message has count; doc kept; deletable once empty", async () => {
    const g = await mkGoal();
    const w = await mkWeek(g.id);
    const t1 = await mkTodo(w.id);
    const t2 = await mkTodo(w.id, "T2");
    const res = await call(weekById.DELETE(req("DELETE", `/api/weeks/${w.id}`), ctx(w.id)));
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("2개");
    expect((await call(weeks.GET(req("GET", "/api/weeks")))).body).toHaveLength(1);
    await call(todoById.DELETE(req("DELETE", `/api/todos/${t1.id}`), ctx(t1.id)));
    expect((await call(weekById.DELETE(req("DELETE", `/api/weeks/${w.id}`), ctx(w.id)))).status).toBe(409);
    await call(todoById.DELETE(req("DELETE", `/api/todos/${t2.id}`), ctx(t2.id)));
    expect((await call(weekById.DELETE(req("DELETE", `/api/weeks/${w.id}`), ctx(w.id)))).status).toBe(200);
  });

  it("goal with weeks cannot be deleted; deletable once empty", async () => {
    const g = await mkGoal();
    const w = await mkWeek(g.id);
    const res = await call(goalById.DELETE(req("DELETE", `/api/goals/${g.id}`), ctx(g.id)));
    expect(res.status).toBe(409);
    expect(res.body.error).toContain("1개");
    expect((await call(goals.GET(req("GET", "/api/goals")))).body).toHaveLength(1);
    await call(weekById.DELETE(req("DELETE", `/api/weeks/${w.id}`), ctx(w.id)));
    expect((await call(goalById.DELETE(req("DELETE", `/api/goals/${g.id}`), ctx(g.id)))).status).toBe(200);
  });
});

describe("progress", () => {
  const weekProgress = async (id: string) =>
    (await call(weeks.GET(req("GET", "/api/weeks")))).body.find((w: { id: string }) => w.id === id).progress;

  it("0 todos -> {0,0,0}", async () => {
    const g = await mkGoal();
    const w = await mkWeek(g.id);
    expect(await weekProgress(w.id)).toEqual({ done: 0, total: 0, percent: 0 });
  });

  it("1 of 4 done -> 25, 2 of 4 -> 50, then back and delete", async () => {
    const g = await mkGoal();
    const w = await mkWeek(g.id);
    const ts = [];
    for (let i = 0; i < 4; i++) ts.push(await mkTodo(w.id, `T${i}`));
    await setStatus(ts[0].id, "done");
    expect((await weekProgress(w.id)).percent).toBe(25);
    await setStatus(ts[1].id, "done");
    expect((await weekProgress(w.id)).percent).toBe(50);
    await setStatus(ts[1].id, "doing");
    expect((await weekProgress(w.id)).percent).toBe(25);
    await call(todoById.DELETE(req("DELETE", `/api/todos/${ts[0].id}`), ctx(ts[0].id)));
    expect(await weekProgress(w.id)).toEqual({ done: 0, total: 3, percent: 0 });
  });

  it("changing weekId updates both weeks", async () => {
    const g = await mkGoal();
    const a = await mkWeek(g.id, "A");
    const b = await mkWeek(g.id, "B", "2026-11-09", "2026-11-15");
    const t = await mkTodo(a.id);
    await setStatus(t.id, "done");
    expect((await weekProgress(a.id)).percent).toBe(100);
    await call(todoById.PATCH(req("PATCH", `/api/todos/${t.id}`, { weekId: b.id }), ctx(t.id)));
    expect(await weekProgress(a.id)).toEqual({ done: 0, total: 0, percent: 0 });
    expect(await weekProgress(b.id)).toEqual({ done: 1, total: 1, percent: 100 });
  });

  it("goal lists its weeks and averages weekly progress (50 and 100 -> 75)", async () => {
    const g = await mkGoal();
    const a = await mkWeek(g.id, "A");
    const b = await mkWeek(g.id, "B", "2026-11-09", "2026-11-15");
    const a1 = await mkTodo(a.id);
    await mkTodo(a.id);
    const b1 = await mkTodo(b.id);
    await setStatus(a1.id, "done");
    await setStatus(b1.id, "done");
    const list = (await call(goals.GET(req("GET", "/api/goals")))).body;
    expect(list[0].weeks.map((w: { title: string }) => w.title)).toEqual(["A", "B"]);
    expect(list[0].progress.percent).toBe(75);
  });

  it("goal with no weeks -> 0", async () => {
    await mkGoal();
    expect((await call(goals.GET(req("GET", "/api/goals")))).body[0].progress.percent).toBe(0);
  });
});

describe("period queries", () => {
  it("todos filter by date, weekId, status; goals by year; weeks by goalId and date", async () => {
    const g26 = await mkGoal("G26", 2026);
    await mkGoal("G27", 2027);
    const w1 = await mkWeek(g26.id, "W1", "2026-11-02", "2026-11-08");
    const w2 = await mkWeek(g26.id, "W2", "2026-11-09", "2026-11-15");
    const t1 = await mkTodo(w1.id, "a", "2026-11-03");
    await mkTodo(w1.id, "b", "2026-11-04");
    await mkTodo(w2.id, "c", "2026-11-10");
    await setStatus(t1.id, "done");

    const byDate = (await call(todos.GET(req("GET", "/api/todos?date=2026-11-04")))).body;
    expect(byDate.map((t: { title: string }) => t.title)).toEqual(["b"]);
    const byWeek = (await call(todos.GET(req("GET", `/api/todos?weekId=${w1.id}`)))).body;
    expect(byWeek).toHaveLength(2);
    const byStatus = (await call(todos.GET(req("GET", "/api/todos?status=done")))).body;
    expect(byStatus.map((t: { title: string }) => t.title)).toEqual(["a"]);

    const byYear = (await call(goals.GET(req("GET", "/api/goals?year=2026")))).body;
    expect(byYear.map((g: { title: string }) => g.title)).toEqual(["G26"]);
    const wByGoal = (await call(weeks.GET(req("GET", `/api/weeks?goalId=${g26.id}`)))).body;
    expect(wByGoal).toHaveLength(2);
    const wByDate = (await call(weeks.GET(req("GET", "/api/weeks?date=2026-11-10")))).body;
    expect(wByDate.map((w: { title: string }) => w.title)).toEqual(["W2"]);
    expect((await call(todos.GET(req("GET", "/api/todos?date=bad")))).status).toBe(400);
  });
});

describe("additional validation", () => {
  it("rejects impossible calendar dates", async () => {
    const g = await mkGoal();
    const w = await mkWeek(g.id);
    const badTodo = await call(todos.POST(req("POST", "/api/todos", { title: "t", weekId: w.id, date: "2026-02-31" })));
    expect(badTodo.status).toBe(400);
    const badWeek = await call(
      weeks.POST(req("POST", "/api/weeks", { title: "w", goalId: g.id, startDate: "2026-13-01", endDate: "2026-13-02" })),
    );
    expect(badWeek.status).toBe(400);
    expect((await call(todos.GET(req("GET", "/api/todos?date=2026-02-30")))).status).toBe(400);
  });

  it("PATCH with an unknown parent -> 400 and leaves the document unchanged", async () => {
    const g = await mkGoal();
    const w = await mkWeek(g.id);
    const t = await mkTodo(w.id);
    const ghost = "d".repeat(24);
    expect((await call(todoById.PATCH(req("PATCH", `/api/todos/${t.id}`, { weekId: ghost }), ctx(t.id)))).status).toBe(400);
    expect((await call(weekById.PATCH(req("PATCH", `/api/weeks/${w.id}`, { goalId: ghost }), ctx(w.id)))).status).toBe(400);
    const after = (await call(todos.GET(req("GET", "/api/todos")))).body;
    expect(after[0].weekId).toBe(w.id);
  });

  it("invalid ids on goals and weeks [id] routes -> 400, unknown -> 404", async () => {
    expect((await call(goalById.PATCH(req("PATCH", "/api/goals/nope", { title: "x" }), ctx("nope")))).status).toBe(400);
    expect((await call(goalById.DELETE(req("DELETE", "/api/goals/nope"), ctx("nope")))).status).toBe(400);
    expect((await call(weekById.PATCH(req("PATCH", "/api/weeks/nope", { title: "x" }), ctx("nope")))).status).toBe(400);
    expect((await call(weekById.DELETE(req("DELETE", "/api/weeks/nope"), ctx("nope")))).status).toBe(400);
    const id = "e".repeat(24);
    expect((await call(goalById.PATCH(req("PATCH", `/api/goals/${id}`, { title: "x" }), ctx(id)))).status).toBe(404);
    expect((await call(weekById.PATCH(req("PATCH", `/api/weeks/${id}`, { title: "x" }), ctx(id)))).status).toBe(404);
  });

  it("malformed JSON body -> 400", async () => {
    const bad = new Request("http://localhost/api/goals", {
      method: "POST",
      body: "{nope",
      headers: { "content-type": "application/json", cookie },
    });
    expect((await call(goals.POST(bad))).status).toBe(400);
  });
});

describe("includeOverdue (미완료 할 일 이월)", () => {
  it("returns the day's todos plus earlier unfinished ones, never earlier done ones or later ones", async () => {
    const g = await mkGoal();
    const w = await mkWeek(g.id);
    await mkTodo(w.id, "old-todo", "2026-11-01");
    const oldDoing = await mkTodo(w.id, "old-doing", "2026-11-02");
    const oldDone = await mkTodo(w.id, "old-done", "2026-11-03");
    await mkTodo(w.id, "today", "2026-11-05");
    const todayDone = await mkTodo(w.id, "today-done", "2026-11-05");
    await mkTodo(w.id, "future", "2026-11-09");
    await setStatus(oldDoing.id, "doing");
    await setStatus(oldDone.id, "done");
    await setStatus(todayDone.id, "done");

    const titles = async (qs: string) =>
      (await call(todos.GET(req("GET", `/api/todos?${qs}`)))).body.map((t: { title: string }) => t.title).sort();

    // 당일 항목은 완료 여부와 관계없이 포함, 이전 날짜는 미완료만, 이후 날짜는 제외
    expect(await titles("date=2026-11-05&includeOverdue=true")).toEqual(["old-doing", "old-todo", "today", "today-done"]);
    // 옵션이 없으면 기존처럼 정확히 그 날짜만
    expect(await titles("date=2026-11-05")).toEqual(["today", "today-done"]);
    // status 필터와 함께 쓸 수 있다
    expect(await titles("date=2026-11-05&includeOverdue=true&status=doing")).toEqual(["old-doing"]);
  });

  it("an overdue todo disappears from later days once it is done", async () => {
    const g = await mkGoal();
    const w = await mkWeek(g.id);
    const t = await mkTodo(w.id, "late", "2026-11-01");
    const list = async () =>
      (await call(todos.GET(req("GET", "/api/todos?date=2026-11-10&includeOverdue=true")))).body.map((x: { title: string }) => x.title);
    expect(await list()).toEqual(["late"]);
    await setStatus(t.id, "done");
    expect(await list()).toEqual([]);
  });
});
