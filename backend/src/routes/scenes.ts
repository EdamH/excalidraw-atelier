import { randomBytes, createHash } from 'crypto';
import { Router, Request, Response } from 'express';
import { FilterQuery, Types } from 'mongoose';
import { Scene, IScene } from '../models/Scene';
import { SceneVersion } from '../models/SceneVersion';
import { User } from '../models/User';
import { Folder } from '../models/Folder';
import { HttpError, asyncHandler } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import {
  loadSceneOrThrow,
  loadSceneMetaOrThrow,
  roleFor,
  requireRole,
} from '../lib/access';
import { isAdminEmail } from '../lib/admin';
import { logActivity } from '../lib/activityLog';
import { ActivityLog } from '../models/ActivityLog';
import {
  computeUserStorageBytes,
  DEFAULT_STORAGE_QUOTA,
} from '../lib/quota';

const router = Router();

const SNAPSHOT_INTERVAL_MS = 5 * 60 * 1000;
const TRASH_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const PRUNE_THROTTLE_MS = 60 * 1000;

let lastPruneAt = 0;

async function generateUniqueSlug(): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = randomBytes(6).toString('base64url').toLowerCase();
    const existing = await Scene.findById(slug).select({ _id: 1 }).lean();
    if (!existing) return slug;
  }
  throw new HttpError(500, 'Could not allocate slug');
}

router.use(requireAuth);

async function pruneVersions(sceneId: string, keep = 5): Promise<void> {
  const count = await SceneVersion.countDocuments({ sceneId });
  if (count <= keep) return;
  const cutoff = await SceneVersion.find({ sceneId })
    .sort({ createdAt: -1 })
    .skip(keep - 1)
    .limit(1)
    .select({ createdAt: 1 })
    .lean();
  if (!cutoff.length) return;
  await SceneVersion.deleteMany({
    sceneId,
    createdAt: { $lt: cutoff[0].createdAt },
  });
}

async function pruneOldTrash(maxAgeMs = TRASH_MAX_AGE_MS): Promise<void> {
  const cutoff = new Date(Date.now() - maxAgeMs);
  const stale = await Scene.find({ deletedAt: { $lt: cutoff } })
    .select({ _id: 1 })
    .lean();
  if (!stale.length) return;
  const ids = stale.map((s) => s._id);
  await SceneVersion.deleteMany({ sceneId: { $in: ids } });
  await Scene.deleteMany({ _id: { $in: ids } });
}

function currentUser(req: Request): { id: string; email: string; name: string } {
  if (!req.user) throw new HttpError(401, 'Unauthenticated');
  return req.user;
}

async function getUserStorageLimit(userId: string): Promise<number> {
  const u = await User.findById(userId).select({ storageQuota: 1 }).lean();
  return u?.storageQuota ?? DEFAULT_STORAGE_QUOTA;
}

async function enforceStorageQuotaOrThrow(userId: string): Promise<void> {
  const [bytesUsed, limit] = await Promise.all([
    computeUserStorageBytes(userId),
    getUserStorageLimit(userId),
  ]);
  if (bytesUsed >= limit) {
    throw new HttpError(
      413,
      'Storage quota exceeded. Delete some scenes or contact an admin.'
    );
  }
}

function parseTruthy(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  const v = value.toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

interface SceneListItem {
  _id: string;
  title: string;
  ownerId: string;
  ownerName: string;
  role: 'owner' | 'editor' | 'viewer';
  createdAt: Date;
  updatedAt: Date;
  lastEditedByName: string | null;
  lastEditedAt: Date | null;
  deletedAt: Date | null;
  folderId: string | null;
  tags: string[];
  isStarred: boolean;
}

function normalizeTags(input: unknown): string[] {
  if (!Array.isArray(input)) {
    throw new HttpError(400, 'tags must be an array');
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    if (typeof raw !== 'string') {
      throw new HttpError(400, 'each tag must be a string');
    }
    const trimmed = raw.trim();
    if (!trimmed) {
      throw new HttpError(400, 'tags must be non-empty');
    }
    if (trimmed.length > 32) {
      throw new HttpError(400, 'each tag must be at most 32 characters');
    }
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed);
    if (out.length > 16) {
      throw new HttpError(400, 'at most 16 tags allowed');
    }
  }
  return out;
}

async function buildSceneItemResponse(
  scene: IScene,
  role: 'owner' | 'editor' | 'viewer',
  callerId: string
): Promise<SceneListItem> {
  const userIds: Types.ObjectId[] = [scene.ownerId];
  if (scene.lastEditedById) {
    userIds.push(scene.lastEditedById);
  }
  const users = await User.find({ _id: { $in: userIds } }).lean();
  const map = new Map(users.map((u) => [u._id.toString(), u]));
  const owner = map.get(scene.ownerId.toString());
  const lastEditor = scene.lastEditedById
    ? map.get(scene.lastEditedById.toString())
    : null;
  return {
    _id: scene._id,
    title: scene.title,
    ownerId: scene.ownerId.toString(),
    ownerName: owner ? owner.name : 'Unknown',
    role,
    createdAt: scene.createdAt,
    updatedAt: scene.updatedAt,
    lastEditedByName: lastEditor ? lastEditor.name : null,
    lastEditedAt: scene.lastEditedAt,
    deletedAt: scene.deletedAt,
    folderId: scene.folderId ? scene.folderId.toString() : null,
    tags: scene.tags ?? [],
    isStarred: (scene.starredBy ?? []).some(
      (uid) => uid.toString() === callerId
    ),
  };
}

