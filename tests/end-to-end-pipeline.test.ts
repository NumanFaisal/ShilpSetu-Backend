import app from '../src/app';
import http from 'http';
import axios from 'axios';
import sharp from 'sharp';
import { imageProcessingQueue } from '../src/jobs/queues';
import '../src/jobs/imageProcessing.worker'; // Start worker in process

let server: http.Server;
const PORT = 4097;
const BASE_URL = `http://localhost:${PORT}`;

async function runEndToEndPipelineTest() {
  console.log('🚀 Starting Full End-to-End Image Studio Pipeline Test...\n');

  // Clean and drain any stale jobs from previous runs
  await imageProcessingQueue.drain();
  await imageProcessingQueue.clean(0, 1000, 'delayed');
  await imageProcessingQueue.clean(0, 1000, 'failed');
  await imageProcessingQueue.clean(0, 1000, 'completed');
  await imageProcessingQueue.clean(0, 1000, 'wait');

  server = app.listen(PORT);
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    // 1. Request upload session for 2 artisan photos
    console.log('Step 1: Requesting batch upload session for 2 photos...');
    const createRes = await axios.post(`${BASE_URL}/api/image-batches`, {
      imageCount: 2,
      style: 'wooden_surface',
    });

    const { batchId, images } = createRes.data;
    console.log(`  ✅ Batch created: ${batchId}`);
    console.log(`  ✅ Received ${images.length} presigned R2 upload URLs.\n`);

    // 2. Create real artisan product images and upload them directly to Cloudflare R2 via presigned URLs
    console.log('Step 2: Uploading 2 product images directly to Cloudflare R2 via Presigned URLs...');
    for (let i = 0; i < images.length; i++) {
      const img = images[i];

      // Create a clean sample artisan craft image (wood-toned pottery)
      const sampleImageBuffer = await sharp({
        create: {
          width: 800,
          height: 800,
          channels: 3,
          background: i === 0 ? { r: 190, g: 130, b: 80 } : { r: 160, g: 110, b: 70 },
        },
      })
        .jpeg({ quality: 90 })
        .toBuffer();

      console.log(`  Uploading image ${i + 1}/${images.length} (${img.imageId}) to R2...`);
      const putRes = await axios.put(img.uploadUrl, sampleImageBuffer, {
        headers: {
          'Content-Type': 'image/jpeg',
        },
        timeout: 30000,
      });

      if (putRes.status !== 200) {
        throw new Error(`R2 Direct Upload failed for image ${img.imageId} with status ${putRes.status}`);
      }
      console.log(`  ✅ Uploaded image ${img.imageId} directly to R2.`);
    }
    console.log('  ✅ All images uploaded to Cloudflare R2 successfully.\n');

    // 3. Mark batch upload complete to trigger BullMQ queue jobs
    console.log('Step 3: Notifying backend that uploads are complete (POST /complete)...');
    const completeRes = await axios.post(`${BASE_URL}/api/image-batches/${batchId}/complete`);
    console.log(`  ✅ Batch queued for asynchronous processing. Queued jobs: ${completeRes.data.queuedJobs}\n`);

    // 4. Poll batch status until COMPLETED or timeout
    console.log('Step 4: Waiting for BullMQ worker to process all stages through AI Product Studio pipeline...');
    let isCompleted = false;
    let attempts = 0;
    const maxAttempts = 60;

    while (!isCompleted && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      attempts++;

      const statusRes = await axios.get(`${BASE_URL}/api/image-batches/${batchId}`);
      const batchData = statusRes.data;

      console.log(
        `  [Status Check ${attempts}] Batch Status: ${batchData.status}, Completed: ${batchData.completedImages}/${batchData.totalImages}, Failed: ${batchData.failedImages}`
      );

      for (const img of batchData.images) {
        console.log(`    - Image ${img.imageId}: Step=${img.currentStep}, Progress=${img.progress}%, Status=${img.status}`);
      }

      if (batchData.status === 'COMPLETED') {
        isCompleted = true;
        console.log('\n🎉 Step 5: Batch processing completed successfully!');
        
        // Verify final outputs
        for (const img of batchData.images) {
          if (!img.outputs?.square || !img.outputs?.portrait || !img.outputs?.landscape) {
            throw new Error(`Missing output format URLs for image ${img.imageId}`);
          }
          console.log(`\n  Image ${img.imageId} Final Signed Download URLs:`);
          console.log(`    - 1:1 Square:     ${img.outputs.square.slice(0, 80)}...`);
          console.log(`    - 4:5 Portrait:   ${img.outputs.portrait.slice(0, 80)}...`);
          console.log(`    - 16:9 Landscape: ${img.outputs.landscape.slice(0, 80)}...`);
        }
        break;
      }

      if (batchData.status === 'FAILED') {
        throw new Error('Batch failed during processing');
      }
    }

    if (!isCompleted) {
      throw new Error('Timeout waiting for batch processing to complete');
    }

    console.log('\n🌟 FULL END-TO-END PIPELINE VALIDATION SUCCEEDED 100%!\n');
  } finally {
    server.close();
  }
}

runEndToEndPipelineTest().catch((err) => {
  console.error('❌ Pipeline Test Error:', err.message);
  if (server) server.close();
  process.exit(1);
});
