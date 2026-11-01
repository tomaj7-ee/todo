#!/usr/bin/env node
/**
 * 기존(로그인 도입 전) 데이터에 userId를 채우는 마이그레이션.
 *
 *   npm run migrate:user-id -- --username <github username> [--dry-run]
 *
 * - userId가 없거나 null인 goals / weeks / todos만 지정한 GitHub 사용자의 _id로 갱신한다.
 * - 이미 userId가 있는 문서는 건드리지 않는다. 여러 번 실행해도 결과가 같다(멱등).
 * - 대상 사용자는 GitHub 로그인을 한 번 이상 해서 users 컬렉션에 있어야 한다.
 * - 연결 문자열은 환경변수 MONGODB_URI(.env / .env.local)에서만 읽는다.
 */
import mongoose from "mongoose";
import { pathToFileURL } from "node:url";

export const COLLECTIONS = ["goals", "weeks", "todos"];

const MISSING_USER_ID = { $or: [{ userId: { $exists: false } }, { userId: null }] };

/**
 * @param {import("mongoose").Connection} connection
 * @param {{ username: string, dryRun?: boolean }} opts
 */
export async function migrateUserIds(connection, { username, dryRun = false }) {
  if (!username) throw new Error("username이 필요합니다");
  const db = connection.db;
  if (!db) throw new Error("데이터베이스에 연결되어 있지 않습니다");

  const users = await db.collection("users").find({ username }).limit(2).toArray();
  if (users.length === 0) {
    throw new Error(`사용자 '${username}'을(를) 찾을 수 없습니다. 먼저 GitHub로 한 번 로그인하세요.`);
  }
  if (users.length > 1) {
    throw new Error(`username '${username}'을(를) 가진 사용자가 둘 이상입니다. 수동으로 확인하세요.`);
  }
  const user = users[0];

  const collections = {};
  for (const name of COLLECTIONS) {
    const col = db.collection(name);
    const pending = await col.countDocuments(MISSING_USER_ID);
    let updated = 0;
    if (!dryRun && pending > 0) {
      const res = await col.updateMany(MISSING_USER_ID, { $set: { userId: user._id } });
      updated = res.modifiedCount;
    }
    collections[name] = { pending, updated };
  }
  return { username, userId: String(user._id), dryRun, collections };
}

/** @param {string[]} argv */
export function parseArgs(argv) {
  const args = { username: "", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--username") args.username = argv[++i] ?? "";
    else if (a.startsWith("--username=")) args.username = a.slice("--username=".length);
    else throw new Error(`알 수 없는 옵션: ${a}`);
  }
  if (!args.username) throw new Error("--username <github username> 이(가) 필요합니다");
  return args;
}

/** 비밀번호가 출력되지 않도록 접속 대상을 host/db 형태로만 표시한다. */
export function describeTarget(uri) {
  try {
    const u = new URL(uri);
    return `${u.host}${u.pathname}`;
  } catch {
    return "(알 수 없는 연결 대상)";
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI 환경변수가 설정되지 않았습니다 (.env 또는 .env.local)");

  console.log(`대상 DB: ${describeTarget(uri)}${args.dryRun ? "  (dry-run: 변경하지 않음)" : ""}`);
  await mongoose.connect(uri);
  try {
    const result = await migrateUserIds(mongoose.connection, args);
    console.log(`사용자: ${result.username} (${result.userId})`);
    for (const [name, { pending, updated }] of Object.entries(result.collections)) {
      console.log(`  ${name}: userId 없음 ${pending}개${result.dryRun ? "" : ` -> ${updated}개 갱신`}`);
    }
  } finally {
    await mongoose.disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(`오류: ${e.message}`);
    process.exit(1);
  });
}