// GET /me — returned by auth router; mount a compatibility alias here under /api
router.get(
  '/me',
  asyncHandler(async (req: Request, res: Response) => {
    const u = currentUser(req);
    res.json({
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        isAdmin: isAdminEmail(u.email),
      },
    });
  })
);

// GET /scenes — list scenes owned by or shared with caller
router.get(
  '/scenes',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const userObjId = new Types.ObjectId(user.id);
    const trashMode = parseTruthy(req.query.trash);

    if (!trashMode) {
      const now = Date.now();
      if (now - lastPruneAt > PRUNE_THROTTLE_MS) {
        lastPruneAt = now;
        void pruneOldTrash().catch((err) =>
          console.error('pruneOldTrash failed:', err)
        );
      }
    }

    const folderParam =
      typeof req.query.folder === 'string' ? req.query.folder : null;
    const tagParam =
      typeof req.query.tag === 'string' ? req.query.tag.trim() : '';
    const starredOnly = parseTruthy(req.query.starred);

    let filter: FilterQuery<IScene>;
    if (trashMode) {
      filter = { ownerId: userObjId, deletedAt: { $ne: null } };
    } else if (folderParam !== null) {
      // Folder mode: owned scenes only — sharing receivers see flat list,
      // never browse another user's folders.
      let folderClause: Types.ObjectId | null;
      if (folderParam === 'unfiled') {
        folderClause = null;
      } else {
        if (!Types.ObjectId.isValid(folderParam)) {
          throw new HttpError(400, 'Invalid folder id');
        }
        folderClause = new Types.ObjectId(folderParam);
      }
      filter = {
        ownerId: userObjId,
        folderId: folderClause,
        deletedAt: null,
      };
    } else {
      filter = {
        $or: [{ ownerId: userObjId }, { 'shares.userId': userObjId }],
        deletedAt: null,
      };
    }

    if (tagParam) {
      // Case-insensitive exact match against any element of the tags array.
      const re = new RegExp(
        `^${tagParam.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`,
        'i'
      );
      filter = { ...filter, tags: re };
    }

    if (starredOnly) {
      filter = { ...filter, starredBy: userObjId };
    }

    const scenes = await Scene.find(filter)
      .select({
        title: 1,
        ownerId: 1,
        createdAt: 1,
        updatedAt: 1,
        lastEditedById: 1,
        lastEditedAt: 1,
        deletedAt: 1,
        folderId: 1,
        tags: 1,
        starredBy: 1,
        shares: 1,
      })
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean();

    const userIdSet = new Set<string>();
    for (const s of scenes) {
      userIdSet.add(s.ownerId.toString());
      if (s.lastEditedById) {
        userIdSet.add(s.lastEditedById.toString());
      }
    }
    const users = await User.find({
      _id: { $in: Array.from(userIdSet).map((i) => new Types.ObjectId(i)) },
    }).lean();
    const userMap = new Map(
      users.map((u) => [u._id.toString(), u] as const)
    );

    const result: SceneListItem[] = scenes.map((s) => {
      let role: 'owner' | 'editor' | 'viewer' = 'viewer';
      if (s.ownerId.toString() === user.id) {
        role = 'owner';
      } else {
        const share = s.shares.find(
          (sh) => sh.userId.toString() === user.id
        );
        if (share) role = share.role;
      }
      const owner = userMap.get(s.ownerId.toString());
      const lastEditor = s.lastEditedById
        ? userMap.get(s.lastEditedById.toString())
        : null;
      return {
        _id: s._id,
        title: s.title,
        ownerId: s.ownerId.toString(),
        ownerName: owner ? owner.name : 'Unknown',
        role,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        lastEditedByName: lastEditor ? lastEditor.name : null,
        lastEditedAt: s.lastEditedAt ?? null,
        deletedAt: s.deletedAt ?? null,
        folderId: s.folderId ? s.folderId.toString() : null,
        tags: s.tags ?? [],
        isStarred: (s.starredBy ?? []).some(
          (uid) => uid.toString() === user.id
        ),
      };
    });

    // ETag: hash of updatedAt timestamps for conditional 304 responses
    const etag = '"' + createHash('md5')
      .update(result.map((s) => s.updatedAt).join(','))
      .digest('hex') + '"';
    res.set('ETag', etag);
    res.set('Cache-Control', 'private, no-cache');
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.json(result);
  })
);

// POST /scenes — create (slug auto-generated)
router.post(
  '/scenes',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = req.body as { title?: unknown };
    if (typeof body.title !== 'string' || !body.title.trim()) {
      throw new HttpError(400, 'title required');
    }
    const title = body.title.trim();

    await enforceStorageQuotaOrThrow(user.id);

    const id = await generateUniqueSlug();

    const scene = await Scene.create({
      _id: id,
      title,
      ownerId: new Types.ObjectId(user.id),
      shares: [],
      elements: [],
      appState: {},
      updatedAt: new Date(),
      lastSnapshotAt: null,
      deletedAt: null,
      lastEditedById: null,
      lastEditedAt: null,
    });

    logActivity(scene._id, user.id, 'created', title);

    res.status(201).json({
      _id: scene._id,
      title: scene.title,
      ownerId: scene.ownerId.toString(),
      ownerName: user.name,
      role: 'owner',
      createdAt: scene.createdAt,
      updatedAt: scene.updatedAt,
      lastEditedByName: null,
      lastEditedAt: null,
      deletedAt: null,
      folderId: null,
      tags: [],
      isStarred: false,
    });
  })
);

