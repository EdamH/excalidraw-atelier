import type { Socket, Server } from 'socket.io';
import { Scene } from '../models/Scene';
import { loadSceneMetaOrThrow, roleFor, requireRole } from '../lib/access';
import { joinRoom, leaveRoom, getMembers, getRoomsForSocket } from './rooms';

const COLORS = ['#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'];

function userColor(userId: string): string {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = ((hash << 5) - hash + userId.charCodeAt(i)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

// Metrics
let authFailures = 0;
let sceneUpdatesLastMin = 0;
let pointerUpdatesLastMin = 0;
const metricsResetInterval = setInterval(() => { sceneUpdatesLastMin = 0; pointerUpdatesLastMin = 0; }, 60000);

export function cleanupMetricsInterval(): void {
  clearInterval(metricsResetInterval);
}

// Pointer rate-limit: last timestamp per socket
const lastPointerTs = new Map<string, number>();

export function incrementAuthFailure(): void {
  authFailures++;
}

export function getCollabMetrics(): { authFailures: number; sceneUpdatesPerMin: number; pointerUpdatesPerMin: number } {
  return {
    authFailures,
    sceneUpdatesPerMin: sceneUpdatesLastMin,
    pointerUpdatesPerMin: pointerUpdatesLastMin,
  };
}

interface SocketUser {
  id: string;
  email: string;
  name: string;
}

function getUser(socket: Socket): SocketUser {
  const user = socket.data.user as SocketUser | undefined;
  if (!user) throw new Error('Unauthorized');
  return user;
}

export async function handleJoinRoom(io: Server, socket: Socket, data: unknown): Promise<void> {
  try {
    if (!data || typeof data !== 'object' || !('sceneId' in data)) {
      socket.emit('error', { message: 'Invalid join-room payload' });
      return;
    }
    const { sceneId } = data as { sceneId: unknown };
    if (typeof sceneId !== 'string') {
      socket.emit('error', { message: 'Invalid sceneId' });
      return;
    }

    const user = getUser(socket);

    // Permission check via lightweight meta query
    const sceneMeta = await loadSceneMetaOrThrow(sceneId);
    const role = roleFor(user, sceneMeta);
    requireRole(role, 'viewer');

    // Load full scene for init data (elements + appState)
    const fullScene = await Scene.findById(sceneId);
    if (!fullScene) {
      socket.emit('error', { message: 'Scene not found' });
      return;
    }

    const color = userColor(user.id);
    joinRoom(sceneId, {
      socketId: socket.id,
      userId: user.id,
      username: user.name,
      color,
      role: role!,
    });

    await socket.join(sceneId);

    // Send scene data to the joining client
    socket.emit('scene-init', {
      elements: fullScene.elements,
      appState: fullScene.appState,
      collaborators: getMembers(sceneId).map((m) => ({
        userId: m.userId,
        username: m.username,
        color: m.color,
        role: m.role,
      })),
    });

    // Notify others
    socket.to(sceneId).emit('collaborator-joined', {
      userId: user.id,
      username: user.name,
      color,
      role: role!,
    });

    console.log(`[COLLAB] join-room sceneId=${sceneId} userId=${user.id} role=${role}`);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[COLLAB] join-room error: ${message}`);
    socket.emit('error', { message: 'Failed to join room' });
  }
}

export async function handleLeaveRoom(io: Server, socket: Socket, data: unknown): Promise<void> {
  try {
    if (!data || typeof data !== 'object' || !('sceneId' in data)) {
      socket.emit('error', { message: 'Invalid leave-room payload' });
      return;
    }
    const { sceneId } = data as { sceneId: unknown };
    if (typeof sceneId !== 'string') {
      socket.emit('error', { message: 'Invalid sceneId' });
      return;
    }

    const member = leaveRoom(sceneId, socket.id);
    await socket.leave(sceneId);

    if (member) {
      socket.to(sceneId).emit('collaborator-left', {
        userId: member.userId,
        username: member.username,
      });
      console.log(`[COLLAB] leave-room sceneId=${sceneId} userId=${member.userId}`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[COLLAB] leave-room error: ${message}`);
  }
}

export async function handleSceneUpdate(io: Server, socket: Socket, data: unknown): Promise<void> {
  try {
    if (!data || typeof data !== 'object' || !('sceneId' in data)) {
      socket.emit('error', { message: 'Invalid scene-update payload' });
      return;
    }
    const payload = data as { sceneId: unknown; elements: unknown; appState: unknown };
    if (typeof payload.sceneId !== 'string') {
      socket.emit('error', { message: 'Invalid sceneId' });
      return;
    }

    if (!Array.isArray(payload.elements)) {
      socket.emit('error', { message: 'Invalid payload' });
      return;
    }

    // Verify sender has editor role via room membership
    const members = getMembers(payload.sceneId);
    const senderMember = members.find((m) => m.socketId === socket.id);
    if (!senderMember) {
      socket.emit('error', { message: 'Not in room' });
      return;
    }
    if (senderMember.role === 'viewer') {
      socket.emit('error', { message: 'Viewers cannot update scenes' });
      return;
    }

    sceneUpdatesLastMin++;

    // Pure relay — broadcast to room except sender (elements only, no appState per D11)
    socket.to(payload.sceneId).emit('scene-update', {
      elements: payload.elements,
      fromUserId: senderMember.userId,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error(`[COLLAB] scene-update error: ${message}`);
  }
}

export function handlePointerUpdate(io: Server, socket: Socket, data: unknown): void {
  try {
    if (!data || typeof data !== 'object' || !('sceneId' in data)) return;
    const payload = data as { sceneId: unknown; pointer: unknown; button: unknown };
    if (typeof payload.sceneId !== 'string') return;
    // Validate pointer shape
    const ptr = payload.pointer;
    if (!ptr || typeof ptr !== 'object' || !('x' in ptr) || !('y' in ptr)) return;
    const { x, y } = ptr as { x: unknown; y: unknown };
    if (typeof x !== 'number' || typeof y !== 'number') return;
    if (payload.button !== 'up' && payload.button !== 'down') return;

    // Rate limit: 50ms per socket
    const now = Date.now();
    const last = lastPointerTs.get(socket.id);
    if (last !== undefined && now - last < 50) return;
    lastPointerTs.set(socket.id, now);

    const user = getUser(socket);
    const members = getMembers(payload.sceneId);
    const member = members.find((m) => m.socketId === socket.id);
    pointerUpdatesLastMin++;

    // Volatile broadcast — OK to drop
    socket.to(payload.sceneId).volatile.emit('pointer-update', {
      fromUserId: user.id,
      pointer: payload.pointer,
      button: payload.button,
      username: member?.username ?? user.name,
      color: member?.color ?? COLORS[0],
    });
  } catch {
    // Pointer updates are best-effort, silently drop errors
  }
}

export function handleDisconnect(io: Server, socket: Socket): void {
  const rooms = getRoomsForSocket(socket.id);
  for (const sceneId of rooms) {
    const member = leaveRoom(sceneId, socket.id);
    if (member) {
      socket.to(sceneId).emit('collaborator-left', {
        userId: member.userId,
        username: member.username,
      });
    }
  }
  lastPointerTs.delete(socket.id);
  console.log(`[COLLAB] disconnected socketId=${socket.id}`);
}
