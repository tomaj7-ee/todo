// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { App } from "@/components/App";
import { Board } from "@/components/Board";
import { TodoForm } from "@/components/TodoForm";
import { WeekForm } from "@/components/PlanForms";
import type { GoalDTO, TodoDTO, WeekDTO } from "@/types";

afterEach(cleanup);

const week: WeekDTO = {
  id: "w1",
  title: "1주차",
  goalId: "g1",
  goalTitle: "건강",
  startDate: "2026-11-02",
  endDate: "2026-11-08",
  progress: { done: 1, total: 4, percent: 25 },
};
const goal: GoalDTO = { id: "g1", title: "건강", year: 2026, weeks: [week], progress: { done: 1, total: 4, percent: 25 } };
const todo: TodoDTO = {
  id: "t1",
  title: "운동하기",
  status: "doing",
  weekId: "w1",
  weekTitle: "1주차",
  goalId: "g1",
  goalTitle: "건강",
  date: "2026-11-02",
};

describe("TodoForm", () => {
  it("cannot submit without a week and shows guidance when none exist", () => {
    const onSubmit = vi.fn();
    const { rerender } = render(<TodoForm weeks={[week]} defaultDate="2026-11-02" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "x" } });
    expect(screen.getByRole("button", { name: "추가" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("주간계획"), { target: { value: "w1" } });
    expect(screen.getByRole("button", { name: "추가" })).toBeEnabled();
    rerender(<TodoForm weeks={[]} defaultDate="2026-11-02" onSubmit={onSubmit} />);
    expect(screen.getByText(/먼저 주간계획을 만드세요/)).toBeInTheDocument();
  });
});

describe("WeekForm", () => {
  it("requires a goal and an end date on/after the start date", () => {
    render(<WeekForm goals={[goal]} onSubmit={vi.fn()} />);
    const submit = screen.getByRole("button", { name: "주간계획 추가" });
    fireEvent.change(screen.getByLabelText("주간계획 제목"), { target: { value: "w" } });
    fireEvent.change(screen.getByLabelText("시작일"), { target: { value: "2026-11-08" } });
    fireEvent.change(screen.getByLabelText("종료일"), { target: { value: "2026-11-02" } });
    fireEvent.change(screen.getByLabelText("1년 목표"), { target: { value: "g1" } });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByLabelText("종료일"), { target: { value: "2026-11-09" } });
    expect(submit).toBeEnabled();
    fireEvent.change(screen.getByLabelText("1년 목표"), { target: { value: "" } });
    expect(submit).toBeDisabled();
  });
});

