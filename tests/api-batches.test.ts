import app from '../src/app';
import http from 'http';
import axios from 'axios';

let server: http.Server;
const PORT = 4099;
const BASE_URL = `http://localhost:${PORT}`;

async function runApiTests() {
  console.log('🧪 Starting API Endpoints Integration Test Suite...\n');

  server = app.listen(PORT);
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    // 1. Health check
    console.log('API Test 1: GET /api/health');
    const healthRes = await axios.get(`${BASE_URL}/api/health`);
    if (healthRes.status !== 200 || healthRes.data.status !== 'ok') {
      throw new Error('Health check failed');
    }
    console.log('  ✅ Passed: Health check OK.\n');

    // 2. Reject batch with 0 images
    console.log('API Test 2: Reject batch with 0 images (400 Bad Request)');
    try {
      await axios.post(`${BASE_URL}/api/image-batches`, { imageCount: 0 });
      throw new Error('Should have failed with 400');
    } catch (err: any) {
      if (err.response?.status === 400) {
        console.log('  ✅ Passed: 0 images rejected with 400.\n');
      } else {
        throw err;
      }
    }

    // 3. Reject batch with 5 images
    console.log('API Test 3: Reject batch with 5 images (400 Bad Request)');
    try {
      await axios.post(`${BASE_URL}/api/image-batches`, { imageCount: 5 });
      throw new Error('Should have failed with 400');
    } catch (err: any) {
      if (err.response?.status === 400) {
        console.log('  ✅ Passed: 5 images rejected with 400.\n');
      } else {
        throw err;
      }
    }

    // 4. Create batch session with 4 images
    console.log('API Test 4: POST /api/image-batches (4 product photos)');
    const createRes = await axios.post(`${BASE_URL}/api/image-batches`, {
      imageCount: 4,
      style: 'white_studio',
    });

    if (createRes.status !== 201 || !createRes.data.batchId || createRes.data.images.length !== 4) {
      throw new Error(`Batch creation failed: ${JSON.stringify(createRes.data)}`);
    }

    const { batchId, images } = createRes.data;
    console.log(`  ✅ Passed: Batch ${batchId} created with 4 presigned R2 upload URLs.\n`);
    for (const img of images) {
      if (!img.uploadUrl || !img.objectKey.startsWith('shilpsetu/users/')) {
        throw new Error(`Invalid image session: ${JSON.stringify(img)}`);
      }
    }

    // 5. Complete endpoint fails if images are not uploaded to R2
    console.log('API Test 5: POST /api/image-batches/:batchId/complete (before upload)');
    try {
      await axios.post(`${BASE_URL}/api/image-batches/${batchId}/complete`);
      throw new Error('Should have failed because images are not yet uploaded in R2');
    } catch (err: any) {
      if (err.response?.status === 500 || err.response?.status === 400) {
        console.log('  ✅ Passed: Complete upload rejected as expected when files are missing in R2.\n');
      } else {
        throw err;
      }
    }

    // 6. Get Batch Details
    console.log('API Test 6: GET /api/image-batches/:batchId');
    const getRes = await axios.get(`${BASE_URL}/api/image-batches/${batchId}`);
    if (getRes.status !== 200 || getRes.data.batchId !== batchId || getRes.data.totalImages !== 4) {
      throw new Error(`Get batch failed: ${JSON.stringify(getRes.data)}`);
    }
    console.log('  ✅ Passed: Batch details retrieved successfully.\n');

    // 7. Cancel Batch
    console.log('API Test 7: POST /api/image-batches/:batchId/cancel');
    const cancelRes = await axios.post(`${BASE_URL}/api/image-batches/${batchId}/cancel`);
    if (cancelRes.status !== 200 || cancelRes.data.status !== 'CANCELLED') {
      throw new Error('Batch cancellation failed');
    }
    console.log('  ✅ Passed: Batch cancelled successfully without deleting originals.\n');

    console.log('🎉 ALL API INTEGRATION TESTS PASSED!\n');
  } finally {
    server.close();
  }
}

runApiTests().catch((err) => {
  console.error('❌ API Test failed:', err.message);
  if (server) server.close();
  process.exit(1);
});
