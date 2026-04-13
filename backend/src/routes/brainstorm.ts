import { Router } from 'express';
import { requireAuth } from '../middleware/auth';
import { asyncHandler, HttpError } from '../lib/errors';
import { BrainstormIdea } from '../models/BrainstormIdea';
import { isAdminEmail } from '../lib/admin';
import { Types } from 'mongoose';

const ALLOWED_EMOJIS = ['👍', '🔥', '💡', '❤️', '✨'];

const router = Router();

// List all ideas (newest first)
router.get(
  '/brainstorm',
  requireAuth,
  asyncHandler(async (req, res) => {
    const category = req.query.category as string | undefined;
    const filter: Record<string, unknown> = {};
    if (category && ['feature', 'bug', 'fun', 'improvement'].includes(category)) {
      filter.category = category;
    }
    const ideas = await BrainstormIdea.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();

    const mapped = ideas.map((idea) => ({
      _id: idea._id.toString(),
      title: idea.title,
      description: idea.description,
      authorId: idea.authorId.toString(),
      authorName: idea.authorName,
      category: idea.category,
      voteCount: idea.votes.length,
      hasVoted: idea.votes.some((v: Types.ObjectId) => v.toString() === req.user!.id),
      reactions: ALLOWED_EMOJIS.map((emoji) => ({
        emoji,
        count: idea.reactions.filter((r: { emoji: string }) => r.emoji === emoji).length,
        hasReacted: idea.reactions.some(
          (r: { userId: Types.ObjectId; emoji: string }) =>
            r.emoji === emoji && r.userId.toString() === req.user!.id
        ),
      })),
      createdAt: idea.createdAt.toISOString(),
    }));

    res.json(mapped);
  })
);

// Create an idea
router.post(
  '/brainstorm',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { title, description, category } = req.body as {
      title?: string;
      description?: string;
      category?: string;
    };
    if (!title || !title.trim()) throw new HttpError(400, 'Title is required');
    if (title.length > 200) throw new HttpError(400, 'Title must be 200 characters or less');
    if (description && description.length > 2000) throw new HttpError(400, 'Description must be 2000 characters or less');

    const idea = await BrainstormIdea.create({
      title: title.trim(),
      description: (description || '').trim(),
      authorId: new Types.ObjectId(req.user!.id),
      authorName: req.user!.name,
      category: category && ['feature', 'bug', 'fun', 'improvement'].includes(category)
        ? category
        : 'feature',
    });

    res.status(201).json({
      _id: idea._id.toString(),
      title: idea.title,
      description: idea.description,
      authorId: idea.authorId.toString(),
      authorName: idea.authorName,
      category: idea.category,
      voteCount: 0,
      hasVoted: false,
      reactions: ALLOWED_EMOJIS.map((emoji) => ({ emoji, count: 0, hasReacted: false })),
      createdAt: idea.createdAt.toISOString(),
    });
  })
);

// Toggle vote
router.patch(
  '/brainstorm/:id/vote',
  requireAuth,
  asyncHandler(async (req, res) => {
    const userId = new Types.ObjectId(req.user!.id);

    // Try to remove vote first (atomic)
    const pulled = await BrainstormIdea.findOneAndUpdate(
      { _id: req.params.id, votes: userId },
      { $pull: { votes: userId } },
      { new: true }
    );
    if (pulled) {
      res.json({ voteCount: pulled.votes.length, hasVoted: false });
      return;
    }

    // Vote didn't exist, add it (atomic)
    const pushed = await BrainstormIdea.findOneAndUpdate(
      { _id: req.params.id },
      { $addToSet: { votes: userId } },
      { new: true }
    );
    if (!pushed) throw new HttpError(404, 'Idea not found');

    res.json({ voteCount: pushed.votes.length, hasVoted: true });
  })
);

// Toggle reaction
router.patch(
  '/brainstorm/:id/react',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { emoji } = req.body as { emoji?: string };
    if (!emoji || !ALLOWED_EMOJIS.includes(emoji)) {
      throw new HttpError(400, 'Invalid emoji');
    }

    const userId = new Types.ObjectId(req.user!.id);

    // Try to remove reaction first (atomic)
    const pulled = await BrainstormIdea.findOneAndUpdate(
      { _id: req.params.id, reactions: { $elemMatch: { userId, emoji } } },
      { $pull: { reactions: { userId, emoji } } },
      { new: true }
    );
    if (pulled) {
      res.json({ toggled: false });
      return;
    }

    // Reaction didn't exist, add it (atomic)
    const pushed = await BrainstormIdea.findOneAndUpdate(
      { _id: req.params.id },
      { $push: { reactions: { userId, emoji } } },
      { new: true }
    );
    if (!pushed) throw new HttpError(404, 'Idea not found');

    res.json({ toggled: true });
  })
);

// Delete idea (author or admin)
router.delete(
  '/brainstorm/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const idea = await BrainstormIdea.findById(req.params.id);
    if (!idea) throw new HttpError(404, 'Idea not found');

    const isAuthor = idea.authorId.toString() === req.user!.id;
    const isAdmin = isAdminEmail(req.user!.email);
    if (!isAuthor && !isAdmin) throw new HttpError(403, 'Not authorized');

    await idea.deleteOne();
    res.status(204).end();
  })
);

export default router;
