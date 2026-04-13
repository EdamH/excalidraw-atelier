import { Router } from 'express';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { asyncHandler } from '../lib/errors';
import { Scene } from '../models/Scene';
import { User } from '../models/User';
import { WeeklyAward } from '../models/WeeklyAward';
import { Types } from 'mongoose';
import { computePetMood, pickPetSpeech } from '../lib/pet';
import {
  getWeekStart,
  getWeekEnd,
  computeWeeklyLeaderboard,
  computeAndPersistWeeklyAwards,
  backfillWeeklyAwards,
} from '../lib/weeklyAwardsCron';

const router = Router();

// 5-minute in-memory cache for the weekly leaderboard
let leaderboardCache: { data: unknown; cachedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

router.get(
  '/leaderboard/weekly',
  requireAuth,
  asyncHandler(async (_req, res) => {
    if (leaderboardCache && Date.now() - leaderboardCache.cachedAt < CACHE_TTL_MS) {
      res.json(leaderboardCache.data);
      return;
    }

    const weekStart = getWeekStart();
    const { topEditors, honorary } = await computeWeeklyLeaderboard(weekStart);

    const responseData = {
      weekStart: weekStart.toISOString(),
      weekEnd: getWeekEnd(weekStart).toISOString(),
      topEditors,
      honorary,
    };

    leaderboardCache = { data: responseData, cachedAt: Date.now() };
    res.json(responseData);
  })
);

// Profile badges: all awards for a user
router.get(
  '/profile/:userId/badges',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { userId } = req.params;
    if (!Types.ObjectId.isValid(userId)) {
      res.status(400).json({ error: 'Invalid userId' });
      return;
    }
    const awards = await WeeklyAward.find({ userId: new Types.ObjectId(userId) })
      .sort({ weekStart: -1 })
      .limit(100)
      .lean();

    const user = await User.findById(userId).select('name createdAt petName petLastActions').lean();
    if (!user) {
      res.status(404).json({ error: 'User not found' });
      return;
    }

    // Compute streak: consecutive weeks on the leaderboard
    const weekStarts = [...new Set(awards.map((a) => a.weekStart.toISOString()))].sort().reverse();
    let streak = 0;
    const now = getWeekStart();
    for (let i = 0; i < weekStarts.length; i++) {
      const expected = new Date(now);
      expected.setUTCDate(expected.getUTCDate() - i * 7);
      if (weekStarts[i] === expected.toISOString()) {
        streak++;
      } else {
        break;
      }
    }

    // Pet state for profile display
    const profileScenes = await Scene.find({ ownerId: new Types.ObjectId(userId), deletedAt: null })
      .select('lastEditedAt createdAt')
      .lean();

    let profileLastActivity: Date | null = null;
    const profileEditDays = new Set<string>();
    for (const s of profileScenes) {
      if (s.lastEditedAt) {
        const d = new Date(s.lastEditedAt);
        if (!profileLastActivity || d > profileLastActivity) profileLastActivity = d;
        profileEditDays.add(d.toISOString().slice(0, 10));
      }
      if (s.createdAt) {
        profileEditDays.add(new Date(s.createdAt).toISOString().slice(0, 10));
      }
    }
    if (!profileLastActivity && user.createdAt) {
      profileLastActivity = new Date(user.createdAt);
    }

    const sortedProfileDays = Array.from(profileEditDays).sort().reverse();
    let profileDrawStreak = 0;
    const todayStr = new Date().toISOString().slice(0, 10);
    const yesterdayStr = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    let pStartIdx = sortedProfileDays.indexOf(todayStr);
    if (pStartIdx === -1) pStartIdx = sortedProfileDays.indexOf(yesterdayStr);
    if (pStartIdx >= 0) {
      const startDate = new Date(sortedProfileDays[pStartIdx]);
      for (let i = 0; i < sortedProfileDays.length; i++) {
        const expected = new Date(startDate);
        expected.setDate(expected.getDate() - i);
        if (profileEditDays.has(expected.toISOString().slice(0, 10))) {
          profileDrawStreak++;
        } else {
          break;
        }
      }
    }

    const profilePetMood = computePetMood(profileDrawStreak, profileScenes.length, profileLastActivity);
    const profilePetSpeech = profileScenes.length === 0 ? 'draw me something? ...please? *puppy eyes*' : pickPetSpeech(profilePetMood);

    res.json({
      user: { id: user._id.toString(), name: user.name, createdAt: user.createdAt },
      awards,
      streak,
      pet: {
        mood: profilePetMood,
        speech: profilePetSpeech,
        name: user.petName ?? null,
      },
    });
  })
);

// Admin: manual trigger for weekly awards computation
router.post(
  '/admin/compute-weekly-awards',
  requireAuth,
  requireAdmin,
  asyncHandler(async (req, res) => {
    const { backfillWeeks } = req.body as { backfillWeeks?: number };

    if (backfillWeeks !== undefined) {
      if (typeof backfillWeeks !== 'number' || !Number.isInteger(backfillWeeks) || backfillWeeks < 1 || backfillWeeks > 52) {
        res.status(400).json({ error: 'backfillWeeks must be an integer between 1 and 52' });
        return;
      }
      const total = await backfillWeeklyAwards(backfillWeeks);
      res.json({ ok: true, message: `Backfill complete: ${total} awards across ${backfillWeeks} weeks` });
      return;
    }

    const currentWeekStart = getWeekStart();
    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);

    const written = await computeAndPersistWeeklyAwards(previousWeekStart);
    res.json({
      ok: true,
      weekStart: previousWeekStart.toISOString(),
      awardsWritten: written,
    });
  })
);

export default router;
