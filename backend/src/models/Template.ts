import { Schema, model, Document, Types } from 'mongoose';

export interface ITemplate extends Document {
  _id: Types.ObjectId;
  name: string;
  description: string;
  elements: unknown;
  appState: unknown;
  createdBy: Types.ObjectId | null;
  usageCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const templateSchema = new Schema<ITemplate>(
  {
    name: { type: String, required: true },
    description: { type: String, required: true },
    elements: { type: Schema.Types.Mixed, default: [] },
    appState: { type: Schema.Types.Mixed, default: {} },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    usageCount: { type: Number, default: 0 },
  },
  { versionKey: false, timestamps: true }
);

templateSchema.index({ name: 1 }, { unique: true });

export const Template = model<ITemplate>('Template', templateSchema);
