// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AuthGate } from "@/components/AuthGate";
import type { GoalDTO, TodoDTO, WeekDTO } from "@/types";

afterEach(() => {
  cleanup();
  window.history.replaceState(null, "", "/");
  vi.unstubAllGlobals();
});

const week: WeekDTO = {
  id: "w1",
  title: "1주차",
  goalId: "g1",
  goalTitle: "건강",
  startDate: "2026-11-02",
  endDate: "2026-11-08",
  progress: { done: 0, total: 1, percent: 0 },
};
const goal: GoalDTO = { id: "g1", title: "건강", year: 2026, weeks: [week], progress: { done: 0, total: 1, percent: 0 } };
const todo: TodoDTO = {
  id: "t1",
  title: "비밀스러운 내 할 일",
  status: "todo",
  weekId: "w1",
  weekTitle: "1주차",
  goalId: "g1",
  goalTitle: "건강",
  date: "2000-01-01",
};
const me = { id: "u1", username: "octocat", avatarUrl: "https://avatars.example/octocat.png" };

interface Server {
  meStatus: number;
  logoutStatus: number;
  dataStatus: number;
  calls: { url: string; method: string }[];
}

function mockServer(init: Partial<Server> = {}): Server {
  const s: Server = { meStatus: 200, logoutStatus: 200, dataStatus: 200, calls: [], ...init };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, opts?: RequestInit) => {
      const method = opts?.method ?? "GET";
      s.calls.push({ url, method });
      const reply = (status: number, body: unknown) => ({ ok: status < 400, status, json: async () => body }) as Response;
      if (url === "/api/me") return s.meStatus === 200 ? reply(200, me) : reply(s.meStatus, { error: "로그인이 필요합니다" });
      if (url === "/auth/logout") return reply(s.logoutStatus, s.logoutStatus === 200 ? { ok: true } : { error: "fail" });
      if (s.dataStatus !== 200) return reply(s.dataStatus, { error: "로그인이 필요합니다" });
      if (url.startsWith("/api/goals")) return reply(200, [goal]);
      if (url.startsWith("/api/todos")) return reply(200, [todo]);
      return reply(200, []);
    }),
  );
  return s;
}
const dataCalls = (s: Server) => s.calls.filter((c) => /^\/api\/(goals|weeks|todos)/.test(c.url));

describe("login gate", () => {
  it("anonymous: shows only the GitHub login link, renders no board and calls no data API", async () => {
    const s = mockServer({ meStatus: 401 });
    render(<AuthGate />);
    const link = await screen.findByRole("link", { name: "GitHub로 로그인" });
    expect(link).toHaveAttribute("href", "/auth/github");
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(screen.queryByTestId("column-todo")).not.toBeInTheDocument();
    expect(screen.queryByText("비밀스러운 내 할 일")).not.toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 30));
    expect(dataCalls(s)).toHaveLength(0);
  });

  it("shows a message for a failed login (?auth_error=...) next to the login link", async () => {
    mockServer({ meStatus: 401 });
    window.history.replaceState(null, "", "/?auth_error=login_failed");
    render(<AuthGate />);
    expect(await screen.findByRole("alert")).toHaveTextContent("GitHub 로그인에 실패했습니다");
    expect(screen.getByRole("link", { name: "GitHub로 로그인" })).toBeInTheDocument();
  });

  it("authenticated: shows avatar and username and the working board", async () => {
    mockServer();
    render(<AuthGate />);
    const avatar = await screen.findByRole("img", { name: "octocat 프로필" });
    expect(avatar).toHaveAttribute("src", me.avatarUrl);
    expect(screen.getByText("octocat")).toBeInTheDocument();
    expect(await screen.findByTestId("card-t1")).toBeInTheDocument();
    expect(screen.getByRole("tablist")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "GitHub로 로그인" })).not.toBeInTheDocument();
  });

  it("shows a retry button when the server cannot be reached", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    render(<AuthGate />);
    expect(await screen.findByRole("alert")).toHaveTextContent("서버에 연결할 수 없습니다");
    expect(screen.getByRole("button", { name: "다시 시도" })).toBeInTheDocument();
  });
});

describe("logout and expiry", () => {
  it("logout posts to /auth/logout, returns to the login screen and leaves no todo data on screen", async () => {
    const s = mockServer();
    render(<AuthGate />);
    await screen.findByTestId("card-t1");
    expect(screen.getByText("비밀스러운 내 할 일")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(await screen.findByRole("link", { name: "GitHub로 로그인" })).toBeInTheDocument();
    expect(s.calls.some((c) => c.url === "/auth/logout" && c.method === "POST")).toBe(true);
    expect(screen.queryByText("비밀스러운 내 할 일")).not.toBeInTheDocument();
    expect(screen.queryByText("건강")).not.toBeInTheDocument();
    expect(screen.queryByText("octocat")).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain("비밀스러운 내 할 일");
  });

  it("stays logged in and reports an error when the server fails to log out", async () => {
    mockServer({ logoutStatus: 500 });
    render(<AuthGate />);
    await screen.findByTestId("card-t1");
    fireEvent.click(screen.getByRole("button", { name: "로그아웃" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("로그아웃에 실패했습니다");
    expect(screen.getByTestId("card-t1")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "GitHub로 로그인" })).not.toBeInTheDocument();
  });

  it("switches to the login screen when a data API starts returning 401 (expired session)", async () => {
    const s = mockServer();
    render(<AuthGate />);
    await screen.findByTestId("card-t1");
    s.dataStatus = 401;
    // 날짜를 바꾸면 일일 조회를 다시 호출하고, 그 응답이 401이다
    const filterDate = screen.getAllByLabelText("날짜")[0];
    fireEvent.change(filterDate, { target: { value: "2026-11-05" } });
    expect(await screen.findByRole("link", { name: "GitHub로 로그인" })).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("세션이 만료되었습니다");
    await waitFor(() => expect(screen.queryByTestId("card-t1")).not.toBeInTheDocument());
    expect(within(document.body).queryByText("비밀스러운 내 할 일")).not.toBeInTheDocument();
  });
});
