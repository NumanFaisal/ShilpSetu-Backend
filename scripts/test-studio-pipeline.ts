import fs from 'fs';
import { reconstructStudioEnvironment } from '../src/modules/image/processing/studio';
import 'dotenv/config';

async function testStudioReconstruction() {
  const cutoutPath = 'C:\\Users\\Numan Faisal\\.gemini\\antigravity-ide\\brain\\d7249d42-2ac1-41c8-9373-2fa91628c945\\poof_bg_basket_cutout.png';
  const cutoutBuffer = fs.readFileSync(cutoutPath);

  console.log('Testing reconstructStudioEnvironment with real craft cutout...');
  const result = await reconstructStudioEnvironment(
    cutoutBuffer,
    {
      productType: 'Handcrafted Cane Basket Bowl',
      material: 'Woven cane and bamboo',
      primaryColors: ['Warm Honey', 'Natural Ochre'],
      secondaryColors: ['Golden Brown'],
      texture: 'Coiled natural wicker weave',
      craftsmanship: 'Traditional Assam cane weaving',
      structuralFeatures: ['Reinforced coiled rim', 'Curved circular base'],
      visibleDecorations: ['Braided border rim'],
      handles: 'none',
      edges: 'Handwoven rounded edge',
      symmetry: 'Radial circular',
      orientation: 'Upright',
      visibleText: [],
      logosAndBranding: [],
      surfaceCondition: ['Authentic organic fiber texture'],
      occludedOrUnclearAreas: [],
      preservationRules: ['Preserve authentic weave geometry and natural fiber color'],
      studioProcessingInstructions: {
        background: 'Commercial e-commerce lifestyle setting',
        lighting: 'Soft morning window lighting',
        exposure: 'Balanced natural exposure',
        shadow: 'Soft grounded contact shadow',
        composition: 'Centered product presentation',
        prohibitedChanges: ['Do not alter basket weave or geometry']
      }
    },
    'smart_contextual',
    {
      targetWidth: 1500,
      targetHeight: 1500,
    }
  );

  console.log('--- Studio Result ---');
  console.log('Detected Craft:', result.detectedCraft);
  console.log('Contextual Backdrop:', result.contextualBackdrop);
  console.log('Method:', result.method);
  console.log('Prompt Used:', result.promptUsed);
  console.log('Buffer Size:', result.studioBuffer.length, 'bytes');

  const outPath = 'C:\\Users\\Numan Faisal\\.gemini\\antigravity-ide\\brain\\d7249d42-2ac1-41c8-9373-2fa91628c945\\reconstructed_ai_studio_test.png';
  fs.writeFileSync(outPath, result.studioBuffer);
  console.log('Saved result to:', outPath);
}

testStudioReconstruction().catch(console.error);
