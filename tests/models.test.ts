import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { Goal } from "@/lib/models/goal";
import { Week } from "@/lib/models/week";
import { Todo } from "@/lib/models/todo";
import { clearDb, startDb, stopDb } from "./helpers";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);

// 모든 문서는 소유자(userId)가 필수이므로, 아래 테스트가 검증하려는 규칙만 실패하도록 유효한 소유자를 사용한다
const userId = new mongoose.Types.ObjectId();

describe("models", () => {
  it("Week requires goalId", async () => {
    await expect(Week.create({ userId, title: "w", startDate: "2026-11-02", endDate: "2026-11-08" })).rejects.toThrow(/goalId/);
  });

  it("Todo requires weekId", async () => {
    await expect(Todo.create({ userId, title: "t", date: "2026-11-02" })).rejects.toThrow(/weekId/);
  });

  it("Week rejects endDate before startDate", async () => {
    const g = await Goal.create({ userId, title: "g", year: 2026 });
    await expect(
      Week.create({ userId, title: "w", goalId: g._id, startDate: "2026-11-08", endDate: "2026-11-02" }),
    ).rejects.toThrow(/endDate/);
  });

  it("Todo defaults status to todo and rejects invalid status", async () => {
    const g = await Goal.create({ userId, title: "g", year: 2026 });
    const w = await Week.create({ userId, title: "w", goalId: g._id, startDate: "2026-11-02", endDate: "2026-11-08" });
    const t = await Todo.create({ userId, title: "t", weekId: w._id, date: "2026-11-02" });
    expect(t.status).toBe("todo");
    await expect(
      Todo.create({ userId, title: "t2", weekId: w._id, date: "2026-11-02", status: "bogus" as never }),
    ).rejects.toThrow(/status/);
    expect(mongoose.connection.readyState).toBe(1);
  });

  it.each([
    ["Goal", () => Goal.create({ title: "g", year: 2026 })],
    ["Week", () => Week.create({ title: "w", goalId: new mongoose.Types.ObjectId(), startDate: "2026-11-02", endDate: "2026-11-08" })],
    ["Todo", () => Todo.create({ title: "t", weekId: new mongoose.Types.ObjectId(), date: "2026-11-02" })],
  ])("%s requires userId", async (_name, create) => {
    await expect(create()).rejects.toThrow(/userId/);
  });
});
