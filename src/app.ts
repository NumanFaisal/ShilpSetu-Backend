import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { z } from 'zod';
import authRoutes from './routes/auth.routes';
import imageRoutes from './routes/image.routes';
import styleRoutes from './routes/style.routes';
import marketplaceRoutes from './routes/marketplace.routes';
import catalogRoutes from './routes/catalog.routes';
import voiceRoutes from './routes/voice.routes';
import pricingRoutes from './routes/pricing.routes';
import adminRoutes from './routes/admin.routes';
import i18nRoutes from './routes/i18n.routes';
import productRoutes from './routes/product.routes';
import orderRoutes from './routes/order.routes';
import buyerRequestRoutes from './routes/buyer-request.routes';
// NEW: artisan onboarding + user profile
import artisanRoutes from './routes/artisan.routes';
import userRoutes from './routes/user.routes';

const app = express();

// ─── Global Middleware ────────────────────────────
app.use(helmet({ crossOriginResourcePolicy: false }));
app.use(
  cors({
    origin: true, // Dynamically allow request origin (Expo Web localhost:8081, mobile apps, emulators)
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With'],
  })
);
app.use(morgan('dev'));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── Routes ──────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api', styleRoutes);   // GET /api/studio-styles (public)
// All route files are mounted BEFORE imageRoutes: imageRoutes has a blanket
// router.use(authenticate) that would otherwise 401 every /api/* request
// that reaches it before these routes get a chance to match. Any new route
// file should go above imageRoutes, not below it.
app.use('/api', marketplaceRoutes);
app.use('/api', catalogRoutes);
app.use('/api', voiceRoutes);
app.use('/api', pricingRoutes);
app.use('/api', i18nRoutes);
app.use('/api', artisanRoutes);
app.use('/api', productRoutes);
app.use('/api', orderRoutes);
app.use('/api', userRoutes);
app.use('/api', buyerRequestRoutes);
app.use('/api/admin', adminRoutes);
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
