import app from '../src/app';
import http from 'http';
import axios from 'axios';
import sharp from 'sharp';
import { imageProcessingQueue } from '../src/jobs/queues';
import '../src/jobs/imageProcessing.worker';

let server: http.Server;
const PORT = 4601;
const BASE_URL = `http://localhost:${PORT}`;

async function run() {
  console.log('🚀 Real end-to-end pipeline test (authenticated, actual R2 + worker)\n');

  await imageProcessingQueue.drain();
  await imageProcessingQueue.clean(0, 1000, 'delayed');
  await imageProcessingQueue.clean(0, 1000, 'failed');
  await imageProcessingQueue.clean(0, 1000, 'completed');
  await imageProcessingQueue.clean(0, 1000, 'wait');

  server = app.listen(PORT);
  await new Promise((r) => setTimeout(r, 500));

  try {
    // signup to get a token
    const phone = `9${String(Math.floor(100000000 + Math.random() * 899999999))}`;
    const signup = await axios.post(`${BASE_URL}/api/auth/signup`, {
      name: 'Pipeline Test',
      phone,
      password: 'testpass123',
    });
    const token = signup.data.token;
    const auth = { Authorization: `Bearer ${token}` };
    console.log(`✅ Signed up, got token.\n`);

    // create batch session (2 images)
    const createRes = await axios.post(
      `${BASE_URL}/api/image-batches`,
      { imageCount: 2, style: 'white_studio' },
      { headers: auth }
    );
    const { batchId, images } = createRes.data;
    console.log(`✅ Batch ${batchId} created, ${images.length} presigned URLs.\n`);

    // upload real images to R2
    for (let i = 0; i < images.length; i++) {
      const img = images[i];
      const buf = await sharp({
        create: {
          width: 800,
          height: 800,
          channels: 3,
          background: { r: 190 - i * 30, g: 130, b: 80 },
        },
      })
        .jpeg({ quality: 90 })
        .toBuffer();
      const put = await axios.put(img.uploadUrl, buf, {
        headers: { 'Content-Type': 'image/jpeg' },
        timeout: 30000,
      });
      if (put.status !== 200) throw new Error(`R2 upload failed: ${put.status}`);
    }
    console.log(`✅ 2 images uploaded to R2.\n`);

    // complete upload -> enqueue jobs
    const completeRes = await axios.post(
      `${BASE_URL}/api/image-batches/${batchId}/complete`,
      {},
      { headers: auth }
    );
    console.log(`✅ Complete -> queued ${completeRes.data.queuedJobs} jobs.\n`);

    // poll
    let isCompleted = false;
    let attempts = 0;
    const maxAttempts = 90;
    while (!isCompleted && attempts < maxAttempts) {
      await new Promise((r) => setTimeout(r, 3000));
      attempts++;
      const statusRes = await axios.get(`${BASE_URL}/api/image-batches/${batchId}`, { headers: auth });
      const b = statusRes.data;
      const statuses = b.images.map((im: any) => `${im.status}:${im.currentStep}:${im.progress}%`).join(', ');
      console.log(`  [${attempts}] Batch=${b.status} | ${statuses}`);

      if (b.status === 'COMPLETED') {
        isCompleted = true;
        console.log('\n🎉 BATCH COMPLETED');
        for (const im of b.images) {
          if (!im.outputs?.square || !im.outputs?.portrait || !im.outputs?.landscape) {
            throw new Error(`Missing output URLs for ${im.imageId}`);
          }
        }
        console.log('✅ All images have 1:1, 4:5, 16:9 output URLs.');
        break;
      }
      if (b.status === 'FAILED' || b.status === 'PARTIAL_FAILURE') {
        console.log('\n⚠️  Batch ended with status:', b.status);
        for (const im of b.images) if (im.status === 'FAILED') console.log(`  ❌ ${im.imageId}: ${im.error}`);
        throw new Error(`Batch ${b.status}`);
      }
    }
    if (!isCompleted) throw new Error('Timeout waiting for pipeline');

    console.log('\n🌟 PIPELINE E2E SUCCESS');
    process.exitCode = 0;
  } catch (e: any) {
    console.error('❌ Pipeline test error:', e.response?.data?.error || e.message);
    if (e.response?.data?.images) console.error(JSON.stringify(e.response.data.images, null, 2));
    process.exitCode = 1;
  } finally {
    server.close();
    setTimeout(() => process.exit(process.exitCode ?? 0), 2000);
  }
}

run();
