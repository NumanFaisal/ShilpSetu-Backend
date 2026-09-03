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

app.listen(PORT, () => {
  console.log(`
  ┌──────────────────────────────────────────────┐
  │  ShilpSetu Backend — Product Studio API      │
  │                                              │
  │  Server running on http://localhost:${PORT}     │
  │  Environment: ${env.NODE_ENV.padEnd(30)}│
  │                                              │
  │  Endpoints:                                  │
  │  POST /api/image-batches/upload             │
  │  POST /api/image-batches                    │
  │  GET  /api/image-batches/:id                │
  │                                              │
  │  Health: GET /health                         │
  └──────────────────────────────────────────────┘
  `);
});
