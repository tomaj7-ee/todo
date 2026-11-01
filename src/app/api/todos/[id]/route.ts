import { Todo } from "@/lib/models/todo";
import { Week } from "@/lib/models/week";
import { todoUpdate } from "@/lib/schemas";
import { HttpError, assertId, json, readBody } from "@/lib/http";
import { authed } from "@/lib/auth/guard";
import { toTodoDTOs } from "@/lib/queries";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = authed(async (user, req: Request, { params }: Ctx) => {
  const id = assertId((await params).id);
  const input = todoUpdate.parse(await readBody(req));
  if (input.weekId && !(await Week.exists({ _id: input.weekId, userId: user.id }))) {
    throw new HttpError(400, "존재하지 않는 주간계획입니다");
  }
  const todo = await Todo.findOneAndUpdate({ _id: id, userId: user.id }, input, {
    returnDocument: "after",
    runValidators: true,
  }).lean();
  if (!todo) throw new HttpError(404, "할 일을 찾을 수 없습니다");
  const [dto] = await toTodoDTOs([todo], user.id);
  return json(dto);
});

export const DELETE = authed(async (user, _req: Request, { params }: Ctx) => {
  const id = assertId((await params).id);
  const res = await Todo.deleteOne({ _id: id, userId: user.id });
  if (res.deletedCount === 0) throw new HttpError(404, "할 일을 찾을 수 없습니다");
  return json({ ok: true });
});
