import { Schema, model, Document, Types } from 'mongoose';

export type ShareRole = 'viewer' | 'editor';

export interface IShare {
  userId: Types.ObjectId;
  role: ShareRole;
}

export interface IScene extends Document<string> {
  _id: string;
  title: string;
  ownerId: Types.ObjectId;
  shares: IShare[];
  elements: unknown;
  appState: unknown;
  createdAt: Date;
  updatedAt: Date;
  lastSnapshotAt: Date | null;
  deletedAt: Date | null;
  lastEditedById: Types.ObjectId | null;
  lastEditedAt: Date | null;
  folderId: Types.ObjectId | null;
  tags: string[];
  starredBy: Types.ObjectId[];
}

const shareSchema = new Schema<IShare>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, enum: ['viewer', 'editor'], required: true },
  },
  { _id: false }
);

const sceneSchema = new Schema<IScene>(
  {
    _id: { type: String, required: true },
    title: { type: String, required: true },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    shares: { type: [shareSchema], default: [] },
    elements: { type: Schema.Types.Mixed, default: [] },
    appState: { type: Schema.Types.Mixed, default: {} },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
    lastSnapshotAt: { type: Date, default: null },
    deletedAt: { type: Date, default: null },
    lastEditedById: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    lastEditedAt: { type: Date, default: null },
    folderId: {
      type: Schema.Types.ObjectId,
      ref: 'Folder',
      default: null,
    },
    tags: { type: [String], default: [] },
    starredBy: {
      type: [Schema.Types.ObjectId],
      ref: 'User',
      default: [],
    },
  },
  { versionKey: false, _id: false }
);

sceneSchema.index({ 'shares.userId': 1 });
sceneSchema.index({ deletedAt: 1 });
sceneSchema.index({ ownerId: 1, folderId: 1 });
sceneSchema.index({ tags: 1 });
sceneSchema.index({ starredBy: 1 });
sceneSchema.index({ ownerId: 1, deletedAt: 1, updatedAt: -1 });
sceneSchema.index({ 'shares.userId': 1, deletedAt: 1, updatedAt: -1 });

export const Scene = model<IScene>('Scene', sceneSchema);
