import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import { describeTarget, migrateUserIds, parseArgs } from "../scripts/migrate-user-id.mjs";
import * as goals from "@/app/api/goals/route";
import * as todos from "@/app/api/todos/route";
import { clearDb, createTestUser, startDb, stopDb } from "./helpers";

beforeAll(startDb);
afterAll(stopDb);

let owner: { id: string; cookie: string };
let other: { id: string; cookie: string };
beforeEach(async () => {
  await clearDb();
  owner = await createTestUser("legacy-owner");
  other = await createTestUser("someone-else");
});

const col = (name: string) => mongoose.connection.collection(name);
const oid = (id: string) => new mongoose.Types.ObjectId(id);

/** 로그인 도입 전 형태(userId 없음)의 데이터를 DB에 직접 넣는다 */
async function insertLegacy() {
  const g = await col("goals").insertOne({ title: "legacy goal", year: 2026 });
  const w = await col("weeks").insertOne({ title: "legacy week", goalId: g.insertedId, startDate: "2026-11-02", endDate: "2026-11-08" });
  await col("todos").insertMany([
    { title: "legacy todo 1", status: "done", weekId: w.insertedId, date: "2026-11-03" },
    { title: "legacy todo 2", status: "todo", weekId: w.insertedId, date: "2026-11-04" },
  ]);
  return { goalId: g.insertedId, weekId: w.insertedId };
}
const snapshot = async () => JSON.stringify([await col("goals").find().toArray(), await col("weeks").find().toArray(), await col("todos").find().toArray()]);

describe("migrateUserIds", () => {
  it("assigns the user to every document that has no userId", async () => {
    await insertLegacy();
    const res = await migrateUserIds(mongoose.connection, { username: "legacy-owner" });
    expect(res.collections).toEqual({
      goals: { pending: 1, updated: 1 },
      weeks: { pending: 1, updated: 1 },
      todos: { pending: 2, updated: 2 },
    });
    for (const name of ["goals", "weeks", "todos"]) {
      const docs = await col(name).find().toArray();
      expect(docs.every((d) => String(d.userId) === owner.id)).toBe(true);
    }
  });

  it("treats userId: null as missing and never touches documents that already have an owner", async () => {
    await col("goals").insertOne({ title: "null owner", year: 2026, userId: null });
    await col("goals").insertOne({ title: "already owned", year: 2026, userId: oid(other.id) });
    await migrateUserIds(mongoose.connection, { username: "legacy-owner" });
    const byTitle = Object.fromEntries((await col("goals").find().toArray()).map((d) => [d.title, String(d.userId)]));
    expect(byTitle).toEqual({ "null owner": owner.id, "already owned": other.id });
  });

  it("is idempotent: a second run changes nothing", async () => {
    await insertLegacy();
    await migrateUserIds(mongoose.connection, { username: "legacy-owner" });
    const after1 = await snapshot();
    const res2 = await migrateUserIds(mongoose.connection, { username: "legacy-owner" });
    expect(res2.collections).toEqual({
      goals: { pending: 0, updated: 0 },
      weeks: { pending: 0, updated: 0 },
      todos: { pending: 0, updated: 0 },
    });
    expect(await snapshot()).toBe(after1);
  });

  it("fails without changing anything when the username does not exist", async () => {
    await insertLegacy();
    const before = await snapshot();
    await expect(migrateUserIds(mongoose.connection, { username: "nobody" })).rejects.toThrow(/찾을 수 없습니다/);
    await expect(migrateUserIds(mongoose.connection, { username: "" })).rejects.toThrow();
    expect(await snapshot()).toBe(before);
  });

  it("refuses an ambiguous username", async () => {
    await insertLegacy();
    await col("users").insertOne({ githubId: "dup", username: "legacy-owner" });
    const before = await snapshot();
    await expect(migrateUserIds(mongoose.connection, { username: "legacy-owner" })).rejects.toThrow(/둘 이상/);
    expect(await snapshot()).toBe(before);
  });

  it("--dry-run reports counts but leaves the database untouched", async () => {
    await insertLegacy();
    const before = await snapshot();
    const res = await migrateUserIds(mongoose.connection, { username: "legacy-owner", dryRun: true });
    expect(res.dryRun).toBe(true);
    expect(res.collections).toEqual({
      goals: { pending: 1, updated: 0 },
      weeks: { pending: 1, updated: 0 },
      todos: { pending: 2, updated: 0 },
    });
    expect(await snapshot()).toBe(before);
  });

  it("after migration the owner sees the legacy data through the API and other users do not", async () => {
    await insertLegacy();
    const req = (cookie: string, path: string) => new Request(`http://localhost${path}`, { headers: { cookie } });
    // 마이그레이션 전에는 로그인한 누구에게도 보이지 않는다
    expect(await (await goals.GET(req(owner.cookie, "/api/goals"))).json()).toEqual([]);
    await migrateUserIds(mongoose.connection, { username: "legacy-owner" });
    const list = await (await goals.GET(req(owner.cookie, "/api/goals"))).json();
    expect(list).toHaveLength(1);
    expect(list[0].weeks[0].progress).toEqual({ done: 1, total: 2, percent: 50 });
    expect((await (await todos.GET(req(owner.cookie, "/api/todos"))).json()).map((t: { title: string }) => t.title)).toEqual([
      "legacy todo 1",
      "legacy todo 2",
    ]);
    expect(await (await goals.GET(req(other.cookie, "/api/goals"))).json()).toEqual([]);
    expect(await (await todos.GET(req(other.cookie, "/api/todos"))).json()).toEqual([]);
  });
});

describe("CLI helpers", () => {
  it("parseArgs requires --username and supports --dry-run and --username=x", () => {
    expect(parseArgs(["--username", "octo"])).toEqual({ username: "octo", dryRun: false });
    expect(parseArgs(["--dry-run", "--username=octo"])).toEqual({ username: "octo", dryRun: true });
    expect(() => parseArgs([])).toThrow(/--username/);
    expect(() => parseArgs(["--username"])).toThrow(/--username/);
    expect(() => parseArgs(["--username", "octo", "--force"])).toThrow(/알 수 없는 옵션/);
  });

  it("describeTarget never prints credentials", () => {
    const out = describeTarget("mongodb+srv://someuser:s3cretpw@cluster0.example.net/todoapp?appName=x");
    expect(out).toBe("cluster0.example.net/todoapp");
    expect(out).not.toContain("s3cretpw");
    expect(out).not.toContain("someuser");
    expect(describeTarget("not a url")).toBe("(알 수 없는 연결 대상)");
  });
});
