import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";
import { DATE_RE } from "./week";

export const STATUSES = ["todo", "doing", "done"] as const;

const todoSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    title: { type: String, required: true, trim: true, minlength: 1 },
    status: { type: String, enum: STATUSES, default: "todo", required: true, index: true },
    weekId: { type: Schema.Types.ObjectId, ref: "Week", required: true, index: true },
    date: { type: String, required: true, match: DATE_RE, index: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type TodoDoc = InferSchemaType<typeof todoSchema>;
export const Todo: Model<TodoDoc> =
  (mongoose.models.Todo as Model<TodoDoc>) || mongoose.model<TodoDoc>("Todo", todoSchema);
