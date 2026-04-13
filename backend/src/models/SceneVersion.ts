import { Schema, model, Document, Types } from 'mongoose';

export interface ISceneVersion extends Document {
  _id: Types.ObjectId;
  sceneId: string;
  elements: unknown;
  appState: unknown;
  createdBy: Types.ObjectId;
  createdAt: Date;
}

const sceneVersionSchema = new Schema<ISceneVersion>(
  {
    sceneId: { type: String, required: true },
    elements: { type: Schema.Types.Mixed, default: [] },
    appState: { type: Schema.Types.Mixed, default: {} },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

sceneVersionSchema.index({ sceneId: 1, createdAt: -1 });

export const SceneVersion = model<ISceneVersion>(
  'SceneVersion',
  sceneVersionSchema
);
