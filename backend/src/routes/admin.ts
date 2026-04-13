import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Types } from 'mongoose';
import { User } from '../models/User';
import { Scene } from '../models/Scene';
import { SceneVersion } from '../models/SceneVersion';
import { Library } from '../models/Library';
import { HttpError, asyncHandler } from '../lib/errors';
import { requireAuth, requireAdmin } from '../middleware/auth';
import { isAdminEmail } from '../lib/admin';
import { DEFAULT_STORAGE_QUOTA } from '../lib/quota';

const STORAGE_QUOTA_MAX = 10 * 1024 * 1024 * 1024; // 10 GB hard ceiling.

const router = Router();

router.use(requireAuth, requireAdmin);

interface UserView {
  id: string;
  email: string;
  name: string;
  disabled: boolean;
  createdAt: Date;
  isAdmin: boolean;
}

function toView(u: {
  _id: Types.ObjectId;
  email: string;
  name: string;
  disabled?: boolean;
  createdAt: Date;
}): UserView {
  return {
    id: u._id.toString(),
    email: u.email,
    name: u.name,
    disabled: u.disabled ?? false,
    createdAt: u.createdAt,
    isAdmin: isAdminEmail(u.email),
  };
}

// GET /admin/users
router.get(
  '/admin/users',
  asyncHandler(async (_req: Request, res: Response) => {
    const users = await User.find()
      .sort({ email: 1 })
      .select({ email: 1, name: 1, disabled: 1, createdAt: 1 })
      .lean();
    res.json(users.map(toView));
  })
);

// POST /admin/users
router.post(
  '/admin/users',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as {
      email?: unknown;
      password?: unknown;
      name?: unknown;
    };

    if (typeof body.email !== 'string' || !body.email.trim()) {
      throw new HttpError(400, 'email required');
    }
    if (typeof body.password !== 'string' || body.password.length < 1) {
      throw new HttpError(400, 'password required');
    }
    if (typeof body.name !== 'string' || !body.name.trim()) {
      throw new HttpError(400, 'name required');
    }

    const email = body.email.toLowerCase().trim();
    const name = body.name.trim();

    const existing = await User.findOne({ email });
    if (existing) {
      throw new HttpError(409, 'Email already in use');
    }

    const passwordHash = await bcrypt.hash(body.password, 10);
    const user = await User.create({
      email,
      name,
      passwordHash,
      disabled: false,
    });

    res.status(201).json(
      toView({
        _id: user._id,
        email: user.email,
        name: user.name,
        disabled: user.disabled,
        createdAt: user.createdAt,
      })
    );
  })
);

// PATCH /admin/users/:id
router.patch(
  '/admin/users/:id',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, 'Unauthenticated');
    if (!Types.ObjectId.isValid(req.params.id)) {
      throw new HttpError(404, 'User not found');
    }

    const body = req.body as {
      name?: unknown;
      password?: unknown;
      disabled?: unknown;
    };

    const user = await User.findById(req.params.id);
    if (!user) {
      throw new HttpError(404, 'User not found');
    }

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        throw new HttpError(400, 'name must be a non-empty string');
      }
      user.name = body.name.trim();
    }

    if (body.password !== undefined) {
      if (typeof body.password !== 'string' || body.password.length < 1) {
        throw new HttpError(400, 'password must be a non-empty string');
      }
      user.passwordHash = await bcrypt.hash(body.password, 10);
    }

    if (body.disabled !== undefined) {
      if (typeof body.disabled !== 'boolean') {
        throw new HttpError(400, 'disabled must be a boolean');
      }
      if (body.disabled && req.user.id === req.params.id) {
        throw new HttpError(400, 'Cannot disable yourself');
      }
      user.disabled = body.disabled;
    }

    await user.save();

    res.json(
      toView({
        _id: user._id,
        email: user.email,
        name: user.name,
        disabled: user.disabled,
        createdAt: user.createdAt,
      })
    );
  })
);

