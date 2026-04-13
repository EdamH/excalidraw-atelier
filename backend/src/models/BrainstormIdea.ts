import { Schema, model, Document, Types } from 'mongoose';

export type IdeaCategory = 'feature' | 'bug' | 'fun' | 'improvement';

export interface IReaction {
  userId: Types.ObjectId;
  emoji: string;
}

export interface IBrainstormIdea extends Document {
  _id: Types.ObjectId;
  title: string;
  description: string;
  authorId: Types.ObjectId;
  authorName: string;
  category: IdeaCategory;
  votes: Types.ObjectId[];
  reactions: IReaction[];
  createdAt: Date;
}

const reactionSchema = new Schema<IReaction>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    emoji: { type: String, required: true },
  },
  { _id: false }
);

const brainstormIdeaSchema = new Schema<IBrainstormIdea>(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    authorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    authorName: { type: String, required: true },
    category: {
      type: String,
      enum: ['feature', 'bug', 'fun', 'improvement'],
      default: 'feature',
    },
    votes: { type: [Schema.Types.ObjectId], default: [] },
    reactions: { type: [reactionSchema], default: [] },
    createdAt: { type: Date, default: Date.now },
  },
  { versionKey: false }
);

brainstormIdeaSchema.index({ createdAt: -1 });

export const BrainstormIdea = model<IBrainstormIdea>('BrainstormIdea', brainstormIdeaSchema);
