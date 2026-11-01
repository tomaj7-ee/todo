import { Goal } from "@/lib/models/goal";
import { goalCreate } from "@/lib/schemas";
import { json, readBody } from "@/lib/http";
import { authed } from "@/lib/auth/guard";
import { toGoalDTOs } from "@/lib/queries";

export const GET = authed(async (user, req: Request) => {
  const year = new URL(req.url).searchParams.get("year");
  const filter = year ? { year: Number(year) } : {};
  if (year && !Number.isInteger(Number(year))) return json({ error: "year는 정수여야 합니다" }, 400);
  const goals = await Goal.find({ ...filter, userId: user.id }).sort({ year: 1, _id: 1 }).lean();
  return json(await toGoalDTOs(goals, user.id));
});

export const POST = authed(async (user, req: Request) => {
  const input = goalCreate.parse(await readBody(req));
  const goal = await Goal.create({ ...input, userId: user.id });
  const [dto] = await toGoalDTOs([goal.toObject()], user.id);
  return json(dto, 201);
});
