import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

const goalSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  title: { type: String, required: true, trim: true, minlength: 1 },
  year: { type: Number, required: true, min: 1900, max: 3000 },
});

export type GoalDoc = InferSchemaType<typeof goalSchema>;
export const Goal: Model<GoalDoc> =
  (mongoose.models.Goal as Model<GoalDoc>) || mongoose.model<GoalDoc>("Goal", goalSchema);
