import app from './app';
import { env } from './config/env';
import { startImageProcessingWorker } from './jobs/imageProcessing.worker';
import { startMarketplacePublishWorker } from './jobs/marketplace.worker';

const PORT = env.PORT || 4000;

// Start BullMQ workers for background processing
const imageWorker = startImageProcessingWorker();
const marketplaceWorker = startMarketplacePublishWorker();

// Graceful shutdown
process.on('SIGINT', async () => {
  await imageWorker.close();
  await marketplaceWorker.close();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await imageWorker.close();
  await marketplaceWorker.close();
  process.exit(0);
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`
  ┌──────────────────────────────────────────────┐
  │  ShilpSetu Backend — Product Studio API      │
  │                                              │
  │  Server running on http://localhost:${PORT}     │
  │  Environment: ${env.NODE_ENV.padEnd(30)}│
  │                                              │
  │  Endpoints:                                  │
  │  [C1] POST /api/image-batches/upload         │
  │  [C2] POST /api/voice/process                │
  │  [C2] POST /api/catalog/generate             │
  │  [C3] POST /api/pricing/estimate             │
  │  [C4] GET  /api/public/stores/:slug          │
  │  [C4] POST /api/products/:id/publish         │
  │  [C5] GET  /api/admin/metrics                │
  │                                              │
  │  Health: GET /health                         │
  └──────────────────────────────────────────────┘
  `);
});
