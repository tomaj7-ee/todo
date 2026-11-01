import mongoose from "mongoose";
import { ZodError } from "zod";
import { connectDB } from "@/lib/db";

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export const json = (data: unknown, status = 200) => Response.json(data, { status });

export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      await connectDB();
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status);
      if (e instanceof ZodError) return json({ error: e.issues.map((i) => i.message).join(", ") }, 400);
      if (e instanceof mongoose.Error.ValidationError || e instanceof mongoose.Error.CastError) {
        return json({ error: e.message }, 400);
      }
      console.error(e);
      return json({ error: "서버 오류가 발생했습니다" }, 500);
    }
  };
}

export async function readBody(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new HttpError(400, "요청 본문이 올바른 JSON이 아닙니다");
  }
}

export function assertId(id: string): string {
  if (!mongoose.isValidObjectId(id) || !/^[0-9a-fA-F]{24}$/.test(id)) throw new HttpError(400, "올바르지 않은 id 입니다");
  return id;
}
