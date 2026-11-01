import type { GoalDTO, Status, TodoDTO, WeekDTO } from "@/types";

/** 데이터 API가 401을 돌려줄 때 window로 발행하는 이벤트 (AuthGate가 구독해 로그인 화면으로 전환) */
export const UNAUTHORIZED_EVENT = "auth:unauthorized";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    cache: "no-store",
  });
  const data = await res.json().catch(() => ({}));
  // 세션 만료 등으로 401이면 UI가 로그인 화면으로 전환하도록 알린다
  if (res.status === 401 && typeof window !== "undefined") window.dispatchEvent(new Event(UNAUTHORIZED_EVENT));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error ?? "요청에 실패했습니다");
  return data as T;
}

const send = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
});

export interface GoalInput {
  title: string;
  year: number;
}
export interface WeekInput {
  title: string;
  goalId: string;
  startDate: string;
  endDate: string;
}
export interface TodoInput {
  title: string;
  weekId: string;
  date: string;
  status?: Status;
}

export const api = {
  listGoals: (year?: number) => request<GoalDTO[]>(`/api/goals${year ? `?year=${year}` : ""}`),
  createGoal: (v: GoalInput) => request<GoalDTO>("/api/goals", send("POST", v)),
  updateGoal: (id: string, v: Partial<GoalInput>) => request<GoalDTO>(`/api/goals/${id}`, send("PATCH", v)),
  deleteGoal: (id: string) => request<{ ok: true }>(`/api/goals/${id}`, send("DELETE")),

  listWeeks: (q: { goalId?: string; date?: string } = {}) => {
    const sp = new URLSearchParams(q as Record<string, string>);
    return request<WeekDTO[]>(`/api/weeks?${sp}`);
  },
  createWeek: (v: WeekInput) => request<WeekDTO>("/api/weeks", send("POST", v)),
  updateWeek: (id: string, v: Partial<WeekInput>) => request<WeekDTO>(`/api/weeks/${id}`, send("PATCH", v)),
  deleteWeek: (id: string) => request<{ ok: true }>(`/api/weeks/${id}`, send("DELETE")),

  listTodos: (q: { date?: string; weekId?: string; status?: Status; includeOverdue?: boolean } = {}) => {
    const sp = new URLSearchParams(
      Object.entries(q)
        .filter(([, v]) => v)
        .map(([k, v]) => [k, String(v)]),
    );
    return request<TodoDTO[]>(`/api/todos?${sp}`);
  },
  createTodo: (v: TodoInput) => request<TodoDTO>("/api/todos", send("POST", v)),
  updateTodo: (id: string, v: Partial<TodoInput>) => request<TodoDTO>(`/api/todos/${id}`, send("PATCH", v)),
  deleteTodo: (id: string) => request<{ ok: true }>(`/api/todos/${id}`, send("DELETE")),
};
