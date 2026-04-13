import { Scene, IScene } from '../models/Scene';
import { HttpError } from './errors';
import { isAdminEmail } from './admin';

export type Role = 'owner' | 'editor' | 'viewer';
export type MinRole = 'viewer' | 'editor' | 'owner';

interface AuthUser {
  id: string;
  email: string;
  name: string;
}

export async function loadSceneOrThrow(id: string): Promise<IScene> {
  const scene = await Scene.findById(id);
  if (!scene) {
    throw new HttpError(404, 'Scene not found');
  }
  return scene;
}

export async function loadSceneMetaOrThrow(id: string): Promise<IScene> {
  const scene = await Scene.findById(id).select({
    ownerId: 1,
    shares: 1,
    deletedAt: 1,
    starredBy: 1,
    lastSnapshotAt: 1,
  });
  if (!scene) {
    throw new HttpError(404, 'Scene not found');
  }
  return scene;
}

export function roleFor(user: AuthUser, scene: IScene): Role | null {
  if (isAdminEmail(user.email)) {
    return 'owner';
  }
  if (scene.ownerId.toString() === user.id) {
    return 'owner';
  }
  const share = scene.shares.find((s) => s.userId.toString() === user.id);
  if (!share) return null;
  return share.role;
}

const ROLE_RANK: Record<MinRole, number> = {
  viewer: 1,
  editor: 2,
  owner: 3,
};

export function requireRole(role: Role | null, min: MinRole): Role {
  if (!role) {
    throw new HttpError(403, 'Access denied');
  }
  if (ROLE_RANK[role] < ROLE_RANK[min]) {
    throw new HttpError(403, `Requires ${min} role`);
  }
  return role;
}
