import { Goal } from "@/lib/models/goal";
import { Week } from "@/lib/models/week";
import { dateParam, idParam, weekCreate } from "@/lib/schemas";
import { HttpError, json, readBody } from "@/lib/http";
import { authed } from "@/lib/auth/guard";
import { toWeekDTOs } from "@/lib/queries";

export const GET = authed(async (user, req: Request) => {
  const sp = new URL(req.url).searchParams;
  const filter: Record<string, unknown> = { userId: user.id };
  const goalId = sp.get("goalId");
  const date = sp.get("date");
  if (goalId) filter.goalId = idParam.parse(goalId);
  if (date) {
    const d = dateParam.parse(date);
    filter.startDate = { $lte: d };
    filter.endDate = { $gte: d };
  }
  const weeks = await Week.find(filter).sort({ startDate: 1, _id: 1 }).lean();
  return json(await toWeekDTOs(weeks, user.id));
});

export const POST = authed(async (user, req: Request) => {
  const input = weekCreate.parse(await readBody(req));
  if (!(await Goal.exists({ _id: input.goalId, userId: user.id }))) throw new HttpError(400, "존재하지 않는 1년 목표입니다");
  const week = await Week.create({ ...input, userId: user.id });
  const [dto] = await toWeekDTOs([week.toObject()], user.id);
  return json(dto, 201);
});
