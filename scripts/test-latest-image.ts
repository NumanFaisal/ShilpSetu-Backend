import { db } from '../src/prisma/db';
import { r2 } from '../src/lib/r2';
import sharp from 'sharp';
import fs from 'fs';
import { removeBackground } from '../src/modules/image/processing/segmentation';
import { cleanupCutout } from '../src/modules/image/processing/cleanup';
import { reconstructStudioEnvironment } from '../src/modules/image/processing/studio';
import { applyRealisticContactShadow } from '../src/modules/image/processing/shadow';
import { composeProfessionalStudioShot } from '../src/modules/image/processing/composition';
import { generateOutputFormats } from '../src/modules/image/processing/export';

async function testWithLatestUserImage() {
  console.log('Fetching latest images from DB...');
  const images = await db.orm.public.ProductImage.where({}).all();
  console.log(`Found ${images.length} images in DB`);

  if (images.length === 0) return;

  const latestImg = images[images.length - 1];
  if (!latestImg) {
    console.log('No image found');
    return;
  }
  console.log('Latest image:', latestImg);

  const originalBuffer = await r2.downloadObject(latestImg.originalKey);
  console.log(`Downloaded original image (${originalBuffer.length} bytes)`);

  // Run Stage 3: Background Removal with Poof.bg
  console.log('Running removeBackground with Poof.bg...');
  const segResult = await removeBackground(originalBuffer);
  console.log('Segmentation method:', segResult.method, 'Cutout size:', segResult.cutoutBuffer.length);
  fs.writeFileSync('scratch_cutout.png', segResult.cutoutBuffer);

  // Run Stage 4: Product Cleanup
  console.log('Running cleanupCutout...');
  const cleanedBuffer = await cleanupCutout(segResult.cutoutBuffer);
  fs.writeFileSync('scratch_cleaned.png', cleanedBuffer);

  // Run Stage 5: Studio Reconstruction
  console.log('Running reconstructStudioEnvironment...');
  const studioResult = await reconstructStudioEnvironment(
    cleanedBuffer,
    {
      productType: 'Whiteboard Marker Ink Box',
      material: 'Paperboard',
      primaryColors: ['Red', 'White', 'Blue'],
      secondaryColors: ['Black'],
      shape: 'Rectangular packaging box',
      texture: 'Gloss paperboard',
      craftsmanship: 'Packaging',
      structuralFeatures: ['Flaps'],
      visibleDecorations: ['Unomax Whiteboard Marker Ink'],
      preservationRules: ['Preserve authentic logo and packaging text'],
    },
    'wooden_surface'
  );
  fs.writeFileSync('scratch_studio.png', studioResult.studioBuffer);

  // Run Stage 7: Shadow
  console.log('Running applyRealisticContactShadow...');
  const shadowBuffer = await applyRealisticContactShadow(cleanedBuffer, studioResult.studioBuffer);
  fs.writeFileSync('scratch_shadow.png', shadowBuffer);

  // Run Stage 8: Composition
  console.log('Running composeProfessionalStudioShot...');
  const composedBuffer = await composeProfessionalStudioShot(shadowBuffer);
  fs.writeFileSync('scratch_composed.png', composedBuffer);

  // Run Stage 9: Export
  console.log('Generating final formats...');
  const finalFormats = await generateOutputFormats(composedBuffer);
  fs.writeFileSync('scratch_final_1x1.jpg', finalFormats.square1x1.buffer);

  console.log('✅ ALL STAGES EXECUTED AND SAVED TO scratch_final_1x1.jpg!');
}

testWithLatestUserImage().catch((err) => console.error('Error:', err));
