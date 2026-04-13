interface RoomMember {
  socketId: string;
  userId: string;
  username: string;
  color: string;
  role: 'owner' | 'editor' | 'viewer';
}

const rooms = new Map<string, Map<string, RoomMember>>();

export function joinRoom(sceneId: string, member: RoomMember): void {
  let room = rooms.get(sceneId);
  if (!room) {
    room = new Map();
    rooms.set(sceneId, room);
  }
  room.set(member.socketId, member);
}

export function leaveRoom(sceneId: string, socketId: string): RoomMember | undefined {
  const room = rooms.get(sceneId);
  if (!room) return undefined;
  const member = room.get(socketId);
  if (member) {
    room.delete(socketId);
    if (room.size === 0) rooms.delete(sceneId);
  }
  return member;
}

export function getMembers(sceneId: string): RoomMember[] {
  const room = rooms.get(sceneId);
  if (!room) return [];
  return Array.from(room.values());
}

export function getRoomsForSocket(socketId: string): string[] {
  const result: string[] = [];
  for (const [sceneId, room] of rooms) {
    if (room.has(socketId)) result.push(sceneId);
  }
  return result;
}

export function getActiveRoomCount(): number {
  return rooms.size;
}

export function getActiveConnectionCount(): number {
  const sockets = new Set<string>();
  for (const room of rooms.values()) {
    for (const socketId of room.keys()) sockets.add(socketId);
  }
  return sockets.size;
}
