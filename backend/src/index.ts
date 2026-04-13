import http from 'http';
import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { connect, buildMongoUri } from './db';
import authRouter from './routes/auth';
import scenesRouter from './routes/scenes';
import librariesRouter from './routes/libraries';
import usersRouter from './routes/users';
import foldersRouter from './routes/folders';
import adminRouter from './routes/admin';
import templatesRouter from './routes/templates';
import leaderboardRouter from './routes/leaderboard';
import brainstormRouter from './routes/brainstorm';
import compression from 'compression';
import { errorHandler } from './lib/errors';
import { requireAuth, requireAdmin } from './middleware/auth';
import { startWeeklyAwardsCron } from './lib/weeklyAwardsCron';
import { requestLogger } from './middleware/logger';
import { Template } from './models/Template';
import { Scene } from './models/Scene';
import { seedTemplatesData } from './seeds/templates';

const PORT = Number(process.env.PORT || 4000);
const ENABLE_COLLAB = process.env.ENABLE_COLLAB === 'true';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || '*';
const JWT_SECRET = process.env.JWT_SECRET;

const app = express();

app.use(cors({ origin: FRONTEND_ORIGIN }));
app.use(express.json({ limit: '20mb' }));
app.use(compression());
app.use(requestLogger);

app.get('/healthz', (_req, res) => {
  res.status(200).json({ ok: true });
});

app.use('/api/auth', authRouter);
app.use('/api', scenesRouter);
app.use('/api', librariesRouter);
app.use('/api', usersRouter);
app.use('/api', foldersRouter);
app.use('/api', templatesRouter);
app.use('/api', leaderboardRouter);
app.use('/api', brainstormRouter);
app.use('/api', adminRouter);

app.use(errorHandler);

async function seedTemplatesIfEmpty(): Promise<void> {
  try {
    const data = seedTemplatesData();
    let upserted = 0;
    for (const t of data) {
      const result = await Template.updateOne(
        { name: t.name },
        {
          $setOnInsert: {
            name: t.name,
            description: t.description,
            elements: t.elements,
            appState: t.appState,
            createdBy: null,
          },
        },
        { upsert: true }
      );
      if (result.upsertedCount && result.upsertedCount > 0) {
        upserted += 1;
      }
    }
    if (upserted > 0) {
      console.log(`Seeded ${upserted} templates`);
    } else {
      console.log('Templates already present');
    }
  } catch (err) {
    console.error('Template seed failed:', err);
  }
}

// One-time migration: backfill createdAt for scenes created before the field
// existed. Sets createdAt = updatedAt (close-enough approximation). Once
// every scene has createdAt this is a no-op ($exists: false matches nothing).
async function backfillCreatedAt(): Promise<void> {
  try {
    const result = await Scene.updateMany(
      { createdAt: { $exists: false } },
      [{ $set: { createdAt: '$updatedAt' } }]
    );
    if (result.modifiedCount > 0) {
      console.log(`Backfilled createdAt on ${result.modifiedCount} scenes`);
    }
  } catch (err) {
    console.error('createdAt backfill failed:', err);
  }
}

(async () => {
  try {
    if (!JWT_SECRET) {
      throw new Error('JWT_SECRET is required');
    }
    const uri = buildMongoUri();
    await connect(uri);
    console.log('Connected to MongoDB');
    await seedTemplatesIfEmpty();
    await backfillCreatedAt();

    const stopWeeklyAwardsCron = startWeeklyAwardsCron();

    const httpServer = http.createServer(app);

    let io: import('socket.io').Server | null = null;
    let collabCleanup: (() => void) | null = null;
    if (ENABLE_COLLAB) {
      const { attachCollabServer, collabMetricsHandler, cleanupMetricsInterval } = await import('./collab/server');
      io = attachCollabServer(httpServer);
      collabCleanup = cleanupMetricsInterval;
      app.get('/api/collab/metrics', requireAuth, requireAdmin, (_req, res) => {
        res.json(collabMetricsHandler());
      });
    }

    httpServer.listen(PORT, () => {
      console.log(`Backend listening on port ${PORT}${ENABLE_COLLAB ? ' [COLLAB enabled]' : ''}`);
    });

    const shutdown = (signal: string): void => {
      console.log(`${signal} received, shutting down`);
      stopWeeklyAwardsCron();
      if (io) {
        if (collabCleanup) collabCleanup();
        io.close(() => {
          httpServer.close(() => {
            void mongoose.disconnect().finally(() => process.exit(0));
          });
        });
        setTimeout(() => {
          httpServer.close(() => {
            void mongoose.disconnect().finally(() => process.exit(0));
          });
        }, 15000);
      } else {
        httpServer.close(() => {
          void mongoose.disconnect().finally(() => process.exit(0));
        });
      }
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (err) {
    console.error('Startup failed:', err);
    process.exit(1);
  }
})();
