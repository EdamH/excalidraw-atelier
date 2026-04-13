import { Request, Response, NextFunction } from 'express';

/**
 * Lightweight request logger. Logs method, path, status, duration, and
 * authenticated user (if present). Skips /healthz to avoid noise from
 * k8s probes and docker healthchecks.
 *
 * Format:  HTTP  GET /api/scenes 200 42ms user=abc123
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  // Skip health probes — they fire every few seconds and add no signal
  if (req.path === '/healthz') {
    next();
    return;
  }

  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    const userId = req.user?.id ?? '-';
    const status = res.statusCode;

    // Color-code by status range for quick scanning
    const tag = status >= 500 ? 'ERROR' : status >= 400 ? 'WARN ' : 'INFO ';

    console.log(
      `[HTTP]  ${tag} ${req.method} ${req.originalUrl} ${status} ${duration}ms user=${userId}`
    );
  });

  next();
}
