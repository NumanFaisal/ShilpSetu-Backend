import sharp from 'sharp';
import { GoogleGenAI } from '@google/genai';
import { env } from '../../../config/env';
import type { ProductSpecification } from './ai.types';

export interface CraftVisionBackgroundContext {
  detectedCraft: string;
  craftMaterial: string;
  backgroundPrompt: string;
  surfaceType: string;
}

const CRAFT_BACKGROUND_DESIGN_PROMPT = `You are an art director and commercial product photographer specializing in authentic Indian artisan handicrafts and e-commerce listings.

TASK
Look at the isolated craft product in this image and design a tailored, photorealistic lifestyle/studio background that genuinely honors this specific product's craft tradition, material, texture, and cultural aesthetic — not a one-size-fits-all template.

STEP 1 — IDENTIFY
- detectedCraft: specific object name and craft type where identifiable (e.g. "Madhubani Painted Terracotta Vase", "Chanderi Handloom Silk Saree", "Dhokra Brass Tribal Figurine", "Blue Pottery Floral Plate", "Kashmiri Carved Walnut Bowl", "Bamboo Weave Basket"). If the specific regional tradition isn't visually confirmable, name the general craft type instead (e.g. "glazed ceramic vase") rather than guessing a named tradition you can't support from the image.
- craftMaterial: primary material and texture (e.g. "natural unglazed terracotta clay", "pure mulberry silk with metallic zari weave", "cast bell metal brass with antique patina")
- confidence: 0.0-1.0, your certainty in the above identification

STEP 2 — DESIGN THE BACKGROUND
Use these craft-family associations as a STARTING POINT for mood and material, not a fixed script — adapt the specific details (exact surface, color, accent) to what THIS individual piece actually looks like, so two different pottery pieces don't get an identical background:
- Pottery/clay/ceramics → rustic, earthen, artisan workbench mood — warm clay tones, soft courtyard-style sunlight
- Handloom/silk/textiles → boutique display mood — warm wood or stone surface, soft linen or fabric texture, natural window light
- Brass/bronze/metalcraft → heritage mood — carved stone or warm ambient alcove setting, soft golden glow
- Cane/bamboo/wood → natural, organic mood — warm wood-toned surface, airy daylight, optional soft botanical element
- Jewelry/luxury → editorial mood — polished marble or silk surface, soft diffused highlight lighting
- If the product doesn't clearly fit any of these families (e.g. leather, glass, stone carving, painted canvas, leatherwork), reason from first principles: pick a surface and mood that complements its actual color, material, and weight rather than forcing it into the nearest category.

Within whichever mood you land on, apply these rules:
- A surface material that complements (not competes with) the product's own color and material — vary the exact surface, tone, and accent to fit the specific piece, not just the category
- Soft directional light matching a key light from the upper front-left, consistent with standard studio compositing — do not describe conflicting light directions or multiple competing light sources
- At most one subtle supporting element if it genuinely fits (e.g. a blurred plant, folded linen, a woven mat) — omit if nothing suits, don't force one in. Never choose an element similar in shape or silhouette to the product itself (e.g. no second vase-like object behind a vase)
- Shallow depth of field, photorealistic, professional commercial studio styling
- Do NOT describe, mention, or re-render the product itself in "backgroundPrompt" — the product will be composited in separately. The prompt describes ONLY the environment behind/around it.

STEP 3 — FORMAT
Write backgroundPrompt as a single flowing descriptive phrase, roughly 15-25 words (approximate is fine — prioritize a natural, complete description over hitting an exact count). Plain descriptive words separated by spaces only — no commas, no semicolons, no punctuation other than a single closing period.

surfaceType must match whatever surface material you actually described in backgroundPrompt — do not pick a category that contradicts the written description.

Respond ONLY with one valid JSON object. No Markdown, no code fences, no commentary.

{
  "detectedCraft": string,
  "craftMaterial": string,
  "confidence": number,          // 0.0-1.0, certainty in detectedCraft/craftMaterial identification
  "backgroundPrompt": string,    // no commas or semicolons; product itself not described
  "surfaceType": "wood" | "marble" | "terracotta" | "stone" | "linen" | "clean"
}`;

function cleanPrompt(prompt: string): string {
  return prompt
    .replace(/[,;]/g, ' ')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient && env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return geminiClient;
}

