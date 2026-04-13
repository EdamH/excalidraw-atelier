import { Schema, model, Document, Types } from 'mongoose';

export type AwardType =
  | 'gold'
  | 'silver'
  | 'bronze'
  | 'night-owl'
  | 'most-scenes'
  | 'berserker'
  | 'template-creator'
  | 'community-man';

export interface IWeeklyAward extends Document {
  _id: Types.ObjectId;
  userId: Types.ObjectId;
  awardType: AwardType;
  weekStart: Date;
  rank: number | null;
  value: number;
  createdAt: Date;
}

const weeklyAwardSchema = new Schema<IWeeklyAward>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    awardType: {
      type: String,
      enum: [
        'gold', 'silver', 'bronze',
        'night-owl', 'most-scenes', 'berserker',
        'template-creator', 'community-man',
      ],
      required: true,
    },
    weekStart: { type: Date, required: true },
    rank: { type: Number, default: null },
    value: { type: Number, required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

weeklyAwardSchema.index({ userId: 1, weekStart: -1 });
weeklyAwardSchema.index({ weekStart: 1, awardType: 1 });

export const WeeklyAward = model<IWeeklyAward>('WeeklyAward', weeklyAwardSchema);
