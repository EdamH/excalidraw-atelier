import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { User } from '../models/User';
import { Scene } from '../models/Scene';
import { Folder } from '../models/Folder';
import { HttpError, asyncHandler } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import {
  computeUserStorageBytes,
  DEFAULT_STORAGE_QUOTA,
} from '../lib/quota';
import { computePetMood, pickPetSpeech } from '../lib/pet';

const router = Router();

router.use(requireAuth);

// Escape special regex chars so a literal user input is treated as text.
function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// GET /users/search?q=<text>&exclude=<id>,<id>
//
// Returns up to 10 users whose email OR name contains <text> (case-insensitive),
// excluding the caller and any IDs in `exclude`. Used by the frontend share
// dialog autocomplete. The query must be at least 1 character.
router.get(
  '/users/search',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, 'Unauthenticated');

    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (!q) {
      res.json([]);
      return;
    }

    const exclude = new Set<string>([req.user.id]);
    const excludeRaw =
      typeof req.query.exclude === 'string' ? req.query.exclude : '';
    for (const part of excludeRaw.split(',')) {
      const id = part.trim();
      if (id && Types.ObjectId.isValid(id)) {
        exclude.add(id);
      }
    }

    const re = new RegExp(escapeRegex(q), 'i');
    const matches = await User.find({
      $and: [
        { _id: { $nin: Array.from(exclude).map((i) => new Types.ObjectId(i)) } },
        { $or: [{ email: re }, { name: re }] },
      ],
    })
      .select({ _id: 1, email: 1, name: 1 })
      .sort({ email: 1 })
      .limit(10)
      .lean();

    res.json(
      matches.map((u) => ({
        id: u._id.toString(),
        email: u.email,
        name: u.name,
      }))
    );
  })
);

// GET /users/me/stats — self-service usage stats.
//
// Returns scene count, element totals, bytes used, largest scene, and
// quota usage. oldestScene/newestScene are returned as null because the
// Scene schema does not track createdAt — the team lead asked us to skip
// rather than fabricate those values.
interface StatsAggRow {
  _id: string;
  title: string;
  size: number;
  elementCount: number;
  createdAt: Date | null;
  lastEditedAt: Date | null;
}

