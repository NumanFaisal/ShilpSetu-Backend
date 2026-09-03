import app from '../src/app';
import http from 'http';
import axios from 'axios';
import FormData from 'form-data';
import sharp from 'sharp';

let server: http.Server;
const PORT = 4096;
const BASE_URL = `http://localhost:${PORT}`;

async function testDirectPostUpload() {
  console.log('🧪 Testing Direct POST Multipart Upload (form-data)...\n');

  server = app.listen(PORT);
  await new Promise((resolve) => setTimeout(resolve, 500));

  try {
    const formData = new FormData();

    // Create 2 test image buffers
    const buffer1 = await sharp({
      create: { width: 400, height: 400, channels: 3, background: { r: 200, g: 150, b: 100 } },
    }).jpeg().toBuffer();

    const buffer2 = await sharp({
      create: { width: 400, height: 400, channels: 3, background: { r: 100, g: 150, b: 200 } },
    }).jpeg().toBuffer();

    formData.append('images', buffer1, { filename: 'photo1.jpg', contentType: 'image/jpeg' });
    formData.append('images', buffer2, { filename: 'photo2.jpg', contentType: 'image/jpeg' });
    formData.append('style', 'wooden_surface');

    const res = await axios.post(`${BASE_URL}/api/image-batches/upload`, formData, {
      headers: formData.getHeaders(),
    });

    console.log('Response Status:', res.status);
    console.log('Response Data:', res.data);

    if (res.status === 201 && res.data.batchId && res.data.images.length === 2) {
      console.log('\n✅ Direct POST Multipart Upload test passed successfully!');
    } else {
      throw new Error('Unexpected response');
    }
  } finally {
    server.close();
  }
}

testDirectPostUpload().catch((err) => {
  console.error('❌ Direct Upload Test Failed:', err.message);
  if (server) server.close();
  process.exit(1);
});
