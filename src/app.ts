import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { z } from 'zod';
import authRoutes from './routes/auth.routes';
import imageRoutes from './routes/image.routes';
import styleRoutes from './routes/style.routes';

const app = express();

// ─── Global Middleware ────────────────────────────
app.use(helmet());
app.use(cors({ origin: process.env['FRONTEND_URL'] || '*' }));
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ──────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api', styleRoutes);   // GET /api/studio-styles (public)
app.use('/api', imageRoutes);

// ─── Health Check ─────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── 404 Handler ──────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// ─── Global Error Handler ─────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[App Error]', err);

  if (err instanceof z.ZodError) {
    res.status(400).json({ error: err.issues[0]?.message || 'Invalid input' });
    return;
  }

  if (err.type === 'entity.too.large') {
    res.status(413).json({ error: 'File too large. Max size: 10MB per image.' });
    return;
  }

  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
  });
});

export default app;
