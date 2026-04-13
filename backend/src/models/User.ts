import { Schema, model, Document, Types } from 'mongoose';

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  name: string;
  createdAt: Date;
  disabled: boolean;
  storageQuota?: number;
  longestStreak: number;
  petName?: string;
  petLastActions?: {
    feed?: Date;
    bathe?: Date;
    pet?: Date;
  };
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true },
    createdAt: { type: Date, default: Date.now },
    disabled: { type: Boolean, default: false },
    storageQuota: { type: Number, default: 500 * 1024 * 1024 },
    longestStreak: { type: Number, default: 0 },
    petName: { type: String, default: undefined, maxlength: 20 },
    petLastActions: {
      feed: { type: Date },
      bathe: { type: Date },
      pet: { type: Date },
    },
  },
  { versionKey: false }
);

export const User = model<IUser>('User', userSchema);
