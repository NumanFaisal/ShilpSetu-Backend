import FormData from 'form-data';
import axios from 'axios';
import fs from 'fs';
import sharp from 'sharp';
import 'dotenv/config';

async function testPoofBg() {
  const imagePath = 'C:\\Users\\Numan Faisal\\.gemini\\antigravity-ide\\brain\\d7249d42-2ac1-41c8-9373-2fa91628c945\\.user_uploaded\\media_1789209388600.png';
  const imgBuffer = fs.readFileSync(imagePath);

  const uploadBuffer = await sharp(imgBuffer)
    .resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer();

  const formData = new FormData();
  formData.append('image_file', uploadBuffer, {
    filename: 'product.jpg',
    contentType: 'image/jpeg',
  });
  formData.append('size', 'auto');
  formData.append('type', 'product');

  console.log('Sending multipart form-data to Poof.bg...');
  try {
    const response = await axios.post(
      process.env.POOF_BG_API_URL || 'https://api.poof.bg/v1/remove',
      formData,
      {
        headers: {
          ...formData.getHeaders(),
          'x-api-key': process.env.POOF_BG_API_KEY,
        },
        responseType: 'arraybuffer',
        timeout: 10000,
      }
    );

    console.log('Poof.bg status:', response.status);
    const cutoutBuf = Buffer.from(response.data);
    console.log('Cutout buffer size:', cutoutBuf.length);
    const target = 'C:/Users/Numan Faisal/.gemini/antigravity-ide/brain/d7249d42-2ac1-41c8-9373-2fa91628c945/poof_bg_basket_cutout.png';
    fs.writeFileSync(target, cutoutBuf);
    console.log('Saved cutout to:', target);
  } catch (err: any) {
    console.error('Poof.bg error:', err.response?.status, err.response?.data?.toString() || err.message);
  }
}

testPoofBg().catch(console.error);
