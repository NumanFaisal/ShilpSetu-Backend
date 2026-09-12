import { GoogleGenAI } from '@google/genai';
import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import sharp from 'sharp';
import 'dotenv/config';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function runEndToEnd() {
  const imagePath = 'C:\\Users\\Numan Faisal\\.gemini\\antigravity-ide\\brain\\d7249d42-2ac1-41c8-9373-2fa91628c945\\.user_uploaded\\media_1789209388600.png';
  const rawBuffer = fs.readFileSync(imagePath);

  console.log('--- Step 1: Poof.bg Background Removal ---');
  let cutoutBuffer = rawBuffer;
  try {
    const poofRes = await fetch(process.env.POOF_BG_API_URL || 'https://api.poof.bg/v1/remove', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.POOF_BG_API_KEY || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: `data:image/png;base64,${rawBuffer.toString('base64')}`,
        type: 'product'
      })
    });
    if (poofRes.ok) {
      const data: any = await poofRes.json();
      if (data.image) {
        cutoutBuffer = Buffer.from(data.image.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        console.log('Poof.bg successful! Cutout size:', cutoutBuffer.length);
      }
    } else {
      console.log('Poof.bg returned status:', poofRes.status);
    }
  } catch (err: any) {
    console.log('Poof.bg error:', err.message);
  }

  console.log('--- Step 2: AI Vision (Gemini 3.6 Flash) sees the object ---');
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const visionRes = await ai.models.generateContent({
    model: 'gemini-3.6-flash',
    contents: [
      {
        role: 'user',
        parts: [
          {
            inlineData: {
              data: cutoutBuffer.toString('base64'),
              mimeType: 'image/png'
            }
          },
          {
            text: `You are an art director and commercial product photographer for authentic Indian handcrafted goods.
Look at the isolated craft product cutout.
Identify:
1. Object name and craft type
2. Material and natural texture
3. Formulate a 20-word prompt for an AI background generator to place this product in an exquisite commercial setting.
Include:
- A warm tabletop surface (e.g., warm polished teak wood or light oak)
- Soft cream wall background with gentle morning sunlight
- A soft blurred green potted houseplant in the background
- Shallow depth of field, photorealistic, professional e-commerce studio

Return ONLY valid JSON:
{
  "detectedCraft": "string",
  "craftMaterial": "string",
  "backgroundPrompt": "string"
}`
          }
        ]
      }
    ]
  });

  const cleanedText = visionRes.text?.replace(/```json|```/g, '').trim() || '{}';
  const visionData = JSON.parse(cleanedText);
  console.log('Vision Analysis:', visionData);

  console.log('--- Step 3: Enhance Craft Cutout Details (Weave Sharpening & Vibrance) ---');
  // Boost clarity, texture sharpening and vibrance so craft weaves pop
  const enhancedCutout = await sharp(cutoutBuffer)
    .modulate({
      brightness: 1.04,
      saturation: 1.14,
    })
    .sharpen({
      sigma: 1.4,
      m1: 1.2,
      m2: 2.0,
    })
    .png()
    .toBuffer();

  console.log('--- Step 4: AI Generative Background via Cloudinary ---');
  const uploadResult: any = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: 'shilpsetu_ai_studio',
        resource_type: 'image',
        format: 'png',
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(enhancedCutout);
  });

  const promptForCloudinary = visionData.backgroundPrompt.replace(/[^\w\s,-]/g, ' ').trim();
  console.log('Using AI Background Prompt:', promptForCloudinary);

  const genAiUrl = cloudinary.url(uploadResult.public_id, {
    transformation: [
      { effect: `gen_background_replace:prompt_${promptForCloudinary}` },
      { fetch_format: 'png' },
      { quality: 'auto:best' }
    ]
  });

  console.log('Cloudinary GenAI URL:\n', genAiUrl);
  console.log('Downloading generated image...');
  const dlRes = await fetch(genAiUrl);
  if (dlRes.ok) {
    const resBuf = Buffer.from(await dlRes.arrayBuffer());
    const outPath = 'C:\\Users\\Numan Faisal\\.gemini\\antigravity-ide\\brain\\d7249d42-2ac1-41c8-9373-2fa91628c945\\scratch\\final_ai_basket_studio.png';
    fs.writeFileSync(outPath, resBuf);
    console.log('SUCCESS! Saved final image to:', outPath, 'size:', resBuf.length, 'bytes');
  } else {
    console.log('Download failed:', dlRes.status, await dlRes.text());
  }
}

runEndToEnd().catch(console.error);
