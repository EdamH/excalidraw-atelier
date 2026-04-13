import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import { User } from '../models/User';
import { HttpError, asyncHandler } from '../lib/errors';
import { requireAuth } from '../middleware/auth';
import { isAdminEmail } from '../lib/admin';

const router = Router();

interface LoginBody {
  email?: unknown;
  password?: unknown;
}

router.post(
  '/login',
  asyncHandler(async (req: Request, res: Response) => {
    const { email, password } = req.body as LoginBody;
    if (typeof email !== 'string' || typeof password !== 'string') {
      throw new HttpError(400, 'email and password required');
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new HttpError(500, 'JWT_SECRET not configured');
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      throw new HttpError(401, 'Invalid credentials');
    }
    if (user.disabled) {
      throw new HttpError(401, 'Invalid credentials');
    }
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) {
      throw new HttpError(401, 'Invalid credentials');
    }

    const options: SignOptions = { expiresIn: '30d' };
    const token = jwt.sign(
      { sub: user._id.toString(), email: user.email, name: user.name },
      secret,
      options
    );

    res.json({
      token,
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        isAdmin: isAdminEmail(user.email),
      },
    });
  })
);

router.get(
  '/me',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new HttpError(401, 'Unauthenticated');
    }
    res.json({
      user: {
        id: req.user.id,
        email: req.user.email,
        name: req.user.name,
        isAdmin: isAdminEmail(req.user.email),
      },
    });
  })
);

// POST /change-password — authenticated self-service password change.
//
// Does NOT invalidate the caller's JWT on success; existing tokens keep
// working until they expire.
router.post(
  '/change-password',
  requireAuth,
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.user) {
      throw new HttpError(401, 'Unauthenticated');
    }

    const body = req.body as {
      currentPassword?: unknown;
      newPassword?: unknown;
    };

    if (typeof body.currentPassword !== 'string') {
      throw new HttpError(400, 'currentPassword required');
    }
    if (typeof body.newPassword !== 'string') {
      throw new HttpError(400, 'newPassword required');
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      throw new HttpError(401, 'Unauthenticated');
    }

    const ok = await bcrypt.compare(body.currentPassword, user.passwordHash);
    if (!ok) {
      throw new HttpError(401, 'Current password is incorrect');
    }

    if (body.newPassword.length < 6) {
      throw new HttpError(400, 'New password must be at least 6 characters');
    }

    user.passwordHash = await bcrypt.hash(body.newPassword, 10);
    await user.save();

    res.json({ ok: true });
  })
);

export default router;
