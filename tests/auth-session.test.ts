import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Session } from "@/lib/models/session";
import { User } from "@/lib/models/user";
import {
  SESSION_COOKIE,
  clearCookie,
  createSession,
  deleteSession,
  getUserFromRequest,
  hashToken,
  parseCookies,
  serializeCookie,
  isSecureCookie,
} from "@/lib/auth/session";
import { githubConfig } from "@/lib/config";
import { clearDb, startDb, stopDb } from "./helpers";

beforeAll(startDb);
afterAll(stopDb);
beforeEach(clearDb);
afterEach(() => vi.unstubAllEnvs());

const reqWith = (token?: string) =>
  new Request("http://localhost/x", { headers: token ? { cookie: `${SESSION_COOKIE}=${token}` } : {} });
const mkUser = (githubId = "1", username = "octo") =>
  User.create({ githubId, username, avatarUrl: "https://avatars.example/u.png" });

describe("User model", () => {
  it("requires githubId and rejects duplicates", async () => {
    await expect(User.create({ username: "x" })).rejects.toThrow(/githubId/);
    await User.init();
    await mkUser("42");
    await expect(mkUser("42", "other")).rejects.toThrow(/duplicate|E11000/i);
  });
});

describe("sessions", () => {
  it("stores only the sha256 hash of a 32+ byte token", async () => {
    const user = await mkUser();
    const { token } = await createSession(String(user._id));
    expect(Buffer.from(token, "base64url").length).toBeGreaterThanOrEqual(32);
    const docs = await Session.find().lean();
    expect(docs).toHaveLength(1);
    expect(docs[0].tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(docs[0])).not.toContain(token);
  });

  it("has a TTL index on expiresAt", async () => {
    await Session.init();
    const idx = await Session.collection.indexes();
    expect(idx.some((i) => i.key?.expiresAt === 1 && i.expireAfterSeconds === 0)).toBe(true);
  });

  it("getUserFromRequest returns the user for a valid cookie", async () => {
    const user = await mkUser();
    const { token } = await createSession(String(user._id));
    expect(await getUserFromRequest(reqWith(token))).toEqual({
      id: String(user._id),
      username: "octo",
      avatarUrl: "https://avatars.example/u.png",
    });
  });

  it("returns null for no cookie, unknown token and expired session", async () => {
    const user = await mkUser();
    expect(await getUserFromRequest(reqWith())).toBeNull();
    expect(await getUserFromRequest(reqWith("not-a-real-token"))).toBeNull();
    const { token } = await createSession(String(user._id));
    await Session.updateOne({ tokenHash: hashToken(token) }, { expiresAt: new Date(Date.now() - 1000) });
    expect(await getUserFromRequest(reqWith(token))).toBeNull();
  });

  it("returns null when the user no longer exists", async () => {
    const user = await mkUser();
    const { token } = await createSession(String(user._id));
    await User.deleteOne({ _id: user._id });
    expect(await getUserFromRequest(reqWith(token))).toBeNull();
  });

  it("deleteSession removes the document so the token stops working", async () => {
    const user = await mkUser();
    const { token } = await createSession(String(user._id));
    expect(await deleteSession(token)).toBe(true);
    expect(await Session.countDocuments()).toBe(0);
    expect(await getUserFromRequest(reqWith(token))).toBeNull();
    expect(await deleteSession(token)).toBe(false);
    expect(await deleteSession(null)).toBe(false);
  });
});

describe("cookies", () => {
  it("always serializes HttpOnly, SameSite=Lax and Path=/", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("APP_URL", "http://localhost:3000");
    const dev = serializeCookie("session", "abc", { maxAge: 10 });
    expect(dev).toContain("HttpOnly");
    expect(dev).toContain("SameSite=Lax");
    expect(dev).toContain("Path=/");
    expect(dev).toContain("Max-Age=10");
  });

  it.each([
    ["development on http://localhost", "development", "http://localhost:3000", false],
    ["production run locally on http://localhost (next start)", "production", "http://localhost:3000", false],
    ["production run locally on http://127.0.0.1", "production", "http://127.0.0.1:3000", false],
    ["production on an https domain", "production", "https://todo.example.com", true],
    ["production on a non-local http domain", "production", "http://todo.example.com", true],
    ["development with an https APP_URL", "development", "https://dev.example.com", true],
  ])("Secure attribute: %s", (_label, nodeEnv, appUrl, secure) => {
    vi.stubEnv("NODE_ENV", nodeEnv);
    vi.stubEnv("APP_URL", appUrl);
    const cookie = serializeCookie("session", "abc", { maxAge: 10 });
    expect(cookie.includes("Secure")).toBe(secure);
    expect(isSecureCookie()).toBe(secure);
  });

  it("clearCookie expires immediately and parseCookies reads values", () => {
    expect(clearCookie("session")).toContain("Max-Age=0");
    expect(parseCookies("a=1; session=xyz%20z; b=2")).toEqual({ a: "1", session: "xyz z", b: "2" });
    expect(parseCookies(null)).toEqual({});
    expect(parseCookies("bad=%E0%A4%A; ok=1")).toEqual({ ok: "1" });
  });
});

describe("github config", () => {
  it("reads credentials only from the environment and fails closed when missing", () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "");
    expect(() => githubConfig()).toThrow(/GITHUB_CLIENT_ID/);
    vi.stubEnv("GITHUB_CLIENT_ID", "id-from-env");
    vi.stubEnv("GITHUB_CLIENT_SECRET", "secret-from-env");
    expect(githubConfig()).toEqual({ clientId: "id-from-env", clientSecret: "secret-from-env" });
  });
});
