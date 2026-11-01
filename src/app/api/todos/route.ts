import { Todo, STATUSES } from "@/lib/models/todo";
import { Week } from "@/lib/models/week";
import { dateParam, idParam, todoCreate } from "@/lib/schemas";
import { HttpError, json, readBody } from "@/lib/http";
import { authed } from "@/lib/auth/guard";
import { toTodoDTOs } from "@/lib/queries";

export const GET = authed(async (user, req: Request) => {
  const sp = new URL(req.url).searchParams;
  let filter: Record<string, unknown> = {};
  const date = sp.get("date");
  const weekId = sp.get("weekId");
  const status = sp.get("status");
  // includeOverdue=true: 선택한 날짜의 할 일 + 그 이전 날짜의 미완료(done 아님) 할 일
  if (date && sp.get("includeOverdue") === "true") {
    const d = dateParam.parse(date);
    filter = { $or: [{ date: d }, { date: { $lt: d }, status: { $ne: "done" } }] };
  } else if (date) filter.date = dateParam.parse(date);
  if (weekId) filter.weekId = idParam.parse(weekId);
  if (status) {
    if (!(STATUSES as readonly string[]).includes(status)) throw new HttpError(400, "올바르지 않은 status 입니다");
    filter = filter.$or ? { $and: [filter, { status }] } : { ...filter, status };
  }
  // 소유자 조건은 $or/$and로 만든 필터 바깥에서 항상 AND로 결합된다
  const todos = await Todo.find({ userId: user.id, ...filter })
    .sort({ date: 1, _id: 1 })
    .lean();
  return json(await toTodoDTOs(todos, user.id));
});

export const POST = authed(async (user, req: Request) => {
  const input = todoCreate.parse(await readBody(req));
  if (!(await Week.exists({ _id: input.weekId, userId: user.id }))) throw new HttpError(400, "존재하지 않는 주간계획입니다");
  const todo = await Todo.create({ ...input, userId: user.id });
  const [dto] = await toTodoDTOs([todo.toObject()], user.id);
  return json(dto, 201);
});
