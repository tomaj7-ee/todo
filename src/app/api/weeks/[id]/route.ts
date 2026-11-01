import { Goal } from "@/lib/models/goal";
import { Week } from "@/lib/models/week";
import { Todo } from "@/lib/models/todo";
import { weekUpdate } from "@/lib/schemas";
import { HttpError, assertId, json, readBody } from "@/lib/http";
import { authed } from "@/lib/auth/guard";
import { toWeekDTOs } from "@/lib/queries";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = authed(async (user, req: Request, { params }: Ctx) => {
  const id = assertId((await params).id);
  const input = weekUpdate.parse(await readBody(req));
  const current = await Week.findOne({ _id: id, userId: user.id }).lean();
  if (!current) throw new HttpError(404, "주간계획을 찾을 수 없습니다");
  if (input.goalId && !(await Goal.exists({ _id: input.goalId, userId: user.id }))) {
    throw new HttpError(400, "존재하지 않는 1년 목표입니다");
  }
  const start = input.startDate ?? current.startDate;
  const end = input.endDate ?? current.endDate;
  if (end < start) throw new HttpError(400, "종료일은 시작일 이후여야 합니다");
  const week = await Week.findOneAndUpdate({ _id: id, userId: user.id }, input, {
    returnDocument: "after",
    runValidators: true,
  }).lean();
  // 위 조회와 수정 사이에 삭제된 경우
  if (!week) throw new HttpError(404, "주간계획을 찾을 수 없습니다");
  const [dto] = await toWeekDTOs([week], user.id);
  return json(dto);
});

export const DELETE = authed(async (user, _req: Request, { params }: Ctx) => {
  const id = assertId((await params).id);
  if (!(await Week.exists({ _id: id, userId: user.id }))) throw new HttpError(404, "주간계획을 찾을 수 없습니다");
  const count = await Todo.countDocuments({ weekId: id, userId: user.id });
  if (count > 0) {
    throw new HttpError(409, `연결된 할 일 ${count}개가 있어 삭제할 수 없습니다. 먼저 할 일을 삭제하거나 다른 주간계획으로 옮기세요.`);
  }
  await Week.deleteOne({ _id: id, userId: user.id });
  return json({ ok: true });
});
