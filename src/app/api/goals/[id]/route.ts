import { Goal } from "@/lib/models/goal";
import { Week } from "@/lib/models/week";
import { goalUpdate } from "@/lib/schemas";
import { HttpError, assertId, json, readBody } from "@/lib/http";
import { authed } from "@/lib/auth/guard";
import { toGoalDTOs } from "@/lib/queries";

type Ctx = { params: Promise<{ id: string }> };

export const PATCH = authed(async (user, req: Request, { params }: Ctx) => {
  const id = assertId((await params).id);
  const input = goalUpdate.parse(await readBody(req));
  const goal = await Goal.findOneAndUpdate({ _id: id, userId: user.id }, input, {
    returnDocument: "after",
    runValidators: true,
  }).lean();
  if (!goal) throw new HttpError(404, "목표를 찾을 수 없습니다");
  const [dto] = await toGoalDTOs([goal], user.id);
  return json(dto);
});

export const DELETE = authed(async (user, _req: Request, { params }: Ctx) => {
  const id = assertId((await params).id);
  const goal = await Goal.findOne({ _id: id, userId: user.id }).lean();
  if (!goal) throw new HttpError(404, "목표를 찾을 수 없습니다");
  const count = await Week.countDocuments({ goalId: id, userId: user.id });
  if (count > 0) {
    throw new HttpError(409, `연결된 주간계획 ${count}개가 있어 삭제할 수 없습니다. 먼저 주간계획을 삭제하거나 다른 목표로 옮기세요.`);
  }
  await Goal.deleteOne({ _id: id, userId: user.id });
  return json({ ok: true });
});
