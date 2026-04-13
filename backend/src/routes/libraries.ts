import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { Library } from '../models/Library';
import { HttpError, asyncHandler } from '../lib/errors';
import { requireAuth } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

function currentUser(req: Request): { id: string; email: string; name: string } {
  if (!req.user) throw new HttpError(401, 'Unauthenticated');
  return req.user;
}

function itemCount(libraryItems: unknown): number {
  return Array.isArray(libraryItems) ? libraryItems.length : 0;
}

// GET /libraries — list caller's libraries
router.get(
  '/libraries',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const libraries = await Library.find({
      ownerId: new Types.ObjectId(user.id),
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json(
      libraries.map((l) => ({
        _id: l._id.toString(),
        name: l.name,
        itemCount: itemCount(l.libraryItems),
        createdAt: l.createdAt,
        updatedAt: l.updatedAt,
      }))
    );
  })
);

// GET /libraries/:id — full library with items
router.get(
  '/libraries/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    if (!Types.ObjectId.isValid(req.params.id)) {
      throw new HttpError(404, 'Library not found');
    }

    const library = await Library.findOne({
      _id: new Types.ObjectId(req.params.id),
      ownerId: new Types.ObjectId(user.id),
    }).lean();

    if (!library) {
      throw new HttpError(404, 'Library not found');
    }

    res.json({
      _id: library._id.toString(),
      name: library.name,
      libraryItems: library.libraryItems,
      createdAt: library.createdAt,
      updatedAt: library.updatedAt,
    });
  })
);

// POST /libraries — create
router.post(
  '/libraries',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    const body = req.body as { name?: unknown; libraryItems?: unknown };

    if (typeof body.name !== 'string' || !body.name.trim()) {
      throw new HttpError(400, 'name required');
    }
    const name = body.name.trim();
    if (name.length > 120) {
      throw new HttpError(400, 'name must be at most 120 characters');
    }

    if (!Array.isArray(body.libraryItems)) {
      throw new HttpError(400, 'libraryItems must be an array');
    }
    const libraryItems = body.libraryItems;

    const library = await Library.create({
      ownerId: new Types.ObjectId(user.id),
      name,
      libraryItems,
    });

    res.status(201).json({
      _id: library._id.toString(),
      name: library.name,
      itemCount: itemCount(library.libraryItems),
      createdAt: library.createdAt,
      updatedAt: library.updatedAt,
    });
  })
);

// PATCH /libraries/:id — rename
router.patch(
  '/libraries/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    if (!Types.ObjectId.isValid(req.params.id)) {
      throw new HttpError(404, 'Library not found');
    }

    const body = req.body as { name?: unknown };
    if (typeof body.name !== 'string' || !body.name.trim()) {
      throw new HttpError(400, 'name required');
    }
    const name = body.name.trim();
    if (name.length > 120) {
      throw new HttpError(400, 'name must be at most 120 characters');
    }

    const library = await Library.findOne({
      _id: new Types.ObjectId(req.params.id),
      ownerId: new Types.ObjectId(user.id),
    });
    if (!library) {
      throw new HttpError(404, 'Library not found');
    }

    library.name = name;
    await library.save();

    res.json({
      _id: library._id.toString(),
      name: library.name,
      itemCount: itemCount(library.libraryItems),
      createdAt: library.createdAt,
      updatedAt: library.updatedAt,
    });
  })
);

// DELETE /libraries/:id
router.delete(
  '/libraries/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const user = currentUser(req);
    if (!Types.ObjectId.isValid(req.params.id)) {
      throw new HttpError(404, 'Library not found');
    }

    const result = await Library.deleteOne({
      _id: new Types.ObjectId(req.params.id),
      ownerId: new Types.ObjectId(user.id),
    });
    if (result.deletedCount === 0) {
      throw new HttpError(404, 'Library not found');
    }

    res.json({ ok: true });
  })
);

export default router;