// POST /scenes/import — create a scene from imported elements/appState
router.post(
  '/scenes/import',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = req.body as {
      title?: unknown;
      elements?: unknown;
      appState?: unknown;
    };

    if (typeof body.title !== 'string' || !body.title.trim()) {
      throw new HttpError(400, 'title required');
    }
    const title = body.title.trim();

    let elements: unknown[] = [];
    if (body.elements !== undefined) {
      if (!Array.isArray(body.elements)) {
        throw new HttpError(400, 'elements must be an array');
      }
      elements = body.elements;
    }

    let appState: Record<string, unknown> = {};
    if (body.appState !== undefined) {
      if (
        typeof body.appState !== 'object' ||
        body.appState === null ||
        Array.isArray(body.appState)
      ) {
        throw new HttpError(400, 'appState must be an object');
      }
      appState = body.appState as Record<string, unknown>;
    }

    await enforceStorageQuotaOrThrow(user.id);

    const id = await generateUniqueSlug();
    const scene = await Scene.create({
      _id: id,
      title,
      ownerId: new Types.ObjectId(user.id),
      shares: [],
      elements,
      appState,
      updatedAt: new Date(),
      lastSnapshotAt: null,
      deletedAt: null,
      lastEditedById: null,
      lastEditedAt: null,
    });

    res.status(201).json({
      _id: scene._id,
      title: scene.title,
      ownerId: scene.ownerId.toString(),
      ownerName: user.name,
      role: 'owner',
      updatedAt: scene.updatedAt,
      lastEditedByName: null,
      lastEditedAt: null,
      deletedAt: null,
      folderId: null,
      tags: [],
      isStarred: false,
    });
  })
);

type BulkResult = { ok: string[]; failed: { id: string; error: string }[] };

const BULK_MAX_IDS = 200;
const TAG_CAP = 16;

function parseBulkIds(input: unknown): string[] {
  if (!Array.isArray(input)) {
    throw new HttpError(400, 'ids must be an array');
  }
  if (input.length === 0) {
    throw new HttpError(400, 'ids must be non-empty');
  }
  if (input.length > BULK_MAX_IDS) {
    throw new HttpError(400, `at most ${BULK_MAX_IDS} ids allowed`);
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of input) {
    if (typeof raw !== 'string' || !raw.trim()) {
      throw new HttpError(400, 'each id must be a non-empty string');
    }
    const id = raw.trim();
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function httpErrorMessage(err: unknown): string {
  if (err instanceof HttpError) return err.message;
  if (err instanceof Error) return err.message;
  return 'Unknown error';
}

// POST /scenes/bulk/delete — soft delete many (owner)
router.post(
  '/scenes/bulk/delete',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = req.body as { ids?: unknown };
    const ids = parseBulkIds(body.ids);

    const result: BulkResult = { ok: [], failed: [] };
    const ownedIds: string[] = [];

    for (const id of ids) {
      try {
        const scene = await loadSceneMetaOrThrow(id);
        requireRole(roleFor(user, scene), 'owner');
        if (scene.deletedAt) {
          result.failed.push({ id, error: 'Already in trash' });
          continue;
        }
        ownedIds.push(id);
      } catch (err) {
        result.failed.push({ id, error: httpErrorMessage(err) });
      }
    }

    if (ownedIds.length) {
      const now = new Date();
      await Scene.updateMany(
        { _id: { $in: ownedIds }, deletedAt: null },
        { $set: { deletedAt: now } }
      );
      result.ok.push(...ownedIds);
      for (const id of ownedIds) {
        logActivity(id, user.id, 'deleted');
      }
    }

    res.json(result);
  })
);

// POST /scenes/bulk/restore — restore many (owner)
router.post(
  '/scenes/bulk/restore',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = req.body as { ids?: unknown };
    const ids = parseBulkIds(body.ids);

    const result: BulkResult = { ok: [], failed: [] };
    const ownedIds: string[] = [];

    for (const id of ids) {
      try {
        const scene = await loadSceneMetaOrThrow(id);
        requireRole(roleFor(user, scene), 'owner');
        if (!scene.deletedAt) {
          result.failed.push({ id, error: 'Not in trash' });
          continue;
        }
        ownedIds.push(id);
      } catch (err) {
        result.failed.push({ id, error: httpErrorMessage(err) });
      }
    }

    if (ownedIds.length) {
      await Scene.updateMany(
        { _id: { $in: ownedIds }, deletedAt: { $ne: null } },
        { $set: { deletedAt: null } }
      );
      result.ok.push(...ownedIds);
      for (const id of ownedIds) {
        logActivity(id, user.id, 'restored');
      }
    }

    res.json(result);
  })
);

