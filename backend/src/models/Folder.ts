import { Schema, model, Document, Types } from 'mongoose';

export interface IFolder extends Document {
  _id: Types.ObjectId;
  ownerId: Types.ObjectId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const folderSchema = new Schema<IFolder>(
  {
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 120,
    },
  },
  { versionKey: false, timestamps: true }
);

export const Folder = model<IFolder>('Folder', folderSchema);
