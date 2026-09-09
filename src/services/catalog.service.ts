import puppeteer from 'puppeteer';
import { db } from '../prisma/db';
import { r2 } from '../lib/r2';
import { HttpError } from '../lib/http-error';
import { llmService } from '../ai/llm';

export interface GenerateCatalogInput {
  voiceTranscription?: string;
  manualDescription?: string;
  attributes?: {
    productName?: string;
    material?: string;
    craftType?: string;
    size?: string;
    dimensions?: string;
    region?: string;
    [key: string]: any;
  };
  language?: string;
}

export interface GeneratedCatalogOutput {
  name: string;
  titleEn: string;
  titleHi: string;
  aiDescription: string;
  descriptionEn: string;
  descriptionHi: string;
  category: string;
  craftType: string;
  material: string;
  dimensions: string;
  careInstructions: string;
  tags: string[];
  keywords: string[];
}

export interface SaveCatalogInput {
  titleEn?: string;
  titleHi?: string;
  descriptionEn?: string;
  descriptionHi?: string;
  keywords?: string[];
  careInstructions?: string;
  material?: string;
  category?: string;
}

const SMART_CATALOG_PROMPT = `You are a premier e-commerce catalog specialist for the Ministry of Social Justice & Empowerment (MoSJE) and Indian Artisan Handicrafts (ShilpSetu).
You will receive a raw product description (from voice transcription or manual entry) and any extracted craft attributes.

Write a polished, SEO-optimized, bilingual e-commerce catalog listing.
Rules:
- Be authentic to traditional Indian artisan crafts (e.g. Chanderi Silk, Terracotta Pottery, Dhokra Craft, Wooden Carving, Brassware, Blue Pottery).
- Do not invent non-existent materials or specifications; use the facts provided.
- Provide BOTH professional English and authentic, natural Hindi copy.
- Include practical washing/care instructions suited to the craft and material.
- Derive 5-8 high-volume search tags/keywords in lowercase.

Return JSON only, no markdown fences:
{
  "name": string,              // Clear product title under 65 chars (e.g. "Handcrafted Terracotta Floral Vase")
  "titleEn": string,           // Same as name
  "titleHi": string,           // Authentic Hindi title (e.g. "हस्तनिर्मित टेराकोटा नक्काशीदार फूलदान")
  "aiDescription": string,     // 3-4 sentence engaging e-commerce description in English
  "descriptionEn": string,     // Same as aiDescription
  "descriptionHi": string,     // 3-4 sentence polished description in Hindi
  "category": string,          // Primary category (e.g. "Home & Decor", "Textiles", "Kitchenware")
  "craftType": string,         // Specific craft (e.g. "Terracotta Pottery", "Chanderi Weaving", "Dhokra Art")
  "material": string,          // Material (e.g. "Natural Terracotta Clay", "Pure Silk", "Bell Metal Brass")
  "dimensions": string,        // Dimensions / Size if stated or sensible standard estimate
  "careInstructions": string,  // Practical care instructions (e.g. "Wipe gently with dry cloth; avoid abrasive cleaners")
  "tags": string[],            // 5-8 lowercase SEO search tags
  "keywords": string[]         // Same as tags
}`;