// POST /scenes/bulk/hard-delete — permanent delete many (owner, trash only)
router.post(
  '/scenes/bulk/hard-delete',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = req.body as { ids?: unknown };
    const ids = parseBulkIds(body.ids);

    const result: BulkResult = { ok: [], failed: [] };
    const deletableIds: string[] = [];

    for (const id of ids) {
      try {
        const scene = await loadSceneMetaOrThrow(id);
        requireRole(roleFor(user, scene), 'owner');
        if (!scene.deletedAt) {
          result.failed.push({
            id,
            error: 'Scene must be in trash before permanent delete',
          });
          continue;
        }
        deletableIds.push(id);
      } catch (err) {
        result.failed.push({ id, error: httpErrorMessage(err) });
      }
    }

    if (deletableIds.length) {
      await SceneVersion.deleteMany({ sceneId: { $in: deletableIds } });
      await Scene.deleteMany({
        _id: { $in: deletableIds },
        deletedAt: { $ne: null },
      });
      result.ok.push(...deletableIds);
    }

    res.json(result);
  })
);

// POST /scenes/bulk/move — move many to folder or root (owner)
router.post(
  '/scenes/bulk/move',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = req.body as { ids?: unknown; folderId?: unknown };
    const ids = parseBulkIds(body.ids);

    let folderObjId: Types.ObjectId | null;
    if (body.folderId === null || body.folderId === undefined) {
      folderObjId = null;
    } else if (typeof body.folderId === 'string') {
      if (!Types.ObjectId.isValid(body.folderId)) {
        throw new HttpError(400, 'Invalid folderId');
      }
      folderObjId = new Types.ObjectId(body.folderId);
      const folder = await Folder.findOne({
        _id: folderObjId,
        ownerId: new Types.ObjectId(user.id),
      })
        .select({ _id: 1 })
        .lean();
      if (!folder) {
        throw new HttpError(404, 'Folder not found');
      }
    } else {
      throw new HttpError(400, 'folderId must be a string or null');
    }

    const result: BulkResult = { ok: [], failed: [] };
    const now = new Date();

    for (const id of ids) {
      try {
        const scene = await loadSceneMetaOrThrow(id);
        requireRole(roleFor(user, scene), 'owner');
        await Scene.updateOne(
          { _id: id },
          { $set: { folderId: folderObjId, updatedAt: now } }
        );
        result.ok.push(id);
        logActivity(id, user.id, 'moved');
      } catch (err) {
        result.failed.push({ id, error: httpErrorMessage(err) });
      }
    }

    res.json(result);
  })
);

// POST /scenes/bulk/tags — add/remove tags across many (editor+)
router.post(
  '/scenes/bulk/tags',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = req.body as {
      ids?: unknown;
      add?: unknown;
      remove?: unknown;
    };
    const ids = parseBulkIds(body.ids);

    if (body.add === undefined && body.remove === undefined) {
      throw new HttpError(400, 'add or remove required');
    }

    const addTags = body.add !== undefined ? normalizeTags(body.add) : [];

    let removeTags: string[] = [];
    if (body.remove !== undefined) {
      if (!Array.isArray(body.remove)) {
        throw new HttpError(400, 'remove must be an array');
      }
      for (const raw of body.remove) {
        if (typeof raw !== 'string') {
          throw new HttpError(400, 'each remove tag must be a string');
        }
        const trimmed = raw.trim();
        if (trimmed) removeTags.push(trimmed);
      }
    }
    const removeSet = new Set(removeTags.map((t) => t.toLowerCase()));

    if (addTags.length === 0 && removeTags.length === 0) {
      throw new HttpError(400, 'add or remove must contain at least one tag');
    }

    const result: BulkResult = { ok: [], failed: [] };
    const now = new Date();

    for (const id of ids) {
      try {
        const scene = await loadSceneMetaOrThrow(id);
        requireRole(roleFor(user, scene), 'editor');

        const current = await Scene.findById(id).select({ tags: 1 }).lean();
        const existing = current?.tags ?? [];

        const merged: string[] = [];
        const seen = new Set<string>();
        for (const t of existing) {
          const key = t.toLowerCase();
          if (removeSet.has(key)) continue;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(t);
        }
        for (const t of addTags) {
          const key = t.toLowerCase();
          if (removeSet.has(key)) continue;
          if (seen.has(key)) continue;
          seen.add(key);
          merged.push(t);
        }
        const capped = merged.slice(0, TAG_CAP);

        await Scene.updateOne(
          { _id: id },
          { $set: { tags: capped, updatedAt: now } }
        );
        result.ok.push(id);
        logActivity(id, user.id, 'tagged');
      } catch (err) {
        result.failed.push({ id, error: httpErrorMessage(err) });
      }
    }

    res.json(result);
  })
);

