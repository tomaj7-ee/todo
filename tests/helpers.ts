import { MongoMemoryServer } from "mongodb-memory-server";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "@/lib/db";
import { User } from "@/lib/models/user";
import { SESSION_COOKIE, createSession } from "@/lib/auth/session";

let server: MongoMemoryServer | null = null;

export async function startDb() {
  server = await MongoMemoryServer.create();
  await connectDB(server.getUri());
}

export async function clearDb() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

export async function stopDb() {
  await disconnectDB();
  await server?.stop();
  server = null;
}

/** 테스트용 사용자 + 세션을 만들고 요청에 붙일 쿠키를 돌려준다 (GitHub 호출 없이 인증 상태를 만든다). */
export async function createTestUser(username = "tester", githubId = username) {
  const user = await User.create({ githubId, username, avatarUrl: `https://avatars.example/${username}.png` });
  const { token } = await createSession(String(user._id));
  return { id: String(user._id), cookie: `${SESSION_COOKIE}=${token}` };
}
