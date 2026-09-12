import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import 'dotenv/config';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function testRealCutoutAIBackground() {
  const cutoutPath = 'C:\\Users\\Numan Faisal\\.gemini\\antigravity-ide\\brain\\d7249d42-2ac1-41c8-9373-2fa91628c945\\poof_bg_basket_cutout.png';
  const cutoutBuf = fs.readFileSync(cutoutPath);

  console.log('1. Uploading transparent cutout to Cloudinary...');
  const uploadResult: any = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: 'shilpsetu_crafts_live',
        resource_type: 'image',
        format: 'png',
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(cutoutBuf);
  });

  console.log('Uploaded! public_id:', uploadResult.public_id);

  // Cloudinary gen_background_replace
  const prompt = 'warm light oak tabletop with soft cream wall and blurred green potted plant in background';
  const genAiUrl = cloudinary.url(uploadResult.public_id, {
    transformation: [
      { effect: `gen_background_replace:prompt_${prompt}` },
      { fetch_format: 'png' },
      { quality: 'auto:best' }
    ]
  });

  console.log('AI Background Gen URL:\n', genAiUrl);
  console.log('Fetching AI generated background image...');

  const response = await fetch(genAiUrl);
  console.log('Fetch response status:', response.status, response.headers.get('content-type'));

  if (response.ok) {
    const buf = Buffer.from(await response.arrayBuffer());
    const outPath = 'C:\\Users\\Numan Faisal\\.gemini\\antigravity-ide\\brain\\d7249d42-2ac1-41c8-9373-2fa91628c945\\final_ai_basket_with_plant.png';
    fs.writeFileSync(outPath, buf);
    console.log('SUCCESS! Saved final AI image to:', outPath, 'size:', buf.length);
  } else {
    console.log('Fetch failed:', await response.text());
  }
}

testRealCutoutAIBackground().catch(console.error);