describe("App (fetch mocked)", () => {
  let calls: { url: string; method: string }[];
  let deleteResponse: { status: number; body: unknown };

  beforeEach(() => {
    calls = [];
    deleteResponse = { status: 200, body: { ok: true } };
    vi.stubGlobal("confirm", () => true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push({ url, method });
        const respond = (status: number, body: unknown) =>
          ({ ok: status < 400, status, json: async () => body }) as Response;
        if (method === "DELETE") return respond(deleteResponse.status, deleteResponse.body);
        if (url.startsWith("/api/goals")) return respond(200, [goal]);
        if (url.startsWith("/api/todos")) return respond(200, [todo]);
        return respond(200, []);
      }),
    );
  });

  it("shows the todo with its week and goal, plus week and goal progress", async () => {
    render(<App />);
    const card = await screen.findByTestId("card-t1");
    expect(within(card).getByText(/1주차 → 건강/)).toBeInTheDocument();
    expect(within(screen.getByTestId("column-doing")).getByTestId("card-t1")).toBeInTheDocument();
    const weekBox = screen.getByTestId("week-w1");
    expect(within(weekBox).getByText("1/4 (25%)")).toBeInTheDocument();
    expect(within(screen.getByTestId("goal-g1")).getAllByText("1/4 (25%)").length).toBeGreaterThanOrEqual(2);
    expect(within(weekBox).getByText(/목표: 건강/)).toBeInTheDocument();
  });

  it("shows the server's blocking message on 409 and keeps the item listed", async () => {
    deleteResponse = { status: 409, body: { error: "연결된 할 일 4개가 있어 삭제할 수 없습니다." } };
    render(<App />);
    const weekBox = await screen.findByTestId("week-w1");
    fireEvent.click(within(weekBox).getByRole("button", { name: "삭제" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("연결된 할 일 4개");
    expect(screen.getByTestId("week-w1")).toBeInTheDocument();
  });

  it("removes the item from the list when the delete succeeds", async () => {
    let deleted = false;
    const base = globalThis.fetch as unknown as (u: string, i?: RequestInit) => Promise<Response>;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        if (init?.method === "DELETE") deleted = true;
        if (deleted && url.startsWith("/api/goals")) {
          return { ok: true, status: 200, json: async () => [{ ...goal, weeks: [] }] } as Response;
        }
        return base(url, init);
      }),
    );
    render(<App />);
    const weekBox = await screen.findByTestId("week-w1");
    fireEvent.click(within(weekBox).getByRole("button", { name: "삭제" }));
    await waitFor(() => expect(screen.queryByTestId("week-w1")).not.toBeInTheDocument());
  });

  it("queries by date (daily), weekId (weekly) and year (yearly)", async () => {
    render(<App />);
    await screen.findByTestId("card-t1");
    expect(calls.some((c) => /\/api\/todos\?date=\d{4}-\d{2}-\d{2}&includeOverdue=true$/.test(c.url))).toBe(true);

    fireEvent.click(screen.getByRole("tab", { name: "주간" }));
    fireEvent.change((await screen.findAllByLabelText("주간계획"))[0], { target: { value: "w1" } });
    await waitFor(() => expect(calls.some((c) => c.url.includes("/api/todos?weekId=w1"))).toBe(true));

    fireEvent.click(screen.getByRole("tab", { name: "1년" }));
    await waitFor(() => expect(calls.some((c) => /\/api\/goals\?year=\d{4}/.test(c.url))).toBe(true));
    expect(await screen.findByLabelText("1년 목표 조회")).toBeInTheDocument();
  });

  it("changes status through the card's select and sends PATCH", async () => {
    render(<App />);
    const card = await screen.findByTestId("card-t1");
    fireEvent.change(within(card).getByLabelText("상태 변경"), { target: { value: "done" } });
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH" && c.url === "/api/todos/t1")).toBe(true));
  });
});