/**
 * Uses Gemini API (Vision) exclusively to inspect the craft object
 * and formulate a photorealistic background prompt related to the product.
 */
export async function seeObjectAndGenerateBackgroundPrompt(
  cutoutOrImageBuffer: Buffer,
  productSpec?: ProductSpecification | null,
  requestedStyle: string = 'smart_contextual'
): Promise<CraftVisionBackgroundContext> {
  // Ultra-fast network payload: downscale to 480px JPEG (<30KB) so upload completes in ~150ms instead of 10s
  let base64Image: string;
  let mimeType = 'image/jpeg';
  try {
    const thumb = await sharp(cutoutOrImageBuffer)
      .resize(480, 480, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 80 })
      .toBuffer();
    base64Image = thumb.toString('base64');
  } catch {
    base64Image = cutoutOrImageBuffer.toString('base64');
    mimeType = 'image/png';
  }

  // ─── Gemini API (gemini-2.5-flash -> gemini-2.0-flash -> gemini-1.5-flash) ───
  const gemini = getGeminiClient();
  if (gemini) {
    const geminiModels = ['gemini-3.6-flash'];
    for (const model of geminiModels) {
      try {
        console.log(`[Vision AI] Inspecting craft object with Gemini API (${model})...`);
        const generatePromise = gemini.models.generateContent({
          model,
          contents: [
            {
              role: 'user',
              parts: [
                {
                  inlineData: {
                    data: base64Image,
                    mimeType,
                  },
                },
                { text: CRAFT_BACKGROUND_DESIGN_PROMPT },
              ],
            },
          ],
        });

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`Gemini ${model} vision timed out after 6000ms`)), 6000)
        );

        const response: any = await Promise.race([generatePromise, timeoutPromise]);

        const responseText =
          typeof response.text === 'function' ? response.text() : (response.text || '');
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.backgroundPrompt && parsed.detectedCraft) {
            console.log(
              `[Vision AI] ✅ Gemini API detected "${parsed.detectedCraft}". Product-related background prompt: "${parsed.backgroundPrompt}"`
            );
            return {
              detectedCraft: parsed.detectedCraft,
              craftMaterial: parsed.craftMaterial || 'Handcrafted artisan material',
              backgroundPrompt: cleanPrompt(parsed.backgroundPrompt),
              surfaceType: parsed.surfaceType || 'wood',
            };
          }
        }
      } catch (err: any) {
        console.warn(`[Vision AI] Gemini (${model}) inspection failed:`, err.message);
      }
    }
  }

  // ─── 3. THIRD: Groq (Multimodal Vision) ───────────────────
  if (env.GROQ_API_KEY) {
    try {
      console.log('[Vision AI] Step 3: Inspecting craft object with Groq Vision...');
      const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.GROQ_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'meta-llama/llama-4-scout-17b-16e-instruct',
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: CRAFT_BACKGROUND_DESIGN_PROMPT },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
          response_format: { type: 'json_object' },
          max_tokens: 500,
        }),
      });

      if (groqResponse.ok) {
        const data: any = await groqResponse.json();
        const content = data.choices?.[0]?.message?.content || '{}';
        const parsed = JSON.parse(content);
        if (parsed.backgroundPrompt && parsed.detectedCraft) {
          console.log(
            `[Vision AI] ✅ Groq detected "${parsed.detectedCraft}". Prompt: "${parsed.backgroundPrompt}"`
          );
          return {
            detectedCraft: parsed.detectedCraft,
            craftMaterial: parsed.craftMaterial || 'Handcrafted artisan material',
            backgroundPrompt: cleanPrompt(parsed.backgroundPrompt),
            surfaceType: parsed.surfaceType || 'wood',
          };
        }
      } else {
        const errorText = await groqResponse.text().catch(() => '');
        console.warn(`[Vision AI] Groq API warning (${groqResponse.status}):`, errorText.slice(0, 150));
      }
    } catch (err: any) {
      console.warn('[Vision AI] Groq vision inspection failed, using heuristic fallback:', err.message);
    }
  }

  // ─── 4. FOURTH: Craft-Aware Heuristic Synthesis ────────────
  console.log('[Vision AI] Using craft-aware heuristic prompt synthesizer...');
  return synthesizeCraftBackgroundPrompt(productSpec, requestedStyle);
}

