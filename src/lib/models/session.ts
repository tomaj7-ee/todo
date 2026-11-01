import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

// 원본 토큰은 저장하지 않고 sha256 해시만 저장한다. expiresAt 도달 시 MongoDB TTL 인덱스가 문서를 삭제한다.
const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

export type SessionDoc = InferSchemaType<typeof sessionSchema>;
export const Session: Model<SessionDoc> =
  (mongoose.models.Session as Model<SessionDoc>) || mongoose.model<SessionDoc>("Session", sessionSchema);
