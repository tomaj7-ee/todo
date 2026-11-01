import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const weekSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true, minlength: 1 },
  goalId: { type: Schema.Types.ObjectId, ref: "Goal", required: true, index: true },
  startDate: { type: String, required: true, match: DATE_RE, index: true },
  endDate: {
    type: String,
    required: true,
    match: DATE_RE,
    validate: {
      // create/save 시점의 모델 방어선. PATCH(쿼리 업데이트)에서는 this에 startDate가 없으므로
      // 라우트(weeks/[id])가 병합값으로 다시 검증한다.
      validator(this: { startDate?: string }, v: string) {
        return !this.startDate || v >= this.startDate;
      },
      message: "endDate must be on or after startDate",
    },
  },
});

export type WeekDoc = InferSchemaType<typeof weekSchema>;
export const Week: Model<WeekDoc> =
  (mongoose.models.Week as Model<WeekDoc>) || mongoose.model<WeekDoc>("Week", weekSchema);
