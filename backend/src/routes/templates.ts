import { Router, Request, Response } from 'express';
import { Types } from 'mongoose';
import { Template } from '../models/Template';
import { HttpError, asyncHandler } from '../lib/errors';
import { requireAuth, requireAdmin } from '../middleware/auth';

const router = Router();

router.use(requireAuth);

interface TemplateBody {
  name?: unknown;
  description?: unknown;
  elements?: unknown;
  appState?: unknown;
}

function parseName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'name required');
  }
  return value.trim();
}

function parseDescription(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new HttpError(400, 'description required');
  }
  return value.trim();
}

function parseElements(value: unknown): unknown[] {
  if (!Array.isArray(value)) {
    throw new HttpError(400, 'elements must be an array');
  }
  return value;
}

function parseAppState(value: unknown): Record<string, unknown> {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new HttpError(400, 'appState must be an object');
  }
  return value as Record<string, unknown>;
}

// GET /templates — list (auth)
router.get(
  '/templates',
  asyncHandler(async (_req: Request, res: Response) => {
    const templates = await Template.aggregate<{
      _id: Types.ObjectId;
      name: string;
      description: string;
      elementCount: number;
      usageCount: number;
      createdAt: Date;
      updatedAt: Date;
    }>([
      { $sort: { name: 1 } },
      {
        $project: {
          name: 1,
          description: 1,
          createdAt: 1,
          updatedAt: 1,
          usageCount: { $ifNull: ['$usageCount', 0] },
          elementCount: {
            $cond: [
              { $isArray: '$elements' },
              { $size: '$elements' },
              0,
            ],
          },
        },
      },
    ]);
    res.json(
      templates.map((t) => ({
        _id: t._id.toString(),
        name: t.name,
        description: t.description,
        elementCount: t.elementCount,
        usageCount: t.usageCount,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
      }))
    );
  })
);

// GET /templates/:id — full payload (auth)
router.get(
  '/templates/:id',
  asyncHandler(async (req: Request, res: Response) => {
    if (!Types.ObjectId.isValid(req.params.id)) {
      throw new HttpError(404, 'Template not found');
    }
    const template = await Template.findById(req.params.id).lean();
    if (!template) {
      throw new HttpError(404, 'Template not found');
    }
    res.json({
      _id: template._id.toString(),
      name: template.name,
      description: template.description,
      elements: template.elements,
      appState: template.appState,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    });
  })
);

// POST /templates — admin
router.post(
  '/templates',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) throw new HttpError(401, 'Unauthenticated');
    const body = req.body as TemplateBody;
    const name = parseName(body.name);
    const description = parseDescription(body.description);
    const elements = parseElements(body.elements);
    const appState = parseAppState(body.appState);

    const template = await Template.create({
      name,
      description,
      elements,
      appState,
      createdBy: new Types.ObjectId(req.user.id),
    });

    res.status(201).json({
      _id: template._id.toString(),
      name: template.name,
      description: template.description,
      elements: template.elements,
      appState: template.appState,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    });
  })
);

// PATCH /templates/:id — admin
router.patch(
  '/templates/:id',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    if (!Types.ObjectId.isValid(req.params.id)) {
      throw new HttpError(404, 'Template not found');
    }
    const template = await Template.findById(req.params.id);
    if (!template) {
      throw new HttpError(404, 'Template not found');
    }

    const body = req.body as TemplateBody;
    if (body.name !== undefined) {
      template.name = parseName(body.name);
    }
    if (body.description !== undefined) {
      template.description = parseDescription(body.description);
    }
    if (body.elements !== undefined) {
      template.elements = parseElements(body.elements);
    }
    if (body.appState !== undefined) {
      template.appState = parseAppState(body.appState);
    }

    await template.save();

    res.json({
      _id: template._id.toString(),
      name: template.name,
      description: template.description,
      elements: template.elements,
      appState: template.appState,
      createdAt: template.createdAt,
      updatedAt: template.updatedAt,
    });
  })
);

// POST /templates/:id/use — increment usage counter (auth)
// Note: no per-user dedup — the frontend calls this once per importScene,
// but a determined client could inflate counts. Acceptable at ~30 users.
router.post(
  '/templates/:id/use',
  asyncHandler(async (req: Request, res: Response) => {
    if (!Types.ObjectId.isValid(req.params.id)) {
      throw new HttpError(404, 'Template not found');
    }
    const result = await Template.updateOne(
      { _id: new Types.ObjectId(req.params.id) },
      { $inc: { usageCount: 1 } }
    );
    if (result.matchedCount === 0) {
      throw new HttpError(404, 'Template not found');
    }
    res.json({ ok: true });
  })
);

// DELETE /templates/:id — admin
router.delete(
  '/templates/:id',
  requireAdmin,
  asyncHandler(async (req: Request, res: Response) => {
    if (!Types.ObjectId.isValid(req.params.id)) {
      throw new HttpError(404, 'Template not found');
    }
    const result = await Template.deleteOne({
      _id: new Types.ObjectId(req.params.id),
    });
    if (result.deletedCount === 0) {
      throw new HttpError(404, 'Template not found');
    }
    res.json({ ok: true });
  })
);

export default router;
