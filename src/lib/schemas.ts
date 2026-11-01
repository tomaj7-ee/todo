import { z } from "zod";

const isRealDate = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
};
const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "날짜는 YYYY-MM-DD 형식이어야 합니다")
  .refine(isRealDate, "존재하지 않는 날짜입니다");
const title = z.string().trim().min(1, "제목을 입력하세요").max(200);
const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, "올바르지 않은 id 입니다");
const status = z.enum(["todo", "doing", "done"]);

export const goalCreate = z.object({ title, year: z.number().int().min(1900).max(3000) }).strict();
export const goalUpdate = goalCreate.partial().strict();

export const weekCreate = z
  .object({ title, goalId: objectId, startDate: date, endDate: date })
  .strict()
  .refine((v) => v.endDate >= v.startDate, { message: "종료일은 시작일 이후여야 합니다", path: ["endDate"] });
export const weekUpdate = z
  .object({ title, goalId: objectId, startDate: date, endDate: date })
  .partial()
  .strict();

export const todoCreate = z.object({ title, date, weekId: objectId, status: status.optional() }).strict();
export const todoUpdate = z.object({ title, date, weekId: objectId, status }).partial().strict();

export const idParam = objectId;
export const dateParam = date;