router.get(
  '/users/me/stats',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, 'Unauthenticated');
    const userId = req.user.id;
    const ownerObjId = new Types.ObjectId(userId);

    const sceneRows = await Scene.aggregate<StatsAggRow>([
      { $match: { ownerId: ownerObjId, deletedAt: null } },
      {
        $project: {
          _id: 1,
          title: 1,
          createdAt: { $ifNull: ['$createdAt', null] },
          lastEditedAt: { $ifNull: ['$lastEditedAt', null] },
          size: { $bsonSize: '$$ROOT' },
          elementCount: { $size: { $ifNull: ['$elements', []] } },
        },
      },
    ]);

    const sceneCount = sceneRows.length;
    let totalElements = 0;
    let largest: StatsAggRow | null = null;
    let oldest: StatsAggRow | null = null;
    let newest: StatsAggRow | null = null;
    for (const row of sceneRows) {
      totalElements += row.elementCount;
      if (!largest || row.size > largest.size) {
        largest = row;
      }
      if (row.createdAt) {
        if (!oldest || row.createdAt < oldest.createdAt!) {
          oldest = row;
        }
        if (!newest || row.createdAt > newest.createdAt!) {
          newest = row;
        }
      }
    }

    const [bytesUsed, userDoc] = await Promise.all([
      computeUserStorageBytes(userId),
      User.findById(userId).select({ storageQuota: 1, longestStreak: 1, petName: 1, createdAt: 1, petLastActions: 1 }).lean(),
    ]);
    const limit = userDoc?.storageQuota ?? DEFAULT_STORAGE_QUOTA;

    // Compute lastActivityAt: most recent lastEditedAt across all owned non-trashed scenes
    let lastActivityAt: Date | null = null;
    for (const row of sceneRows) {
      if (row.lastEditedAt) {
        const d = new Date(row.lastEditedAt);
        if (!lastActivityAt || d > lastActivityAt) {
          lastActivityAt = d;
        }
      }
    }
    // Fall back to user createdAt if no scene edits exist
    if (!lastActivityAt && userDoc?.createdAt) {
      lastActivityAt = new Date(userDoc.createdAt);
    }

    // Compute drawing streak: consecutive days with edits (ending today or yesterday)
    const editDays = new Set<string>();
    for (const row of sceneRows) {
      if (row.createdAt) editDays.add(new Date(row.createdAt).toISOString().slice(0, 10));
      if (row.lastEditedAt) editDays.add(new Date(row.lastEditedAt).toISOString().slice(0, 10));
    }
    const sortedDays = Array.from(editDays).sort().reverse();
    let drawingStreak = 0;
    const today = new Date().toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    // Start counting from today or yesterday
    let startIdx = sortedDays.indexOf(today);
    if (startIdx === -1) startIdx = sortedDays.indexOf(yesterday);
    if (startIdx >= 0) {
      const startDate = new Date(sortedDays[startIdx]);
      for (let i = 0; i < sortedDays.length; i++) {
        const expected = new Date(startDate);
        expected.setDate(expected.getDate() - i);
        const expectedStr = expected.toISOString().slice(0, 10);
        if (editDays.has(expectedStr)) {
          drawingStreak++;
        } else {
          break;
        }
      }
    }

    // Update longest streak high-water mark (fire-and-forget)
    const longestStreak = Math.max(drawingStreak, userDoc?.longestStreak ?? 0);
    if (drawingStreak > (userDoc?.longestStreak ?? 0)) {
      User.updateOne(
        { _id: ownerObjId },
        { $set: { longestStreak: drawingStreak } },
      ).catch((err) => console.error('longestStreak update failed:', err));
    }

    // Compute pet mood
    const petMood = computePetMood(drawingStreak, sceneCount, lastActivityAt);
    const petSpeech = sceneCount === 0 ? 'draw me something? ...please? *puppy eyes*' : pickPetSpeech(petMood);

    // Word cloud: top words from scene titles
    const STOP_WORDS = new Set(['the', 'a', 'an', 'and', 'or', 'of', 'to', 'in', 'for', 'on', 'is', 'it', 'by', 'at', 'my', 'with', 'from', 'this', 'that', 'as', 'new', 'copy', 'untitled']);
    const wordCounts = new Map<string, number>();
    for (const row of sceneRows) {
      const words = row.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/);
      for (const w of words) {
        if (w.length >= 2 && !STOP_WORDS.has(w)) {
          wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
        }
      }
    }
    const topWords = Array.from(wordCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([word]) => word);

    res.json({
      sceneCount,
      totalElements,
      totalBytes: bytesUsed,
      drawingStreak,
      longestStreak,
      largestScene: largest
        ? { id: largest._id, title: largest.title, size: largest.size }
        : null,
      oldestScene: oldest
        ? { id: oldest._id, title: oldest.title, createdAt: oldest.createdAt!.toISOString() }
        : null,
      newestScene: newest
        ? { id: newest._id, title: newest.title, createdAt: newest.createdAt!.toISOString() }
        : null,
      quotaUsage: {
        used: bytesUsed,
        limit,
        over: bytesUsed > limit,
      },
      topWords,
      pet: {
        mood: petMood,
        speech: petSpeech,
        name: userDoc?.petName ?? null,
        lastActivityAt: lastActivityAt?.toISOString() ?? null,
        lastActions: userDoc?.petLastActions ? {
          feed: userDoc.petLastActions.feed?.toISOString() ?? null,
          bathe: userDoc.petLastActions.bathe?.toISOString() ?? null,
          pet: userDoc.petLastActions.pet?.toISOString() ?? null,
        } : null,
      },
    });
  })
);