class CatalogService {
  /**
   * Generates a smart bilingual catalog listing from voice transcription or manual text.
   */
  async generateSmartCatalog(input: GenerateCatalogInput): Promise<GeneratedCatalogOutput> {
    const sourceText = (input.voiceTranscription || input.manualDescription || '').trim();
    const attributes = input.attributes || {};

    if (!sourceText && !attributes.productName && !attributes.material && !attributes.craftType) {
      throw new HttpError(400, 'Please provide a product description, voice transcript, or craft attributes.');
    }

    const userPayload = JSON.stringify({
      description: sourceText || attributes.description || '',
      attributes,
    });

    try {
      const generated = await llmService.generateJSON<GeneratedCatalogOutput>([
        { role: 'system', content: SMART_CATALOG_PROMPT },
        { role: 'user', content: userPayload },
      ], { temperature: 0.3 });

      const name = generated.name || generated.titleEn || attributes.productName || 'Handcrafted Artisan Product';
      const tags = Array.isArray(generated.tags) ? generated.tags : [];

      return {
        name,
        titleEn: generated.titleEn || name,
        titleHi: generated.titleHi || name,
        aiDescription: generated.aiDescription || generated.descriptionEn || sourceText,
        descriptionEn: generated.descriptionEn || generated.aiDescription || sourceText,
        descriptionHi: generated.descriptionHi || generated.aiDescription || sourceText,
        category: generated.category || attributes.craftType || 'Handicraft',
        craftType: generated.craftType || attributes.craftType || 'Artisan Craft',
        material: generated.material || attributes.material || '',
        dimensions: generated.dimensions || attributes.size || attributes.dimensions || '',
        careInstructions: generated.careInstructions || 'Handle with care. Handcrafted product.',
        tags,
        keywords: generated.keywords || tags,
      };
    } catch (err: any) {
      console.error('[CatalogService] Catalog generation fallback:', err.message);
      const fallbackName = attributes.productName || sourceText.slice(0, 40) || 'Artisan Craft';
      return {
        name: fallbackName,
        titleEn: fallbackName,
        titleHi: fallbackName,
        aiDescription: sourceText || 'Handcrafted authentic artisan product made with traditional techniques.',
        descriptionEn: sourceText || 'Handcrafted authentic artisan product made with traditional techniques.',
        descriptionHi: sourceText || 'पारंपरिक तकनीक से निर्मित प्रामाणिक हस्तशिल्प उत्पाद।',
        category: attributes.craftType || 'Handicraft',
        craftType: attributes.craftType || 'Handicraft',
        material: attributes.material || '',
        dimensions: attributes.size || '',
        careInstructions: 'Clean with a soft dry cloth.',
        tags: ['handicraft', 'handmade', 'artisan', 'indian-craft'],
        keywords: ['handicraft', 'handmade', 'artisan', 'indian-craft'],
      };
    }
  }

  /**
   * Save or update catalog specifications for an existing product in the database.
   */
  async saveProductCatalog(productId: number, data: SaveCatalogInput) {
    const product = await db.orm.public.Product.where({ id: productId }).all().first();
    if (!product) throw new HttpError(404, 'Product not found.');

    const keywords = data.keywords || [];

    // Check if catalogue record already exists
    const existingCatalogue = await db.orm.public.Catalogue.where({ productId }).all().first();

    let catalogueRecord;
    if (existingCatalogue) {
      await db.orm.public.Catalogue.where({ id: existingCatalogue.id }).update({
        titleEn: data.titleEn ?? existingCatalogue.titleEn,
        titleHi: data.titleHi ?? existingCatalogue.titleHi,
        descriptionEn: data.descriptionEn ?? existingCatalogue.descriptionEn,
        descriptionHi: data.descriptionHi ?? existingCatalogue.descriptionHi,
        keywords,
        careInstructions: data.careInstructions ?? existingCatalogue.careInstructions,
      });
      catalogueRecord = await db.orm.public.Catalogue.where({ id: existingCatalogue.id }).all().first();
    } else {
      catalogueRecord = await db.orm.public.Catalogue.create({
        productId,
        titleEn: data.titleEn ?? product.name,
        titleHi: data.titleHi ?? null,
        descriptionEn: data.descriptionEn ?? product.description,
        descriptionHi: data.descriptionHi ?? null,
        keywords,
        careInstructions: data.careInstructions ?? null,
      });
    }

    // Also update product title & description if provided
    await db.orm.public.Product.where({ id: productId }).update({
      name: data.titleEn ?? product.name,
      description: data.descriptionEn ?? product.description,
      material: data.material ?? product.material,
      category: data.category ?? product.category,
    });

    return catalogueRecord;
  }

  /**
   * Fetch saved catalog record for a given product.
   */
  async getProductCatalog(productId: number) {
    const catalogue = await db.orm.public.Catalogue.where({ productId }).all().first();
    if (!catalogue) throw new HttpError(404, 'Catalog record not found for this product.');
    return catalogue;
  }

