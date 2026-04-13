import { Schema, model, Document, Types } from 'mongoose';

export interface ILibrary extends Document {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  name: string;
  libraryItems: unknown;
  createdAt: Date;
  updatedAt: Date;
}

const librarySchema = new Schema<ILibrary>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: { type: String, required: true },
    libraryItems: { type: Schema.Types.Mixed, default: [] },
  },
  { versionKey: false, timestamps: true }
);

export const Library = model<ILibrary>('Library', librarySchema);