// DELETE /admin/users/:id
// Cascades scenes: transfers to a shared editor/viewer if available, otherwise deletes.
router.delete(
  '/admin/users/:id',
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, 'Unauthenticated');
    if (!Types.ObjectId.isValid(req.params.id)) {
      throw new HttpError(404, 'User not found');
    }
    if (req.user.id === req.params.id) {
      throw new HttpError(400, 'Cannot delete yourself');
    }

    const userObjId = new Types.ObjectId(req.params.id);
    const user = await User.findById(userObjId);
    if (!user) {
      throw new HttpError(404, 'User not found');
    }

    if (!user.disabled) {
      user.disabled = true;
      await user.save();
    }

    // Cascade scenes: transfer or delete
    const ownedScenes = await Scene.find({ ownerId: userObjId })
      .select({ _id: 1, shares: 1 })
      .lean();

    const deletedSceneIds: string[] = [];
    let transferred = 0;

    for (const scene of ownedScenes) {
      // Pick the best recipient: prefer editors over viewers
      const editors = scene.shares.filter((s) => s.role === 'editor');
      const viewers = scene.shares.filter((s) => s.role === 'viewer');
      const recipient = editors[0] ?? viewers[0];

      if (recipient) {
        // Transfer ownership to the recipient and remove them from shares
        await Scene.updateOne(
          { _id: scene._id },
          {
            $set: { ownerId: recipient.userId },
            $pull: { shares: { userId: recipient.userId } },
          }
        );
        transferred++;
      } else {
        // No shares — hard-delete the scene and its versions
        deletedSceneIds.push(scene._id);
      }
    }

    if (deletedSceneIds.length > 0) {
      await SceneVersion.deleteMany({ sceneId: { $in: deletedSceneIds } });
      await Scene.deleteMany({ _id: { $in: deletedSceneIds } });
    }

    // Delete user's libraries
    await Library.deleteMany({ ownerId: userObjId });

    // Clean up shares pointing to this user.
    await Scene.updateMany(
      { 'shares.userId': userObjId },
      { $pull: { shares: { userId: userObjId } } }
    );
    // Clean up stars by this user.
    await Scene.updateMany(
      { starredBy: userObjId },
      { $pull: { starredBy: userObjId } }
    );

    await User.deleteOne({ _id: userObjId });
    res.json({
      ok: true,
      scenesTransferred: transferred,
      scenesDeleted: deletedSceneIds.length,
    });
  })
);

// ---------------------------------------------------------------------------
// GET /admin/stats — app-wide storage + user stats
// ---------------------------------------------------------------------------

interface BytesAggResult {
  _id: null;
  total: number;
}

interface LargestSceneRow {
  _id: string;
  title: string;
  size: number;
  ownerId: Types.ObjectId;
}

interface PerUserAggRow {
  _id: Types.ObjectId;
  sceneCount: number;
  totalBytes: number;
}

interface PerUserVersionAggRow {
  _id: Types.ObjectId;
  totalBytes: number;
}

