import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { HttpError } from '../lib/errors';
import { isAdminEmail } from '../lib/admin';

interface JwtPayload {
  sub: string;
  email: string;
  name: string;
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      throw new HttpError(401, 'Missing or invalid Authorization header');
    }
    const token = header.slice('Bearer '.length).trim();
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      throw new HttpError(500, 'JWT_SECRET not configured');
    }

    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, secret, {
        algorithms: ['HS256'],
      }) as JwtPayload;
    } catch {
      throw new HttpError(401, 'Invalid or expired token');
    }

    const user = await User.findById(decoded.sub);
    if (!user) {
      throw new HttpError(401, 'User not found');
    }
    if (user.disabled) {
      throw new HttpError(403, 'Account disabled');
    }

    req.user = {
      id: user._id.toString(),
      email: user.email,
      name: user.name,
    };
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    next(new HttpError(401, 'Unauthenticated'));
    return;
  }
  if (!isAdminEmail(req.user.email)) {
    next(new HttpError(403, 'Admin access required'));
    return;
  }
  next();
}