describe("App behaviours (stateful fetch mock)", () => {
  let todos: TodoDTO[];
  let calls: { url: string; method: string; body?: string }[];
  let patchTodoFails: boolean;
  let patchWeekFails: boolean;

  beforeEach(() => {
    todos = [{ ...todo }];
    calls = [];
    patchTodoFails = false;
    patchWeekFails = false;
    vi.stubGlobal("confirm", () => true);
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string, init?: RequestInit) => {
        const method = init?.method ?? "GET";
        calls.push({ url, method, body: init?.body as string | undefined });
        const respond = (status: number, body: unknown) =>
          ({ ok: status < 400, status, json: async () => body }) as Response;
        if (method === "PATCH" && url.startsWith("/api/todos/")) {
          if (patchTodoFails) return respond(500, { error: "서버 오류" });
          const patch = JSON.parse(init!.body as string);
          todos = todos.map((t) => (t.id === url.split("/").pop() ? { ...t, ...patch } : t));
          return respond(200, todos[0]);
        }
        if (method === "PATCH" && url.startsWith("/api/weeks/")) {
          return patchWeekFails ? respond(400, { error: "종료일은 시작일 이후여야 합니다" }) : respond(200, week);
        }
        if (url.startsWith("/api/goals")) return respond(200, [goal]);
        if (url.startsWith("/api/todos")) return respond(200, todos);
        return respond(200, []);
      }),
    );
  });

  it("moves the card to the new column and keeps it there after the refresh", async () => {
    render(<App />);
    const card = await screen.findByTestId("card-t1");
    fireEvent.change(within(card).getByLabelText("상태 변경"), { target: { value: "done" } });
    await waitFor(() => expect(within(screen.getByTestId("column-done")).getByTestId("card-t1")).toBeInTheDocument());
    // 저장 후 재조회가 끝나도 완료 컬럼에 남아 있고, 진행률 재조회(goals)도 일어났다
    await waitFor(() => expect(calls.filter((c) => c.method === "GET" && c.url === "/api/goals").length).toBeGreaterThanOrEqual(2));
    expect(within(screen.getByTestId("column-done")).getByTestId("card-t1")).toBeInTheDocument();
  });

  it("rolls the card back and shows an error when the status update fails", async () => {
    patchTodoFails = true;
    render(<App />);
    const card = await screen.findByTestId("card-t1");
    fireEvent.change(within(card).getByLabelText("상태 변경"), { target: { value: "done" } });
    expect(await screen.findByRole("alert")).toHaveTextContent("서버 오류");
    expect(within(screen.getByTestId("column-doing")).getByTestId("card-t1")).toBeInTheDocument();
  });

  it("lets the year input be typed digit by digit and queries that year", async () => {
    render(<App />);
    await screen.findByTestId("card-t1");
    fireEvent.click(screen.getByRole("tab", { name: "1년" }));
    const input = await screen.findByLabelText("조회 연도");
    for (const v of ["2", "20", "202", "2027"]) fireEvent.change(input, { target: { value: v } });
    expect(input).toHaveValue("2027");
    await waitFor(() => expect(calls.some((c) => c.url === "/api/goals?year=2027")).toBe(true));
  });

  it("new todo form follows the selected daily date", async () => {
    render(<App />);
    await screen.findByTestId("card-t1");
    const [filterDate, formDate] = screen.getAllByLabelText("날짜");
    fireEvent.change(filterDate, { target: { value: "2026-11-05" } });
    await waitFor(() => expect((screen.getAllByLabelText("날짜")[1] as HTMLInputElement).value).toBe("2026-11-05"));
    expect(formDate).toBeDefined();
    fireEvent.change(screen.getByLabelText("제목"), { target: { value: "새 일" } });
    fireEvent.change(screen.getByLabelText("주간계획"), { target: { value: "w1" } });
    fireEvent.click(screen.getByRole("button", { name: "추가" }));
    await waitFor(() => {
      const post = calls.find((c) => c.method === "POST" && c.url === "/api/todos");
      expect(post && JSON.parse(post.body!)).toMatchObject({ title: "새 일", date: "2026-11-05", weekId: "w1" });
    });
  });

  it("keeps the week edit form open (with the user's input) when saving fails", async () => {
    patchWeekFails = true;
    render(<App />);
    const weekBox = await screen.findByTestId("week-w1");
    fireEvent.click(within(weekBox).getByRole("button", { name: "수정" }));
    const title = within(screen.getByTestId("week-w1")).getByLabelText("주간계획 제목");
    fireEvent.change(title, { target: { value: "바뀐 이름" } });
    fireEvent.click(within(screen.getByTestId("week-w1")).getByRole("button", { name: "저장" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("종료일은 시작일 이후");
    expect(within(screen.getByTestId("week-w1")).getByLabelText("주간계획 제목")).toHaveValue("바뀐 이름");
  });
});

describe("Board overdue date styling", () => {
  const mk = (id: string, status: TodoDTO["status"], date: string): TodoDTO => ({ ...todo, id, title: id, status, date });

  it("shows unfinished todos with a past date in bold red, but not done, current or future ones", () => {
    const list = [
      mk("late-todo", "todo", "2026-11-01"),
      mk("late-doing", "doing", "2026-11-09"),
      mk("late-done", "done", "2026-11-01"),
      mk("today-todo", "todo", "2026-11-10"),
      mk("future-todo", "todo", "2026-11-11"),
    ];
    render(<Board todos={list} today="2026-11-10" onMove={vi.fn()} onEdit={vi.fn()} onDelete={vi.fn()} />);
    for (const id of ["late-todo", "late-doing"]) {
      const el = screen.getByTestId(`date-${id}`);
      expect(el).toHaveClass("font-bold");
      expect(el).toHaveClass("text-red-600");
    }
    for (const id of ["late-done", "today-todo", "future-todo"]) {
      const el = screen.getByTestId(`date-${id}`);
      expect(el).not.toHaveClass("font-bold");
      expect(el).not.toHaveClass("text-red-600");
    }
  });
});