router.get(
  '/admin/stats',
  asyncHandler(async (_req: Request, res: Response) => {
    const [
      sceneCount,
      trashedSceneCount,
      userCount,
      versionCount,
      sceneBytesAgg,
      versionBytesAgg,
      largestScenes,
      perUserSceneAgg,
      perUserVersionAgg,
      allUsers,
    ] = await Promise.all([
      Scene.countDocuments({}),
      Scene.countDocuments({ deletedAt: { $ne: null } }),
      User.countDocuments({}),
      SceneVersion.countDocuments({}),
      Scene.aggregate<BytesAggResult>([
        {
          $group: {
            _id: null,
            total: { $sum: { $bsonSize: '$$ROOT' } },
          },
        },
      ]),
      SceneVersion.aggregate<BytesAggResult>([
        {
          $group: {
            _id: null,
            total: { $sum: { $bsonSize: '$$ROOT' } },
          },
        },
      ]),
      Scene.aggregate<LargestSceneRow>([
        { $match: { deletedAt: null } },
        {
          $project: {
            _id: 1,
            title: 1,
            ownerId: 1,
            size: { $bsonSize: '$$ROOT' },
          },
        },
        { $sort: { size: -1 } },
        { $limit: 1 },
      ]),
      Scene.aggregate<PerUserAggRow>([
        { $match: { deletedAt: null } },
        {
          $group: {
            _id: '$ownerId',
            sceneCount: { $sum: 1 },
            totalBytes: { $sum: { $bsonSize: '$$ROOT' } },
          },
        },
      ]),
      // Versions joined back to their scene to attribute bytes to the
      // scene's owner.
      SceneVersion.aggregate<PerUserVersionAggRow>([
        // Measure $bsonSize BEFORE the $lookup so $$ROOT contains only the
        // version doc — without this, the joined scene gets included in the
        // measurement and per-user version bytes inflate by ~sceneSize per
        // version, causing /admin/stats to disagree with /users/me/stats.
        {
          $project: {
            sceneId: 1,
            size: { $bsonSize: '$$ROOT' },
          },
        },
        {
          $lookup: {
            from: 'scenes',
            localField: 'sceneId',
            foreignField: '_id',
            as: 'scene',
          },
        },
        { $unwind: '$scene' },
        { $match: { 'scene.deletedAt': null } },
        {
          $group: {
            _id: '$scene.ownerId',
            totalBytes: { $sum: '$size' },
          },
        },
      ]),
      User.find()
        .select({ _id: 1, email: 1, name: 1, storageQuota: 1 })
        .lean(),
    ]);

    const sceneBytes =
      sceneBytesAgg.length > 0 ? sceneBytesAgg[0].total : 0;
    const versionBytes =
      versionBytesAgg.length > 0 ? versionBytesAgg[0].total : 0;
    const totalBytes = sceneBytes + versionBytes;

    // Merge per-user scene and version byte totals.
    const perUserBytesMap = new Map<
      string,
      { sceneCount: number; totalBytes: number }
    >();
    for (const row of perUserSceneAgg) {
      const key = row._id.toString();
      perUserBytesMap.set(key, {
        sceneCount: row.sceneCount,
        totalBytes: row.totalBytes,
      });
    }
    for (const row of perUserVersionAgg) {
      const key = row._id.toString();
      const cur = perUserBytesMap.get(key);
      if (cur) {
        cur.totalBytes += row.totalBytes;
      } else {
        perUserBytesMap.set(key, {
          sceneCount: 0,
          totalBytes: row.totalBytes,
        });
      }
    }

    let totalQuota = 0;
    const perUser = allUsers.map((u) => {
      const key = u._id.toString();
      const stats = perUserBytesMap.get(key) ?? {
        sceneCount: 0,
        totalBytes: 0,
      };
      const quotaLimit = u.storageQuota ?? DEFAULT_STORAGE_QUOTA;
      totalQuota += quotaLimit;
      const percentUsed =
        quotaLimit > 0 ? (stats.totalBytes / quotaLimit) * 100 : 0;
      return {
        userId: key,
        email: u.email,
        name: u.name,
        sceneCount: stats.sceneCount,
        totalBytes: stats.totalBytes,
        quotaLimit,
        percentUsed,
      };
    });

    const percentUsed = totalQuota > 0 ? totalBytes / totalQuota : 0;
    let storageHealth: 'ok' | 'warning' | 'critical';
    if (percentUsed < 0.5) {
      storageHealth = 'ok';
    } else if (percentUsed < 0.8) {
      storageHealth = 'warning';
    } else {
      storageHealth = 'critical';
    }

    let largestScene: {
      id: string;
      title: string;
      size: number;
      ownerName: string;
    } | null = null;
    if (largestScenes.length > 0) {
      const row = largestScenes[0];
      const owner = await User.findById(row.ownerId)
        .select({ name: 1 })
        .lean();
      largestScene = {
        id: row._id,
        title: row.title,
        size: row.size,
        ownerName: owner ? owner.name : 'Unknown',
      };
    }

    res.json({
      sceneCount,
      trashedSceneCount,
      userCount,
      versionCount,
      totalBytes,
      sceneBytes,
      versionBytes,
      largestScene,
      storageHealth,
      perUser,
    });
  })
);

