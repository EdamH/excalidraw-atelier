import { Schema, model, Document, Types } from 'mongoose';

export const ACTIVITY_ACTIONS = [
  'created', 'edited', 'renamed', 'moved', 'tagged',
  'shared', 'unshared', 'deleted', 'restored',
  'duplicated', 'transferred',
] as const;

export type ActivityAction = (typeof ACTIVITY_ACTIONS)[number];

export interface IActivityLog extends Document {
  _id: Types.ObjectId;
  sceneId: string;
  userId: Types.ObjectId;
  action: ActivityAction;
  detail?: string;
  createdAt: Date;
}

const activityLogSchema = new Schema<IActivityLog>(
  {
    sceneId: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true, enum: ACTIVITY_ACTIONS },
    detail: { type: String },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

// TTL: auto-expire after 90 days
activityLogSchema.index({ createdAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
activityLogSchema.index({ sceneId: 1, createdAt: -1 });

export const ActivityLog = model<IActivityLog>('ActivityLog', activityLogSchema);
