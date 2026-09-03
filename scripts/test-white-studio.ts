import sharp from 'sharp';
import fs from 'fs';
import { cleanupCutout } from '../src/modules/image/processing/cleanup';
import { reconstructStudioEnvironment } from '../src/modules/image/processing/studio';
import { applyRealisticContactShadow } from '../src/modules/image/processing/shadow';
import { composeProfessionalStudioShot } from '../src/modules/image/processing/composition';
import { generateOutputFormats } from '../src/modules/image/processing/export';

async function testWhiteStudio() {
  const cutoutBuffer = fs.readFileSync('scratch_cutout.png');
  const cleanedBuffer = await cleanupCutout(cutoutBuffer);

  const studioResult = await reconstructStudioEnvironment(
    cleanedBuffer,
    {
      productType: 'Pencil Sharpener',
      material: 'Plastic and Metal',
      primaryColors: ['Black', 'Silver'],
      secondaryColors: ['Blue'],
      shape: 'Rectangular block',
      texture: 'Gloss plastic and polished metal',
      craftsmanship: 'Manufactured',
      structuralFeatures: ['Rotary handle'],
      visibleDecorations: ['Silver dial ring'],
      preservationRules: ['Preserve authentic scratches and reflections'],
    },
    'white_studio'
  );

  const shadowBuffer = await applyRealisticContactShadow(cleanedBuffer, studioResult.studioBuffer);
  const composedBuffer = await composeProfessionalStudioShot(shadowBuffer);
  const finalFormats = await generateOutputFormats(composedBuffer);

  fs.writeFileSync('scratch_white_studio_1x1.jpg', finalFormats.square1x1.buffer);
  console.log('✅ Generated scratch_white_studio_1x1.jpg successfully!');
}

testWhiteStudio().catch((err) => console.error('Error:', err));