// POST /scenes/bulk/share — share many with one user (owner)
router.post(
  '/scenes/bulk/share',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = req.body as {
      ids?: unknown;
      email?: unknown;
      role?: unknown;
    };
    const ids = parseBulkIds(body.ids);

    if (typeof body.email !== 'string' || !body.email.trim()) {
      throw new HttpError(400, 'email required');
    }
    if (body.role !== 'viewer' && body.role !== 'editor') {
      throw new HttpError(400, 'role must be viewer or editor');
    }
    const shareRole = body.role;

    const target = await User.findOne({
      email: body.email.toLowerCase().trim(),
    });
    if (!target) {
      throw new HttpError(404, 'User not found');
    }
    if (target.disabled) {
      throw new HttpError(400, 'Cannot share with a disabled user');
    }
    if (target._id.toString() === user.id) {
      throw new HttpError(400, 'Cannot share with yourself');
    }

    const result: BulkResult = { ok: [], failed: [] };

    for (const id of ids) {
      try {
        const scene = await loadSceneMetaOrThrow(id);
        requireRole(roleFor(user, scene), 'owner');

        if (target._id.toString() === scene.ownerId.toString()) {
          result.failed.push({ id, error: 'Target is the owner' });
          continue;
        }

        const shares = scene.shares.map((s) => ({
          userId: s.userId,
          role: s.role,
        }));
        const existing = shares.find(
          (s) => s.userId.toString() === target._id.toString()
        );
        if (existing) {
          existing.role = shareRole;
        } else {
          shares.push({ userId: target._id, role: shareRole });
        }

        await Scene.updateOne({ _id: id }, { $set: { shares } });
        result.ok.push(id);
        logActivity(id, user.id, 'shared', target.name || target.email);
      } catch (err) {
        result.failed.push({ id, error: httpErrorMessage(err) });
      }
    }

    res.json(result);
  })
);

// POST /scenes/bulk/unshare — remove a user from shares across many (owner)
router.post(
  '/scenes/bulk/unshare',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = req.body as { ids?: unknown; userId?: unknown };
    const ids = parseBulkIds(body.ids);

    if (typeof body.userId !== 'string' || !Types.ObjectId.isValid(body.userId)) {
      throw new HttpError(400, 'Invalid userId');
    }
    const targetObjId = new Types.ObjectId(body.userId);

    const result: BulkResult = { ok: [], failed: [] };
    const ownedIds: string[] = [];

    for (const id of ids) {
      try {
        const scene = await loadSceneMetaOrThrow(id);
        requireRole(roleFor(user, scene), 'owner');
        ownedIds.push(id);
      } catch (err) {
        result.failed.push({ id, error: httpErrorMessage(err) });
      }
    }

    if (ownedIds.length) {
      await Scene.updateMany(
        { _id: { $in: ownedIds } },
        { $pull: { shares: { userId: targetObjId } } }
      );
      result.ok.push(...ownedIds);
      for (const id of ownedIds) {
        logActivity(id, user.id, 'unshared');
      }
    }

    res.json(result);
  })
);

// POST /scenes/:id/copy — duplicate a scene the caller can view
router.post(
  '/scenes/:id/copy',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const source = await loadSceneOrThrow(req.params.id);
    requireRole(roleFor(user, source), 'viewer');

    if (source.deletedAt) {
      throw new HttpError(400, 'cannot copy a deleted scene');
    }

    const body = req.body as { title?: unknown };
    let title: string;
    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || !body.title.trim()) {
        throw new HttpError(400, 'title must be a non-empty string');
      }
      title = body.title.trim();
    } else {
      title = `Copy of ${source.title}`;
    }

    const newId = await generateUniqueSlug();
    const now = new Date();
    const copy = await Scene.create({
      _id: newId,
      title,
      ownerId: new Types.ObjectId(user.id),
      shares: [],
      elements: source.elements,
      appState: source.appState,
      updatedAt: now,
      lastSnapshotAt: null,
      deletedAt: null,
      lastEditedById: null,
      lastEditedAt: null,
    });

    logActivity(copy._id, user.id, 'created', title);
    logActivity(source._id as string, user.id, 'duplicated', copy._id);

    res.status(201).json({
      _id: copy._id,
      title: copy.title,
      ownerId: copy.ownerId.toString(),
      ownerName: user.name,
      role: 'owner',
      updatedAt: copy.updatedAt,
      lastEditedByName: null,
      lastEditedAt: null,
      deletedAt: null,
      folderId: null,
      tags: [],
      isStarred: false,
    });
  })
);

// GET /scenes/random — pick a random scene the user can access
// MUST stay before /scenes/:id to avoid Express matching :id="random"
router.get(
  '/scenes/random',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const userId = new Types.ObjectId(user.id);
    const isAdmin = isAdminEmail(user.email);

    const match: FilterQuery<IScene> = { deletedAt: null };
    if (!isAdmin) {
      match.$or = [
        { ownerId: userId },
        { 'shares.userId': userId },
      ];
    }

    const result = await Scene.aggregate([
      { $match: match },
      { $sample: { size: 1 } },
      { $project: { _id: 1 } },
    ]);

    if (result.length === 0) {
      res.json({ sceneId: null });
      return;
    }
    res.json({ sceneId: result[0]._id });
  })
);

