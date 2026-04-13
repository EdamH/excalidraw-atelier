import { Types } from 'mongoose';
import { ActivityLog, ActivityAction } from '../models/ActivityLog';

/** Fire-and-forget activity logger — never blocks the request. */
export function logActivity(
  sceneId: string,
  userId: Types.ObjectId | string,
  action: ActivityAction,
  detail?: string
): void {
  ActivityLog.create({
    sceneId,
    userId: typeof userId === 'string' ? new Types.ObjectId(userId) : userId,
    action,
    detail,
  }).catch((err) => {
    console.error('Activity log write failed:', err);
  });
}
