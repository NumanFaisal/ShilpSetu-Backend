import { v2 as cloudinary } from 'cloudinary';
import fs from 'fs';
import OpenAI from 'openai';
import 'dotenv/config';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

async function testEndToEndAIBackground() {
  const imagePath = 'C:\\Users\\Numan Faisal\\.gemini\\antigravity-ide\\brain\\d7249d42-2ac1-41c8-9373-2fa91628c945\\.user_uploaded\\media_1789209388600.png';
  const imgBuffer = fs.readFileSync(imagePath);

  console.log('1. Calling Vision AI (gpt-4o) to see the object and describe the optimal background...');
  const visionRes = await openai.chat.completions.create({
    model: 'gpt-4o',
    messages: [
      {
        role: 'system',
        content: `You are an expert commercial product photographer and art director for handcrafted artisan goods.
Look at the object in the image carefully.
Identify what the object is (its craft, material, colors, form).
Then, formulate a concise, powerful prompt (15-25 words) for an AI background generation engine to create the most complementary, premium commercial lifestyle background for this specific product.
Include:
- The surface it should rest on (e.g. warm natural wood, stone, marble, terracotta)
- The background wall/ambiance (e.g. soft cream studio wall with gentle morning sunbeam)
- Subtle complementary decorative element(s) (e.g. a small soft blurred potted green plant in the background, delicate linen fabric)
- Soft realistic studio lighting with shallow depth of field

Return ONLY JSON:
{
  "detectedObject": "short title of object",
  "craftMaterial": "material and craft style",
  "backgroundPrompt": "prompt for generative background",
  "rationale": "why this background complements the object"
}`
      },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Analyze this object and create the perfect AI background prompt for it.' },
          {
            type: 'image_url',
            image_url: {
              url: `data:image/png;base64,${imgBuffer.toString('base64')}`
            }
          }
        ]
      }
    ],
    response_format: { type: 'json_object' }
  });

  const parsed = JSON.parse(visionRes.choices[0]?.message?.content || '{}');
  console.log('Vision AI Result:', JSON.stringify(parsed, null, 2));

  console.log('2. Removing background using Poof.bg API...');
  let cutoutBuffer = imgBuffer;
  try {
    const poofRes = await fetch(process.env.POOF_BG_API_URL || 'https://api.poof.bg/v1/remove', {
      method: 'POST',
      headers: {
        'x-api-key': process.env.POOF_BG_API_KEY || '',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: `data:image/png;base64,${imgBuffer.toString('base64')}`,
        type: 'product'
      })
    });
    if (poofRes.ok) {
      const data: any = await poofRes.json();
      if (data.image) {
        cutoutBuffer = Buffer.from(data.image.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        console.log('Poof.bg cutout received! Size:', cutoutBuffer.length);
      }
    } else {
      console.log('Poof.bg status:', poofRes.status, await poofRes.text());
    }
  } catch (err: any) {
    console.log('Poof.bg error:', err.message);
  }

  console.log('3. Uploading cutout to Cloudinary and applying AI gen_background_replace with vision prompt...');
  const uploadResult: any = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: 'shilpsetu_crafts',
        resource_type: 'image',
        format: 'png',
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(cutoutBuffer);
  });

  console.log('Uploaded cutout to Cloudinary, public_id:', uploadResult.public_id);

  // Cloudinary gen_background_replace transformation
  const cleanPrompt = parsed.backgroundPrompt.replace(/[^\w\s,-]/g, ' ').trim();
  const genAiUrl = cloudinary.url(uploadResult.public_id, {
    transformation: [
      { effect: `gen_background_replace:prompt_${cleanPrompt}` },
      { fetch_format: 'png' },
      { quality: 'auto:best' }
    ]
  });

  console.log('AI Background Generated URL:\n', genAiUrl);
  console.log('Downloading result...');
  const dlRes = await fetch(genAiUrl);
  if (dlRes.ok) {
    const resBuf = Buffer.from(await dlRes.arrayBuffer());
    const outPath = 'C:\\Users\\Numan Faisal\\.gemini\\antigravity-ide\\brain\\d7249d42-2ac1-41c8-9373-2fa91628c945\\scratch\\ai_generated_basket.png';
    fs.writeFileSync(outPath, resBuf);
    console.log('SUCCESS! Saved AI generated image to:', outPath, 'size:', resBuf.length, 'bytes');
  } else {
    console.log('Failed to download transformed image:', dlRes.status, await dlRes.text());
  }
}

testEndToEndAIBackground().catch(console.error);