// GET /scenes/:id
router.get(
  '/scenes/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const scene = await loadSceneOrThrow(req.params.id);
    const role = requireRole(roleFor(user, scene), 'viewer');

    const shareUserIds = scene.shares.map((s) => s.userId);
    const lookupIds: Types.ObjectId[] = [...shareUserIds];
    if (scene.lastEditedById) {
      lookupIds.push(scene.lastEditedById);
    }
    const lookupUsers = await User.find({
      _id: { $in: lookupIds },
    }).lean();
    const userMap = new Map(
      lookupUsers.map((u) => [u._id.toString(), u])
    );

    const shares = scene.shares.map((s) => {
      const u = userMap.get(s.userId.toString());
      return {
        userId: s.userId.toString(),
        email: u ? u.email : null,
        name: u ? u.name : null,
        role: s.role,
      };
    });

    const lastEditor = scene.lastEditedById
      ? userMap.get(scene.lastEditedById.toString())
      : null;

    const detailEtag = '"' + createHash('md5')
      .update(new Date(scene.updatedAt).toISOString())
      .digest('hex') + '"';
    res.set('ETag', detailEtag);
    res.set('Cache-Control', 'private, no-cache');
    if (req.headers['if-none-match'] === detailEtag) {
      res.status(304).end();
      return;
    }

    res.json({
      _id: scene._id,
      title: scene.title,
      ownerId: scene.ownerId.toString(),
      elements: scene.elements,
      appState: scene.appState,
      updatedAt: scene.updatedAt,
      lastSnapshotAt: scene.lastSnapshotAt,
      role,
      shares,
      lastEditedByName: lastEditor ? lastEditor.name : null,
      lastEditedAt: scene.lastEditedAt,
      deletedAt: scene.deletedAt,
      folderId: scene.folderId ? scene.folderId.toString() : null,
      tags: scene.tags ?? [],
      isStarred: (scene.starredBy ?? []).some(
        (uid) => uid.toString() === user.id
      ),
    });
  })
);

// PUT /scenes/:id — save elements/appState, throttled snapshot
router.put(
  '/scenes/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const scene = await loadSceneMetaOrThrow(req.params.id);
    requireRole(roleFor(user, scene), 'editor');

    if (scene.deletedAt) {
      throw new HttpError(400, 'cannot edit a deleted scene');
    }

    const body = req.body as { elements?: unknown; appState?: unknown };
    if (body.elements === undefined || body.appState === undefined) {
      throw new HttpError(400, 'elements and appState required');
    }
    if (!Array.isArray(body.elements)) {
      throw new HttpError(400, 'elements must be an array');
    }
    if (
      typeof body.appState !== 'object' ||
      body.appState === null ||
      Array.isArray(body.appState)
    ) {
      throw new HttpError(400, 'appState must be an object');
    }

    const now = new Date();
    const editorObjId = new Types.ObjectId(user.id);

    const updated = await Scene.findOneAndUpdate(
      { _id: req.params.id, deletedAt: null },
      {
        $set: {
          elements: body.elements,
          appState: body.appState,
          updatedAt: now,
          lastEditedById: editorObjId,
          lastEditedAt: now,
        },
      },
      { new: true }
    );
    if (!updated) {
      throw new HttpError(400, 'cannot edit a deleted scene');
    }

    const cutoff = new Date(now.getTime() - SNAPSHOT_INTERVAL_MS);
    const snapshotClaim = await Scene.updateOne(
      {
        _id: req.params.id,
        $or: [
          { lastSnapshotAt: null },
          { lastSnapshotAt: { $lt: cutoff } },
        ],
      },
      { $set: { lastSnapshotAt: now } }
    );
    const shouldSnapshot = snapshotClaim.modifiedCount === 1;

    if (shouldSnapshot) {
      await SceneVersion.create({
        sceneId: req.params.id,
        elements: body.elements,
        appState: body.appState,
        createdBy: editorObjId,
        createdAt: now,
      });
    }

    // Soft quota: only recompute when we just wrote a snapshot. Snapshots
    // are throttled to once per 5 minutes per scene, so this caps the extra
    // DB cost to ~1 quota recompute every 5 minutes per active editor —
    // not once per second of typing. The frontend QuotaBar separately polls
    // /users/me/stats so the bar still drifts current; this in-response
    // quotaUsage is a bonus that lets the bar update immediately around
    // snapshot boundaries without an extra roundtrip. Save itself is never
    // rejected — quota stays a soft warning surfaced via the response shape.
    let quotaUsage:
      | { used: number; limit: number; over: boolean }
      | undefined;
    if (shouldSnapshot) {
      const [bytesUsed, limit] = await Promise.all([
        computeUserStorageBytes(user.id),
        getUserStorageLimit(user.id),
      ]);
      quotaUsage = { used: bytesUsed, limit, over: bytesUsed > limit };
    }

    res.json({
      updatedAt: updated.updatedAt,
      ...(quotaUsage ? { quotaUsage } : {}),
    });

    if (shouldSnapshot) {
      void pruneVersions(req.params.id).catch((err) =>
        console.error('pruneVersions failed:', err)
      );
    }
  })
);

// PATCH /scenes/:id — rename / move folder / set tags (owner)
router.patch(
  '/scenes/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const scene = await loadSceneOrThrow(req.params.id);
    const role = requireRole(roleFor(user, scene), 'owner');

    const body = req.body as {
      title?: unknown;
      folderId?: unknown;
      tags?: unknown;
    };

    if (body.title !== undefined) {
      if (typeof body.title !== 'string' || !body.title.trim()) {
        throw new HttpError(400, 'title must be a non-empty string');
      }
      scene.title = body.title.trim();
    }

    if (body.folderId !== undefined) {
      if (body.folderId === null) {
        scene.folderId = null;
      } else if (typeof body.folderId === 'string') {
        if (!Types.ObjectId.isValid(body.folderId)) {
          throw new HttpError(400, 'Invalid folderId');
        }
        const folderObjId = new Types.ObjectId(body.folderId);
        const folder = await Folder.findOne({
          _id: folderObjId,
          ownerId: scene.ownerId,
        });
        if (!folder) {
          throw new HttpError(404, 'Folder not found');
        }
        scene.folderId = folderObjId;
      } else {
        throw new HttpError(400, 'folderId must be a string or null');
      }
    }

    if (body.tags !== undefined) {
      scene.tags = normalizeTags(body.tags);
    }

    // Bump updatedAt so ETag-based caching on GET /scenes picks up the change.
    if (body.title !== undefined || body.folderId !== undefined || body.tags !== undefined) {
      scene.updatedAt = new Date();
    }

    await scene.save();

    if (body.title !== undefined) logActivity(scene._id, user.id, 'renamed', scene.title);
    if (body.folderId !== undefined) logActivity(scene._id, user.id, 'moved');
    if (body.tags !== undefined) logActivity(scene._id, user.id, 'tagged');

    const item = await buildSceneItemResponse(scene, role, user.id);
    res.json(item);
  })
);