// ---------------------------------------------------------------------------
// GET /admin/scenes — list every scene (metadata only)
// ---------------------------------------------------------------------------
router.get(
  '/admin/scenes',
  asyncHandler(async (req: Request, res: Response) => {
    let limit = 500;
    if (typeof req.query.limit === 'string') {
      const parsed = parseInt(req.query.limit, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        limit = Math.min(parsed, 2000);
      }
    }

    const scenes = await Scene.find({})
      .select({
        title: 1,
        ownerId: 1,
        updatedAt: 1,
        lastEditedById: 1,
        lastEditedAt: 1,
        deletedAt: 1,
        folderId: 1,
        tags: 1,
      })
      .sort({ updatedAt: -1 })
      .limit(limit)
      .lean();

    const userIdSet = new Set<string>();
    for (const s of scenes) {
      userIdSet.add(s.ownerId.toString());
      if (s.lastEditedById) {
        userIdSet.add(s.lastEditedById.toString());
      }
    }
    const users = await User.find({
      _id: {
        $in: Array.from(userIdSet).map((i) => new Types.ObjectId(i)),
      },
    })
      .select({ _id: 1, name: 1 })
      .lean();
    const userMap = new Map(users.map((u) => [u._id.toString(), u] as const));

    const result = scenes.map((s) => {
      const owner = userMap.get(s.ownerId.toString());
      const lastEditor = s.lastEditedById
        ? userMap.get(s.lastEditedById.toString())
        : null;
      return {
        _id: s._id,
        title: s.title,
        ownerId: s.ownerId.toString(),
        ownerName: owner ? owner.name : 'Unknown',
        role: 'owner' as const,
        updatedAt: s.updatedAt,
        lastEditedById: s.lastEditedById ? s.lastEditedById.toString() : null,
        lastEditedByName: lastEditor ? lastEditor.name : null,
        lastEditedAt: s.lastEditedAt ?? null,
        deletedAt: s.deletedAt ?? null,
        folderId: s.folderId ? s.folderId.toString() : null,
        tags: s.tags ?? [],
        isStarred: false,
      };
    });

    res.json(result);
  })
);

// ---------------------------------------------------------------------------
// PATCH /admin/users/:id/quota — override a user's storage quota
// ---------------------------------------------------------------------------
router.patch(
  '/admin/users/:id/quota',
  asyncHandler(async (req: Request, res: Response) => {
    if (!Types.ObjectId.isValid(req.params.id)) {
      throw new HttpError(404, 'User not found');
    }

    const body = req.body as { storageQuota?: unknown };
    const q = body.storageQuota;
    if (typeof q !== 'number' || !Number.isInteger(q) || q < 0) {
      throw new HttpError(
        400,
        'storageQuota must be a non-negative integer (bytes)'
      );
    }
    if (q > STORAGE_QUOTA_MAX) {
      throw new HttpError(
        400,
        'storageQuota exceeds the 10 GB hard ceiling'
      );
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      throw new HttpError(404, 'User not found');
    }

    user.storageQuota = q;
    await user.save();

    res.json({
      id: user._id.toString(),
      email: user.email,
      name: user.name,
      disabled: user.disabled ?? false,
      createdAt: user.createdAt,
      isAdmin: isAdminEmail(user.email),
      storageQuota: user.storageQuota,
    });
  })
);

export default router;
