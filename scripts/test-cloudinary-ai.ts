import { v2 as cloudinary } from 'cloudinary';
import sharp from 'sharp';
import 'dotenv/config';

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

async function testUpload() {
  const svg = `<svg width="400" height="400" xmlns="http://www.w3.org/2000/svg">
    <rect width="400" height="400" fill="none" />
    <circle cx="200" cy="200" r="80" fill="#c19a6b" />
  </svg>`;
  const buf = await sharp(Buffer.from(svg)).png().toBuffer();

  console.log('Uploading test PNG cutout to Cloudinary...');
  const uploadResult: any = await new Promise((resolve, reject) => {
    cloudinary.uploader.upload_stream(
      {
        folder: 'shilpsetu_ai',
        resource_type: 'image',
        format: 'png',
      },
      (error, result) => {
        if (error) reject(error);
        else resolve(result);
      }
    ).end(buf);
  });

  console.log('Uploaded cutout public_id:', uploadResult.public_id);
  console.log('Secure URL:', uploadResult.secure_url);

  // Generate transformation URL with gen_background_replace
  const prompt = 'warm wooden tabletop with soft cream wall and a small blurred green potted plant in background';
  const genAiUrl = cloudinary.url(uploadResult.public_id, {
    transformation: [
      { effect: `gen_background_replace:prompt_${prompt}` },
      { fetch_format: 'png' }
    ]
  });

  console.log('Generated AI Background URL:\n', genAiUrl);

  console.log('Fetching generated image from Cloudinary...');
  const response = await fetch(genAiUrl);
  console.log('Response status:', response.status, response.headers.get('content-type'));
  if (response.ok) {
    const arrBuf = await response.arrayBuffer();
    console.log('SUCCESS! Downloaded AI generated background image, size:', arrBuf.byteLength, 'bytes');
  } else {
    const text = await response.text();
    console.log('Failed response:', text);
  }
}

testUpload().catch(console.error);