// POST /scenes/:id/restore — restore a soft-deleted scene (owner)
router.post(
  '/scenes/:id/restore',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const scene = await loadSceneOrThrow(req.params.id);
    const role = requireRole(roleFor(user, scene), 'owner');

    if (!scene.deletedAt) {
      throw new HttpError(400, 'scene is not in trash');
    }
    scene.deletedAt = null;
    await scene.save();

    logActivity(scene._id as string, user.id, 'restored');

    const item = await buildSceneItemResponse(scene, role, user.id);
    res.json(item);
  })
);

// POST /scenes/:id/transfer — transfer ownership (owner)
router.post(
  '/scenes/:id/transfer',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const scene = await loadSceneOrThrow(req.params.id);
    requireRole(roleFor(user, scene), 'owner');

    if (scene.deletedAt) {
      throw new HttpError(400, 'cannot transfer a deleted scene');
    }

    const body = req.body as { email?: unknown };
    if (typeof body.email !== 'string' || !body.email.trim()) {
      throw new HttpError(400, 'email required');
    }

    const target = await User.findOne({
      email: body.email.toLowerCase().trim(),
    });
    if (!target) {
      throw new HttpError(404, 'User not found');
    }
    if (target.disabled) {
      throw new HttpError(400, 'Cannot transfer to a disabled user');
    }
    if (target._id.toString() === scene.ownerId.toString()) {
      throw new HttpError(400, 'User is already the owner');
    }

    const previousOwnerId = scene.ownerId;
    scene.ownerId = target._id;

    // Remove the new owner from the shares list (if present).
    scene.shares = scene.shares.filter(
      (s) => s.userId.toString() !== target._id.toString()
    );

    // Add (or replace) the previous owner as an editor.
    scene.shares = scene.shares.filter(
      (s) => s.userId.toString() !== previousOwnerId.toString()
    );
    scene.shares.push({ userId: previousOwnerId, role: 'editor' });

    await scene.save();

    logActivity(scene._id as string, user.id, 'transferred', target.name || target.email);

    // Caller is now (typically) an editor, not owner.
    const newRole = roleFor(user, scene) ?? 'editor';
    const item = await buildSceneItemResponse(scene, newRole, user.id);
    res.json(item);
  })
);

// DELETE /scenes/:id — soft delete by default; ?hard=1 for permanent
router.delete(
  '/scenes/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const scene = await loadSceneOrThrow(req.params.id);
    requireRole(roleFor(user, scene), 'owner');

    const hard = parseTruthy(req.query.hard);

    if (hard) {
      if (!scene.deletedAt) {
        throw new HttpError(
          400,
          'scene must be in trash before permanent delete'
        );
      }
      await SceneVersion.deleteMany({ sceneId: scene._id });
      await Scene.deleteOne({ _id: scene._id });
      res.json({ ok: true, hard: true });
      return;
    }

    if (scene.deletedAt) {
      // Already in trash — idempotent no-op response.
      res.json({ ok: true, hard: false });
      return;
    }

    scene.deletedAt = new Date();
    await scene.save();
    logActivity(scene._id as string, user.id, 'deleted');
    res.json({ ok: true, hard: false });
  })
);

// GET /scenes/:id/versions
router.get(
  '/scenes/:id/versions',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const scene = await loadSceneOrThrow(req.params.id);
    requireRole(roleFor(user, scene), 'viewer');

    const versions = await SceneVersion.find({ sceneId: scene._id })
      .select({ createdAt: 1, createdBy: 1 })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const creatorIds = Array.from(
      new Set(versions.map((v) => v.createdBy.toString()))
    );
    const creators = await User.find({
      _id: { $in: creatorIds.map((i) => new Types.ObjectId(i)) },
    }).lean();
    const creatorMap = new Map(
      creators.map((u) => [u._id.toString(), u])
    );

    res.json(
      versions.map((v) => {
        const c = creatorMap.get(v.createdBy.toString());
        return {
          _id: v._id.toString(),
          createdAt: v.createdAt,
          createdByName: c ? c.name : 'Unknown',
        };
      })
    );
  })
);

// GET /scenes/:id/versions/:versionId
router.get(
  '/scenes/:id/versions/:versionId',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const scene = await loadSceneOrThrow(req.params.id);
    requireRole(roleFor(user, scene), 'viewer');

    if (!Types.ObjectId.isValid(req.params.versionId)) {
      throw new HttpError(400, 'Invalid versionId');
    }

    const version = await SceneVersion.findOne({
      _id: new Types.ObjectId(req.params.versionId),
      sceneId: scene._id,
    }).lean();
    if (!version) {
      throw new HttpError(404, 'Version not found');
    }

    res.json({
      _id: version._id.toString(),
      sceneId: version.sceneId,
      elements: version.elements,
      appState: version.appState,
      createdAt: version.createdAt,
    });
  })
);

