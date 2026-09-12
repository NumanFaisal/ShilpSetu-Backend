import OpenAI from 'openai';
import { GoogleGenAI } from '@google/genai';
import { env } from '../../../config/env';
import type { ProductSpecification } from './ai.types';

export interface CraftVisionBackgroundContext {
  detectedCraft: string;
  craftMaterial: string;
  backgroundPrompt: string;
  surfaceType: string;
}

const CRAFT_BACKGROUND_DESIGN_PROMPT = `You are an art director and commercial product photographer for authentic handcrafted goods.

TASK
Look at the isolated craft product cutout in this image and design a complementary lifestyle background for it — one that suits THIS specific product's material, color, and craft tradition, not a generic template.

STEP 1 — IDENTIFY
- detectedCraft: object name and craft type (e.g. "woven cane basket", "terracotta vase", "brass peacock lamp", "handloom textile")
- craftMaterial: primary material and texture (e.g. "unglazed terracotta, coarse matte surface")

STEP 2 — DESIGN THE BACKGROUND
Choose background elements that genuinely complement this product's material and color — do not default to the same setting for every product. For example: a warm terracotta piece may suit a stone or clay-toned surface; a dark metal lamp may suit rich wood; a pale woven textile may suit a lighter, airier setting. Consider:
- A surface material that complements (not competes with) the product's own color and material
- A wall or backdrop tone that makes the product's colors pop rather than blend in
- Natural, soft directional light (describe direction/quality, e.g. "soft morning light from the left")
- At most one subtle supporting element if it fits the product's context (e.g. a blurred plant, folded linen, a woven mat) — omit if nothing suits, don't force one in
- Shallow depth of field, photorealistic, professional e-commerce styling

Do NOT describe, mention, or re-render the product itself in "backgroundPrompt" — the product will be composited in separately. The prompt describes ONLY the environment behind/around it.

STEP 3 — FORMAT
Write backgroundPrompt as a single flowing descriptive phrase, roughly 15-25 words (approximate is fine — prioritize a natural, complete description over hitting an exact count). Use plain descriptive words separated by spaces only — no commas, no semicolons, no punctuation other than a single closing period.

Respond ONLY with one valid JSON object. No Markdown, no code fences, no commentary.

{
  "detectedCraft": string,
  "craftMaterial": string,
  "backgroundPrompt": string,   // no commas or semicolons; product itself not described
  "surfaceType": "wood" | "marble" | "terracotta" | "stone" | "linen" | "clean"
}`;

function cleanPrompt(prompt: string): string {
  return prompt
    .replace(/[,;]/g, ' ')
    .replace(/[^\w\s.-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let openaiClient: OpenAI | null = null;
function getOpenAIClient(): OpenAI | null {
  if (!openaiClient && env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }
  return openaiClient;
}

let geminiClient: GoogleGenAI | null = null;
function getGeminiClient(): GoogleGenAI | null {
  if (!geminiClient && env.GEMINI_API_KEY) {
    geminiClient = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  }
  return geminiClient;
}

/**
 * AI inspects the craft object directly and formulates a tailored photorealistic background prompt.
 * Provider priority:
 * 1. OpenAI (gpt-4o)
 * 2. Gemini (gemini-3.6-flash)
 * 3. Groq (meta-llama/llama-4-scout-17b-16e-instruct)
 * 4. Craft-aware heuristic synthesis fallback
 */
export async function seeObjectAndGenerateBackgroundPrompt(
  cutoutOrImageBuffer: Buffer,
  productSpec?: ProductSpecification | null,
  requestedStyle: string = 'smart_contextual'
): Promise<CraftVisionBackgroundContext> {
  const base64Image = cutoutOrImageBuffer.toString('base64');

  // ─── 1. FIRST: OpenAI (gpt-4o) ───────────────────────────
  const openai = getOpenAIClient();
  if (openai) {
    try {
      console.log('[Vision AI] Step 1: Inspecting craft object with OpenAI (gpt-4o)...');
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o',
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
      });

      const raw = completion.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(raw);
      if (parsed.backgroundPrompt && parsed.detectedCraft) {
        console.log(
          `[Vision AI] ✅ OpenAI detected "${parsed.detectedCraft}". Prompt: "${parsed.backgroundPrompt}"`
        );
        return {
          detectedCraft: parsed.detectedCraft,
          craftMaterial: parsed.craftMaterial || 'Handcrafted artisan material',
          backgroundPrompt: cleanPrompt(parsed.backgroundPrompt),
          surfaceType: parsed.surfaceType || 'wood',
        };
      }
    } catch (err: any) {
      console.warn('[Vision AI] OpenAI vision inspection failed, cascading to Gemini:', err.message);
    }
  }

  // ─── 2. SECOND: Gemini (gemini-3.6-flash) ─────────────────
  const gemini = getGeminiClient();
  if (gemini) {
    try {
      console.log('[Vision AI] Step 2: Inspecting craft object with Gemini (gemini-3.6-flash)...');
      const response = await gemini.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: [
          {
            role: 'user',
            parts: [
              {
                inlineData: {
                  data: base64Image,
                  mimeType: 'image/png',
                },
              },
              { text: CRAFT_BACKGROUND_DESIGN_PROMPT },
            ],
          },
        ],
      });

      const responseText = response.text || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        if (parsed.backgroundPrompt && parsed.detectedCraft) {
          console.log(
            `[Vision AI] ✅ Gemini detected "${parsed.detectedCraft}". Prompt: "${parsed.backgroundPrompt}"`
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
      console.warn('[Vision AI] Gemini vision inspection failed, cascading to Groq:', err.message);
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
