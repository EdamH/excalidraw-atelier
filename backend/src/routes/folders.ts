import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { Folder } from '../models/Folder';
import { Scene } from '../models/Scene';
import { HttpError, asyncHandler } from '../lib/errors';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

function currentUser(req: Request): { id: string; email: string; name: string } {
  if (!req.user) throw new HttpError(401, 'Unauthenticated');
  return req.user;
}

function parseName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'name required');
  }
  const trimmed = value.trim();
  if (trimmed.length > 120) {
    throw new HttpError(400, 'name must be at most 120 characters');
  }
  return trimmed;
}

// GET /folders — list caller's folders with sceneCount
router.get(
  '/folders',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const ownerObjId = new Types.ObjectId(user.id);

    const folders = await Folder.find({ ownerId: ownerObjId })
      .sort({ name: 1 })
      .lean();

    if (folders.length === 0) {
      res.json([]);
      return;
    }

    const counts = await Scene.aggregate<{ _id: Types.ObjectId; count: number }>([
      {
        $match: {
          ownerId: ownerObjId,
          deletedAt: null,
          folderId: { $in: folders.map((f) => f._id) },
        },
      },
      { $group: { _id: '$folderId', count: { $sum: 1 } } },
    ]);
    const countMap = new Map<string, number>(
      counts.map((c) => [c._id.toString(), c.count])
    );

    res.json(
      folders.map((f) => ({
        _id: f._id.toString(),
        name: f.name,
        sceneCount: countMap.get(f._id.toString()) ?? 0,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
      }))
    );
  })
);

// POST /folders
router.post(
  '/folders',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = req.body as { name?: unknown };
    const name = parseName(body.name);

    const folder = await Folder.create({
      ownerId: new Types.ObjectId(user.id),
      name,
    });

    res.status(201).json({
      _id: folder._id.toString(),
      name: folder.name,
      sceneCount: 0,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    });
  })
);

// PATCH /folders/:id — rename
router.patch(
  '/folders/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    if (!Types.ObjectId.isValid(req.params.id)) {
      throw new HttpError(404, 'Folder not found');
    }
    const body = req.body as { name?: unknown };
    const name = parseName(body.name);

    const folder = await Folder.findOne({
      _id: new Types.ObjectId(req.params.id),
      ownerId: new Types.ObjectId(user.id),
    });
    if (!folder) {
      throw new HttpError(404, 'Folder not found');
    }
    folder.name = name;
    await folder.save();

    const sceneCount = await Scene.countDocuments({
      ownerId: new Types.ObjectId(user.id),
      folderId: folder._id,
      deletedAt: null,
    });

    res.json({
      _id: folder._id.toString(),
      name: folder.name,
      sceneCount,
      createdAt: folder.createdAt,
      updatedAt: folder.updatedAt,
    });
  })
);

// DELETE /folders/:id — delete folder, unset folderId on scenes
router.delete(
  '/folders/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    if (!Types.ObjectId.isValid(req.params.id)) {
      throw new HttpError(404, 'Folder not found');
    }
    const ownerObjId = new Types.ObjectId(user.id);
    const folderObjId = new Types.ObjectId(req.params.id);

    const folder = await Folder.findOne({
      _id: folderObjId,
      ownerId: ownerObjId,
    });
    if (!folder) {
      throw new HttpError(404, 'Folder not found');
    }

    await Scene.updateMany(
      { ownerId: ownerObjId, folderId: folderObjId },
      { $set: { folderId: null } }
    );
    await Folder.deleteOne({ _id: folderObjId });

    res.json({ ok: true });
  })
);

export default router;
