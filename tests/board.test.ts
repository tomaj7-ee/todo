import { describe, expect, it, vi } from "vitest";
import { persistMove, planMove } from "@/lib/board";
import type { TodoDTO } from "@/types";

const todo = (id: string, status: TodoDTO["status"]): TodoDTO => ({
  id,
  title: id,
  status,
  weekId: "w",
  weekTitle: "W",
  goalId: "g",
  goalTitle: "G",
  date: "2026-11-02",
});

describe("planMove", () => {
  const list = [todo("a", "todo"), todo("b", "doing")];

  it("reports previous and target status when dropped on another column", () => {
    expect(planMove(list, "a", "done")).toEqual({ previous: "todo", target: "done" });
    expect(list[0].status).toBe("todo"); // 입력은 변경되지 않는다
  });

  it("is a no-op for the same column, unknown id or invalid target", () => {
    expect(planMove(list, "a", "todo")).toBeNull();
    expect(planMove(list, "zzz", "done")).toBeNull();
    expect(planMove(list, "a", "bogus")).toBeNull();
  });
});

describe("persistMove", () => {
  const prev = [todo("a", "doing")];
  // 함수형 업데이트를 흉내 내는 간단한 상태 저장소
  const store = (initial: TodoDTO[]) => {
    let state = initial;
    return {
      get: () => state,
      update: (fn: (t: TodoDTO[]) => TodoDTO[]) => {
        state = fn(state);
      },
    };
  };

  it("saves, applies optimistically and refreshes progress on success", async () => {
    const st = store(prev);
    const save = vi.fn().mockResolvedValue({});
    const onSaved = vi.fn();
    const ok = await persistMove({ todos: prev, id: "a", target: "done", save, update: st.update, onSaved, onError: vi.fn() });
    expect(ok).toBe(true);
    expect(save).toHaveBeenCalledWith("a", "done");
    expect(st.get()[0].status).toBe("done");
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it("does not call the server when dropped on the same column", async () => {
    const save = vi.fn();
    const ok = await persistMove({ todos: prev, id: "a", target: "doing", save, update: vi.fn(), onSaved: vi.fn(), onError: vi.fn() });
    expect(ok).toBe(false);
    expect(save).not.toHaveBeenCalled();
  });

  it("rolls back and reports the error when saving fails", async () => {
    const st = store(prev);
    const save = vi.fn().mockRejectedValue(new Error("boom"));
    const onSaved = vi.fn();
    const onError = vi.fn();
    const ok = await persistMove({ todos: prev, id: "a", target: "done", save, update: st.update, onSaved, onError });
    expect(ok).toBe(false);
    expect(st.get()[0].status).toBe("doing");
    expect(onError).toHaveBeenCalledWith("boom");
    expect(onSaved).not.toHaveBeenCalled();
  });

  it("rolling back one failed move does not undo another pending move", async () => {
    const list = [todo("a", "todo"), todo("b", "todo")];
    const st = store(list);
    let rejectA: (e: Error) => void = () => {};
    const saveA = () => new Promise((_, rej) => (rejectA = rej));
    const pendingA = persistMove({ todos: list, id: "a", target: "done", save: saveA, update: st.update, onSaved: vi.fn(), onError: vi.fn() });
    // A가 대기 중인 동안 B가 성공적으로 이동 (B 시점의 스냅샷은 A 이동이 반영된 상태)
    await persistMove({ todos: st.get(), id: "b", target: "doing", save: vi.fn().mockResolvedValue({}), update: st.update, onSaved: vi.fn(), onError: vi.fn() });
    rejectA(new Error("fail A"));
    await pendingA;
    const byId = Object.fromEntries(st.get().map((t) => [t.id, t.status]));
    expect(byId).toEqual({ a: "todo", b: "doing" });
  });
});
