import axios from 'axios';
import FormData from 'form-data';
import sharp from 'sharp';
import { env } from '../src/config/env';

async function testPoofBg() {
  console.log('Testing poof.bg API with field image_file...');

  const sampleBuffer = await sharp({
    create: { width: 300, height: 300, channels: 3, background: { r: 200, g: 100, b: 50 } },
  }).jpeg().toBuffer();

  const formData = new FormData();
  formData.append('image_file', sampleBuffer, {
    filename: 'product.jpg',
    contentType: 'image/jpeg',
  });

  const res = await axios.post(env.POOF_BG_API_URL, formData, {
    headers: {
      ...formData.getHeaders(),
      'x-api-key': env.POOF_BG_API_KEY,
    },
    responseType: 'arraybuffer',
    timeout: 30000,
  });

  console.log('Poof.bg status:', res.status);
  console.log('Poof.bg returned buffer size:', res.data.length);
  const meta = await sharp(Buffer.from(res.data)).metadata();
  console.log('Poof.bg returned image metadata:', meta);
}

testPoofBg().catch((err) => {
  console.error('Poof error:', err.response?.status, err.response?.data ? Buffer.from(err.response.data).toString() : err.message);
});
