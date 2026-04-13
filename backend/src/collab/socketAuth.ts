import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import type { Socket } from 'socket.io';

interface JwtPayload {
  sub: string;
  email: string;
  name: string;
}

export async function socketAuth(socket: Socket, next: (err?: Error) => void): Promise<void> {
  try {
    const token = socket.handshake.auth?.token;
    if (!token || typeof token !== 'string') {
      return next(new Error('Unauthorized'));
    }
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return next(new Error('Unauthorized'));
    }
    let decoded: JwtPayload;
    try {
      decoded = jwt.verify(token, secret, { algorithms: ['HS256'] }) as JwtPayload;
    } catch {
      return next(new Error('Unauthorized'));
    }
    const user = await User.findById(decoded.sub);
    if (!user || user.disabled) {
      return next(new Error('Unauthorized'));
    }
    socket.data.user = { id: user._id.toString(), email: user.email, name: user.name };
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
}