  /**
   * Generate an artisan's PDF catalog of published products.
   */
  async generateArtisanPdf(artisanId: number): Promise<Buffer> {
    const artisan = await db.orm.public.Artisan
      .where({ id: artisanId })
      .include('user', (u) => u)
      .all()
      .first();
    if (!artisan) throw new HttpError(404, 'Artisan not found.');

    const products = await db.orm.public.Product.where({
      artisanId,
      status: 'published',
    })
      .include('catalogue', (c) => c)
      .include('pricing', (p) => p)
      .include('images', (img) => img)
      .all();

    // Pre-fetch image URLs and convert to base64 data URIs for inline embedding
    const productCards = await Promise.all(
      products.map(async (product: any) => {
        const imgKey = product.images?.[0]?.outputSquareKey;
        let imageHtml = '<div style="width:100%;height:200px;background:#f0f0f0;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999;">No Image</div>';
        if (imgKey) {
          try {
            const url = await r2.getAccessUrl(imgKey, 3600);
            const res = await fetch(url);
            if (res.ok) {
              const buf = Buffer.from(await res.arrayBuffer());
              const b64 = buf.toString('base64');
              const mime = imgKey.endsWith('.png') ? 'image/png' : 'image/jpeg';
              imageHtml = `<img src="data:${mime};base64,${b64}" style="width:100%;height:200px;object-fit:cover;border-radius:8px;" />`;
            }
          } catch { /* fall through to placeholder */ }
        }

        const title = product.catalogue?.titleEn || product.name;
        const desc = product.catalogue?.descriptionEn || product.description || '';
        const price = product.pricing?.recommendedPrice ?? product.price;

        return `
          <div class="card">
            ${imageHtml}
            <div class="card-body">
              <h3>${title}</h3>
              <p class="desc">${desc.slice(0, 120)}${desc.length > 120 ? '…' : ''}</p>
              <div class="meta">
                <span class="price">₹${price != null ? Number(price).toLocaleString('en-IN') : '—'}</span>
                <span class="qty">Qty: ${product.quantity}</span>
              </div>
              <div class="tags">
                ${product.material ? `<span class="tag">${product.material}</span>` : ''}
                ${product.category ? `<span class="tag">${product.category}</span>` : ''}
              </div>
            </div>
          </div>`;
      }),
    );

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #222; }
    .header { text-align: center; margin-bottom: 32px; border-bottom: 2px solid #e53935; padding-bottom: 16px; }
    .header h1 { font-size: 26px; color: #e53935; }
    .header .subtitle { font-size: 14px; color: #666; margin-top: 4px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .card { border: 1px solid #ddd; border-radius: 10px; overflow: hidden; break-inside: avoid; }
    .card-body { padding: 12px; }
    .card-body h3 { font-size: 15px; margin-bottom: 4px; }
    .desc { font-size: 12px; color: #555; line-height: 1.4; margin-bottom: 6px; }
    .meta { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 6px; }
    .price { font-weight: 700; color: #e53935; }
    .qty { color: #888; }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; }
    .tag { background: #f5f5f5; border: 1px solid #ddd; border-radius: 4px; padding: 2px 8px; font-size: 11px; }
    .footer { text-align: center; margin-top: 32px; font-size: 11px; color: #999; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${artisan.storeName || artisan.user?.name || 'Artisan'}</h1>
    <div class="subtitle">${artisan.craftType ?? ''} · ${artisan.district ?? ''}, ${artisan.state ?? ''} · ShilpSetu Catalog</div>
  </div>
  <div class="grid">
    ${productCards.join('\n')}
  </div>
  <div class="footer">
    Generated by ShilpSetu · ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}
  </div>
</body>
</html>`;

    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html);
      const pdfBuffer = await page.pdf({
        format: 'A4',
        printBackground: true,
        margin: { top: '0', bottom: '0', left: '0', right: '0' },
      });
      return Buffer.from(pdfBuffer);
    } finally {
      await browser.close();
    }
  }
}

export const catalogService = new CatalogService();
