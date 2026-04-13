import { Types } from 'mongoose';
import { Scene } from '../models/Scene';
import { User } from '../models/User';
import { Template } from '../models/Template';
import { WeeklyAward, AwardType } from '../models/WeeklyAward';

// ─── Date helpers (moved from routes/leaderboard.ts) ──────────────────────

export function getWeekStart(d: Date = new Date()): Date {
  const date = new Date(d);
  const day = date.getUTCDay();
  const diff = day === 0 ? 6 : day - 1; // Monday = 0
  date.setUTCDate(date.getUTCDate() - diff);
  date.setUTCHours(0, 0, 0, 0);
  return date;
}

export function getWeekEnd(weekStart: Date): Date {
  const end = new Date(weekStart);
  end.setUTCDate(end.getUTCDate() + 7);
  return end;
}

// ─── Shared leaderboard computation ───────────────────────────────────────

interface HonoraryAward {
  awardType: AwardType;
  label: string;
  description: string;
  userId: string;
  name: string;
  value: number;
}

interface LeaderboardEntry {
  userId: string;
  name: string;
  editCount: number;
  rank: number;
}

export interface ComputedAwards {
  topEditors: LeaderboardEntry[];
  honorary: HonoraryAward[];
}

export async function computeWeeklyLeaderboard(weekStart: Date): Promise<ComputedAwards> {
  const weekEnd = getWeekEnd(weekStart);

  const users = await User.find({ disabled: false }).select('_id name').lean();
  const userMap = new Map(users.map((u) => [u._id.toString(), u]));

  // 1. Top editors: scenes edited this week grouped by lastEditedById
  const editAgg = await Scene.aggregate([
    {
      $match: {
        deletedAt: null,
        lastEditedAt: { $gte: weekStart, $lt: weekEnd },
        lastEditedById: { $ne: null },
      },
    },
    { $group: { _id: '$lastEditedById', editCount: { $sum: 1 } } },
    { $sort: { editCount: -1 } },
  ]);

  const topEditors: LeaderboardEntry[] = [];
  for (let i = 0; i < Math.min(editAgg.length, 3); i++) {
    const entry = editAgg[i];
    const user = userMap.get(entry._id.toString());
    if (!user) continue;
    topEditors.push({
      userId: user._id.toString(),
      name: user.name,
      editCount: entry.editCount,
      rank: i + 1,
    });
  }

  // 2. Honorary awards
  const honorary: HonoraryAward[] = [];

  // Night Owl: most edits between 22:00-04:00 UTC
  const nightOwlAgg = await Scene.aggregate([
    {
      $match: {
        deletedAt: null,
        lastEditedAt: { $gte: weekStart, $lt: weekEnd },
        lastEditedById: { $ne: null },
      },
    },
    { $addFields: { editHour: { $hour: '$lastEditedAt' } } },
    { $match: { $or: [{ editHour: { $gte: 22 } }, { editHour: { $lt: 4 } }] } },
    { $group: { _id: '$lastEditedById', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 1 },
  ]);

  if (nightOwlAgg.length > 0) {
    const u = userMap.get(nightOwlAgg[0]._id.toString());
    if (u) {
      honorary.push({
        awardType: 'night-owl',
        label: 'Night Owl',
        description: 'Most edits between 10 PM and 4 AM',
        userId: u._id.toString(),
        name: u.name,
        value: nightOwlAgg[0].count,
      });
    }
  }

  // Most Scenes: most new scenes created this week
  const mostScenesAgg = await Scene.aggregate([
    {
      $match: {
        deletedAt: null,
        createdAt: { $gte: weekStart, $lt: weekEnd },
      },
    },
    { $group: { _id: '$ownerId', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 1 },
  ]);

  if (mostScenesAgg.length > 0) {
    const u = userMap.get(mostScenesAgg[0]._id.toString());
    if (u) {
      honorary.push({
        awardType: 'most-scenes',
        label: 'Most Scenes',
        description: 'Created the most new diagrams',
        userId: u._id.toString(),
        name: u.name,
        value: mostScenesAgg[0].count,
      });
    }
  }

  // Berserker: active user with fewest scenes (skip straight to code!)
  const berserkerAgg = await Scene.aggregate([
    { $match: { deletedAt: null } },
    { $group: { _id: '$ownerId', count: { $sum: 1 } } },
    { $sort: { count: 1 } },
    { $limit: 1 },
  ]);

  if (berserkerAgg.length > 0) {
    const u = userMap.get(berserkerAgg[0]._id.toString());
    if (u) {
      honorary.push({
        awardType: 'berserker',
        label: 'Berserker',
        description: 'Fewest diagrams — skips straight to coding!',
        userId: u._id.toString(),
        name: u.name,
        value: berserkerAgg[0].count,
      });
    }
  }

  // Template Creator: who created most templates overall
  const templateAgg = await Template.aggregate([
    { $match: { createdBy: { $ne: null } } },
    { $group: { _id: '$createdBy', count: { $sum: 1 } } },
    { $sort: { count: -1 } },
    { $limit: 1 },
  ]);

  if (templateAgg.length > 0) {
    const u = userMap.get(templateAgg[0]._id.toString());
    if (u) {
      honorary.push({
        awardType: 'template-creator',
        label: 'Template Creator',
        description: 'Created the most shared templates',
        userId: u._id.toString(),
        name: u.name,
        value: templateAgg[0].count,
      });
    }
  }

  // Community Man: shared with the most unique people
  const communityAgg = await Scene.aggregate([
    { $match: { deletedAt: null, 'shares.0': { $exists: true } } },
    { $unwind: '$shares' },
    {
      $group: {
        _id: '$ownerId',
        uniqueSharees: { $addToSet: '$shares.userId' },
      },
    },
    { $addFields: { shareCount: { $size: '$uniqueSharees' } } },
    { $sort: { shareCount: -1 } },
    { $limit: 1 },
  ]);

  if (communityAgg.length > 0) {
    const u = userMap.get(communityAgg[0]._id.toString());
    if (u) {
      honorary.push({
        awardType: 'community-man',
        label: 'Community Man',
        description: 'Shared with the most teammates',
        userId: u._id.toString(),
        name: u.name,
        value: communityAgg[0].shareCount,
      });
    }
  }

  return { topEditors, honorary };
}

// ─── Persistence ──────────────────────────────────────────────────────────

export async function computeAndPersistWeeklyAwards(weekStart: Date): Promise<number> {
  const { topEditors, honorary } = await computeWeeklyLeaderboard(weekStart);

  interface AwardToWrite {
    userId: Types.ObjectId;
    awardType: AwardType;
    weekStart: Date;
    rank: number | null;
    value: number;
  }

  const awards: AwardToWrite[] = [];

  for (const editor of topEditors) {
    awards.push({
      userId: new Types.ObjectId(editor.userId),
      awardType: (['gold', 'silver', 'bronze'] as const)[editor.rank - 1],
      weekStart,
      rank: editor.rank,
      value: editor.editCount,
    });
  }

  for (const h of honorary) {
    awards.push({
      userId: new Types.ObjectId(h.userId),
      awardType: h.awardType,
      weekStart,
      rank: null,
      value: h.value,
    });
  }

  if (awards.length === 0) {
    console.log(`[WeeklyAwards] No awards to write for week ${weekStart.toISOString()}`);
    return 0;
  }

  const ops = awards.map((a) => ({
    updateOne: {
      filter: {
        userId: a.userId,
        awardType: a.awardType,
        weekStart: a.weekStart,
      },
      update: {
        $set: {
          rank: a.rank,
          value: a.value,
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      upsert: true,
    },
  }));

  const result = await WeeklyAward.bulkWrite(ops);
  const written = (result.upsertedCount || 0) + (result.modifiedCount || 0);
  console.log(
    `[WeeklyAwards] Week ${weekStart.toISOString()}: ${written} awards written ` +
    `(${result.upsertedCount || 0} new, ${result.modifiedCount || 0} updated)`
  );
  return written;
}

// ─── Backfill ─────────────────────────────────────────────────────────────

export async function backfillWeeklyAwards(weeksBack: number): Promise<number> {
  const now = getWeekStart();
  let totalWritten = 0;

  for (let i = 1; i <= weeksBack; i++) {
    const ws = new Date(now);
    ws.setUTCDate(ws.getUTCDate() - i * 7);
    const written = await computeAndPersistWeeklyAwards(ws);
    totalWritten += written;
  }

  console.log(`[WeeklyAwards] Backfill complete: ${totalWritten} total awards across ${weeksBack} weeks`);
  return totalWritten;
}

// ─── Cron timer ───────────────────────────────────────────────────────────

const CHECK_INTERVAL_MS = 60 * 60 * 1000; // 1 hour

async function checkAndComputeAwards(): Promise<void> {
  try {
    const currentWeekStart = getWeekStart(new Date());
    const previousWeekStart = new Date(currentWeekStart);
    previousWeekStart.setUTCDate(previousWeekStart.getUTCDate() - 7);

    const existing = await WeeklyAward.countDocuments({
      weekStart: previousWeekStart,
    });

    if (existing > 0) {
      return;
    }

    console.log(`[WeeklyAwards] Computing awards for week of ${previousWeekStart.toISOString()}`);
    await computeAndPersistWeeklyAwards(previousWeekStart);
  } catch (err) {
    console.error('[WeeklyAwards] Cron check failed:', err);
  }
}

export function startWeeklyAwardsCron(): () => void {
  const timer = setInterval(() => {
    void checkAndComputeAwards();
  }, CHECK_INTERVAL_MS);

  void checkAndComputeAwards();

  return () => clearInterval(timer);
}