/**
 * Intelligent craft-aware prompt synthesis fallback.
 */
export function synthesizeCraftBackgroundPrompt(
  productSpec?: ProductSpecification | null,
  requestedStyle: string = 'smart_contextual'
): CraftVisionBackgroundContext {
  const normStyle = (requestedStyle || '').toLowerCase().trim();
  const type = (productSpec?.productType || '').toLowerCase();
  const material = (productSpec?.material || '').toLowerCase();
  const craft = (productSpec?.craftsmanship || '').toLowerCase();
  const allText = `${type} ${material} ${craft}`;

  // 1. Woven Baskets / Cane / Bamboo / Jute / Wicker
  if (
    allText.includes('basket') ||
    allText.includes('bucket') ||
    allText.includes('bowl') ||
    allText.includes('cane') ||
    allText.includes('bamboo') ||
    allText.includes('woven') ||
    allText.includes('jute') ||
    allText.includes('wicker') ||
    normStyle === 'botanical_lifestyle'
  ) {
    return {
      detectedCraft: productSpec?.productType || 'Woven Cane Basket',
      craftMaterial: 'Natural woven cane and bamboo fiber',
      backgroundPrompt:
        'warm light oak tabletop with soft cream wall and blurred green potted plant in background with soft natural morning sunlight',
      surfaceType: 'wood',
    };
  }

  // 2. Terracotta / Clay / Pottery / Ceramics
  if (
    allText.includes('clay') ||
    allText.includes('terracotta') ||
    allText.includes('pot') ||
    allText.includes('vase') ||
    allText.includes('ceramic')
  ) {
    return {
      detectedCraft: productSpec?.productType || 'Terracotta Clay Pottery',
      craftMaterial: 'Earthen clay with authentic mineral finish',
      backgroundPrompt:
        'rustic terracotta artisan workbench with warm earthen tones and soft courtyard sunlight and blurred ceramic pottery in background',
      surfaceType: 'terracotta',
    };
  }

  // 3. Brass / Bronze / Copper / Dhokra Metal
  if (
    allText.includes('brass') ||
    allText.includes('bronze') ||
    allText.includes('copper') ||
    allText.includes('dhokra') ||
    allText.includes('metal') ||
    normStyle === 'heritage_courtyard'
  ) {
    return {
      detectedCraft: productSpec?.productType || 'Handcrafted Metal Sculpture',
      craftMaterial: 'Cast brass with antique hand patina',
      backgroundPrompt:
        'heritage Indian carved sandstone alcove with soft golden ambient glow and elegant architectural shadows in background',
      surfaceType: 'stone',
    };
  }

  // 4. Handloom / Silk / Saree / Textiles
  if (
    allText.includes('silk') ||
    allText.includes('saree') ||
    allText.includes('textile') ||
    allText.includes('handloom') ||
    allText.includes('cotton') ||
    allText.includes('shawl')
  ) {
    return {
      detectedCraft: productSpec?.productType || 'Handwoven Artisan Textile',
      craftMaterial: 'Organic handloom fabric with rich natural weave',
      backgroundPrompt:
        'warm natural teak boutique display shelf with draped organic linen runner and soft diffused architectural daylight',
      surfaceType: 'wood',
    };
  }

  // 5. Jewelry / Marble / Luxury
  if (
    allText.includes('jewelry') ||
    allText.includes('silver') ||
    allText.includes('gold') ||
    allText.includes('gem') ||
    normStyle === 'luxury_showcase' ||
    normStyle === 'luxury'
  ) {
    return {
      detectedCraft: productSpec?.productType || 'Fine Artisan Jewelry',
      craftMaterial: 'Precious metalwork with gemstone accents',
      backgroundPrompt:
        'luxurious polished white Carrara marble pedestal with soft silk drape and focused jewelry spotlight with elegant reflections',
      surfaceType: 'marble',
    };
  }

  // Default: Authentic Artisan Workshop
  return {
    detectedCraft: productSpec?.productType || 'Handcrafted Artisan Product',
    craftMaterial: productSpec?.material || 'Natural artisan materials',
    backgroundPrompt:
      'warm handcrafted teak wood table with soft neutral cream wall and gentle morning window light with subtle potted green leaf in background',
    surfaceType: 'wood',
  };
}
