import app from './app';
import { env } from './config/env';
import { startImageProcessingWorker } from './jobs/imageProcessing.worker';

const PORT = env.PORT || 4000;

// Start BullMQ worker for background image processing
const worker = startImageProcessingWorker();

// Graceful shutdown
process.on('SIGINT', async () => {
  await worker.close();
  process.exit(0);
});
process.on('SIGTERM', async () => {
  await worker.close();
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
