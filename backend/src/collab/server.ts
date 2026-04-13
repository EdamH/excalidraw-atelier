import http from 'http';
import { Server } from 'socket.io';
import { socketAuth } from './socketAuth';
import { handleJoinRoom, handleLeaveRoom, handleSceneUpdate, handlePointerUpdate, handleDisconnect, getCollabMetrics, incrementAuthFailure, cleanupMetricsInterval } from './handlers';
import { getActiveRoomCount, getActiveConnectionCount } from './rooms';

export function attachCollabServer(httpServer: http.Server): Server {
  const io = new Server(httpServer, {
    transports: ['websocket'],
    maxHttpBufferSize: 5e6, // 5 MB — matches express.json limit / 4
    cors: {
      origin: process.env.FRONTEND_ORIGIN || '*',
    },
  });

  io.use(async (socket, next) => {
    try {
      await socketAuth(socket, next);
    } catch {
      incrementAuthFailure();
      next(new Error('Unauthorized'));
    }
  });

  io.engine.on('connection_error', () => {
    incrementAuthFailure();
  });

  io.on('connection', (socket) => {
    console.log(`[COLLAB] connected socketId=${socket.id} userId=${socket.data.user?.id}`);

    socket.on('join-room', (data: unknown) => void handleJoinRoom(io, socket, data));
    socket.on('leave-room', (data: unknown) => void handleLeaveRoom(io, socket, data));
    socket.on('scene-update', (data: unknown) => void handleSceneUpdate(io, socket, data));
    socket.on('pointer-update', (data: unknown) => handlePointerUpdate(io, socket, data));
    socket.on('disconnect', () => handleDisconnect(io, socket));
  });

  console.log('[COLLAB] Socket.IO server attached');
  return io;
}

export { cleanupMetricsInterval };

export function collabMetricsHandler(): {
  activeRooms: number;
  activeConnections: number;
  authFailures: number;
  sceneUpdatesPerMin: number;
  pointerUpdatesPerMin: number;
  memoryUsageMB: number;
} {
  const metrics = getCollabMetrics();
  return {
    activeRooms: getActiveRoomCount(),
    activeConnections: getActiveConnectionCount(),
    authFailures: metrics.authFailures,
    sceneUpdatesPerMin: metrics.sceneUpdatesPerMin,
    pointerUpdatesPerMin: metrics.pointerUpdatesPerMin,
    memoryUsageMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
  };
}