// GET /users/me/badges — achievement badges
router.get(
  '/users/me/badges',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, 'Unauthenticated');
    const userId = req.user.id;
    const ownerObjId = new Types.ObjectId(userId);

    const [scenes, folders, allTags, has100Elements] = await Promise.all([
      Scene.find({ ownerId: ownerObjId, deletedAt: null })
        .select('_id title shares createdAt lastEditedAt tags')
        .lean(),
      Folder.countDocuments({ ownerId: ownerObjId }),
      Scene.distinct('tags', { ownerId: ownerObjId, deletedAt: null }),
      Scene.countDocuments({
        ownerId: ownerObjId,
        deletedAt: null,
        $expr: { $gte: [{ $size: { $ifNull: ['$elements', []] } }, 100] },
      }).then((c) => c > 0),
    ]);

    interface Badge {
      id: string;
      name: string;
      description: string;
      earned: boolean;
      earnedAt?: string;
    }

    const badges: Badge[] = [];

    // First Drawing
    badges.push({
      id: 'first-drawing',
      name: 'First Drawing',
      description: 'Created your first scene',
      earned: scenes.length >= 1,
      earnedAt: scenes.length >= 1
        ? scenes.reduce((min, s) => {
            const d = s.createdAt ? new Date(s.createdAt) : null;
            return d && (!min || d < min) ? d : min;
          }, null as Date | null)?.toISOString()
        : undefined,
    });

    // Prolific
    badges.push({
      id: 'prolific',
      name: 'Prolific',
      description: 'Created 10 or more scenes',
      earned: scenes.length >= 10,
    });

    // 100 Elements
    badges.push({
      id: '100-elements',
      name: '100 Elements',
      description: 'A scene with 100+ elements',
      earned: has100Elements,
    });

    // Shared with 5
    const uniqueSharees = new Set<string>();
    for (const s of scenes) {
      for (const share of s.shares || []) {
        uniqueSharees.add(share.userId.toString());
      }
    }
    badges.push({
      id: 'shared-5',
      name: 'Shared with 5',
      description: 'Shared scenes with 5+ people',
      earned: uniqueSharees.size >= 5,
    });

    // Night Owl
    const nightEdit = scenes.some((s) => {
      if (!s.lastEditedAt) return false;
      const h = new Date(s.lastEditedAt).getUTCHours();
      return h >= 22 || h < 4;
    });
    badges.push({
      id: 'night-owl',
      name: 'Night Owl',
      description: 'Edited a scene between 10 PM and 4 AM',
      earned: nightEdit,
    });

    // Speed Demon — 3+ scenes in one day
    const dayMap = new Map<string, number>();
    for (const s of scenes) {
      if (s.createdAt) {
        const day = new Date(s.createdAt).toISOString().slice(0, 10);
        dayMap.set(day, (dayMap.get(day) || 0) + 1);
      }
    }
    const speedDemon = Array.from(dayMap.values()).some((c) => c >= 3);
    badges.push({
      id: 'speed-demon',
      name: 'Speed Demon',
      description: 'Created 3+ scenes in one day',
      earned: speedDemon,
    });

    // Organizer
    badges.push({
      id: 'organizer',
      name: 'Organizer',
      description: 'Created 3+ folders',
      earned: folders >= 3,
    });

    // Tag Master
    badges.push({
      id: 'tag-master',
      name: 'Tag Master',
      description: 'Used 5+ unique tags',
      earned: allTags.length >= 5,
    });

    res.json(badges);
  })
);

// PATCH /users/me/pet — set pet name
router.patch(
  '/users/me/pet',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, 'Unauthenticated');

    const { name } = req.body as { name?: unknown };

    if (name !== undefined && name !== null) {
      if (typeof name !== 'string') {
        throw new HttpError(400, 'name must be a string');
      }
      const trimmed = name.trim();
      if (trimmed.length === 0 || trimmed.length > 20) {
        throw new HttpError(400, 'name must be 1-20 characters');
      }
      await User.updateOne(
        { _id: new Types.ObjectId(req.user.id) },
        { $set: { petName: trimmed } }
      );
      res.json({ petName: trimmed });
    } else {
      // Clear name
      await User.updateOne(
        { _id: new Types.ObjectId(req.user.id) },
        { $unset: { petName: 1 } }
      );
      res.json({ petName: null });
    }
  })
);

// POST /users/me/pet/interact — perform an action on the pet
router.post(
  '/users/me/pet/interact',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, 'Unauthenticated');

    const { action } = req.body as { action?: unknown };
    const validActions = ['feed', 'bathe', 'pet'] as const;

    if (typeof action !== 'string' || !validActions.includes(action as typeof validActions[number])) {
      throw new HttpError(400, 'action must be one of: feed, bathe, pet');
    }

    const now = new Date();
    await User.updateOne(
      { _id: new Types.ObjectId(req.user.id) },
      { $set: { [`petLastActions.${action}`]: now } }
    );

    res.json({ action, performedAt: now.toISOString() });
  })
);

export default router;