// POST /scenes/:id/shares
router.post(
  '/scenes/:id/shares',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const scene = await loadSceneOrThrow(req.params.id);
    requireRole(roleFor(user, scene), 'owner');

    const body = req.body as { email?: unknown; role?: unknown };
    if (typeof body.email !== 'string' || typeof body.role !== 'string') {
      throw new HttpError(400, 'email and role required');
    }
    if (body.role !== 'viewer' && body.role !== 'editor') {
      throw new HttpError(400, 'role must be viewer or editor');
    }

    const target = await User.findOne({
      email: body.email.toLowerCase().trim(),
    });
    if (!target) {
      throw new HttpError(404, 'User not found');
    }
    if (target.disabled) {
      throw new HttpError(400, 'Cannot share with a disabled user');
    }
    if (target._id.toString() === scene.ownerId.toString()) {
      throw new HttpError(400, 'Cannot share with owner');
    }

    const existing = scene.shares.find(
      (s) => s.userId.toString() === target._id.toString()
    );
    if (existing) {
      existing.role = body.role;
    } else {
      scene.shares.push({ userId: target._id, role: body.role });
    }
    scene.updatedAt = new Date();
    await scene.save();

    logActivity(scene._id as string, user.id, 'shared', target.name || target.email);

    res.json({
      userId: target._id.toString(),
      email: target.email,
      name: target.name,
      role: body.role,
    });
  })
);

// DELETE /scenes/:id/shares/:userId
router.delete(
  '/scenes/:id/shares/:userId',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const scene = await loadSceneOrThrow(req.params.id);
    requireRole(roleFor(user, scene), 'owner');

    if (!Types.ObjectId.isValid(req.params.userId)) {
      throw new HttpError(400, 'Invalid userId');
    }

    const before = scene.shares.length;
    scene.shares = scene.shares.filter(
      (s) => s.userId.toString() !== req.params.userId
    );
    if (scene.shares.length === before) {
      throw new HttpError(404, 'Share not found');
    }
    scene.updatedAt = new Date();
    await scene.save();
    logActivity(scene._id as string, user.id, 'unshared');
    res.json({ ok: true });
  })
);

// POST /scenes/:id/star — add caller to starredBy (idempotent)
router.post(
  '/scenes/:id/star',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const scene = await loadSceneMetaOrThrow(req.params.id);
    requireRole(roleFor(user, scene), 'viewer');

    await Scene.updateOne(
      { _id: scene._id },
      { $addToSet: { starredBy: new Types.ObjectId(user.id) } }
    );
    res.json({ starred: true });
  })
);

// DELETE /scenes/:id/star — remove caller from starredBy
router.delete(
  '/scenes/:id/star',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const scene = await loadSceneMetaOrThrow(req.params.id);
    requireRole(roleFor(user, scene), 'viewer');

    await Scene.updateOne(
      { _id: scene._id },
      { $pull: { starredBy: new Types.ObjectId(user.id) } }
    );
    res.json({ starred: false });
  })
);


// GET /tags — distinct tags from scenes the caller can see
router.get(
  '/tags',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const userObjId = new Types.ObjectId(user.id);

    const tags = await Scene.distinct('tags', {
      $or: [{ ownerId: userObjId }, { 'shares.userId': userObjId }],
      deletedAt: null,
    });

    const filtered = tags.filter(
      (t): t is string => typeof t === 'string' && t.length > 0
    );
    filtered.sort((a, b) => a.localeCompare(b));
    res.json(filtered);
  })
);

// GET /scenes/:id/activity — activity log for a scene (cursor-paginated)
router.get(
  '/scenes/:id/activity',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const scene = await loadSceneMetaOrThrow(req.params.id);
    requireRole(roleFor(user, scene), 'viewer');

    const PAGE_SIZE = 30;
    const filter: FilterQuery<typeof ActivityLog> = { sceneId: scene._id };

    // Cursor: ISO date string of the last entry's createdAt from the previous page
    const before = typeof req.query.before === 'string' ? req.query.before : '';
    if (before) {
      const d = new Date(before);
      if (!isNaN(d.getTime())) {
        filter.createdAt = { $lt: d };
      }
    }

    const entries = await ActivityLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(PAGE_SIZE + 1)
      .lean();

    const hasMore = entries.length > PAGE_SIZE;
    const page = hasMore ? entries.slice(0, PAGE_SIZE) : entries;

    // Batch lookup user names
    const userIds = [...new Set(page.map((e) => e.userId.toString()))];
    const users = await User.find({
      _id: { $in: userIds.map((id) => new Types.ObjectId(id)) },
    })
      .select('_id name')
      .lean();
    const nameMap = new Map(users.map((u) => [u._id.toString(), u.name]));

    res.json({
      items: page.map((e) => ({
        _id: e._id.toString(),
        sceneId: e.sceneId,
        userId: e.userId.toString(),
        userName: nameMap.get(e.userId.toString()) || 'Unknown',
        action: e.action,
        detail: e.detail || undefined,
        createdAt: e.createdAt.toISOString(),
      })),
      hasMore,
    });
  })
);

export default router;
