import mongoose from "mongoose";

type Cache = { conn: typeof mongoose | null; promise: Promise<typeof mongoose> | null };

const globalForMongoose = globalThis as unknown as { _mongooseCache?: Cache };
const cache: Cache = (globalForMongoose._mongooseCache ??= { conn: null, promise: null });

export async function connectDB(uri: string | undefined = process.env.MONGODB_URI): Promise<typeof mongoose> {
  if (cache.conn) return cache.conn;
  if (!uri) throw new Error("MONGODB_URI is not set");
  cache.promise ??= mongoose.connect(uri, { bufferCommands: false });
  try {
    cache.conn = await cache.promise;
  } catch (e) {
    cache.promise = null;
    throw e;
  }
  return cache.conn;
}

export async function disconnectDB(): Promise<void> {
  if (cache.conn) await cache.conn.disconnect();
  cache.conn = null;
  cache.promise = null;
}
