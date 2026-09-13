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
    weight?: string;
    region?: string;
    colors?: string[];
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
  weight: string;
  primaryColors: string[];
  originRegion: string;
  heritageStory: string;
  heritageStoryHi: string;
  craftProcess: string;
  craftProcessHi: string;
  highlights: string[];
  usageAndStyling: string;
  careInstructions: string;
  careInstructionsHi: string;
  sustainabilityNotes: string;
  estimatedProductionHours: number;
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
  heritageStory?: string;
  craftProcess?: string;
  dimensions?: string;
  weight?: string;
  highlights?: string[];
}

const DETAILED_CATALOG_PROMPT = `You are a premier e-commerce catalog director and cultural historian for the Ministry of Social Justice & Empowerment (MoSJE) and Indian Artisan Handicrafts (ShilpSetu).
You will receive raw artisan product details (voice transcription, manual notes, extracted craft attributes).

TASK:
Write an exceptionally thorough, high-detail, SEO-optimized, bilingual e-commerce catalog entry.
Artisans need rich, commercial-grade listings that showcase their authenticity, traditional heritage, and intricate crafting effort to buyers worldwide.

RULES:
1. Authenticity: Honor authentic Indian craft traditions (e.g. Madhubani, Terracotta Pottery, Chanderi/Banarasi Weaving, Dhokra Bell Metal, Blue Pottery, Bidriware, Wood Inlay, Jute/Bamboo Weave).
2. Deep Details:
   - Title in professional English & authentic Hindi.
   - Comprehensive descriptions (engaging commercial e-commerce copy).
   - Heritage Story: History, cultural background, regional significance in English and Hindi.
   - Craft Process: Step-by-step handmade technique in English and Hindi.
   - Specifications: Dimensions, estimated weight, primary color palette, origin region/state, estimated production hours.
   - 4-6 Bullet Highlights emphasizing handmade quality, durability, and artistry.
   - Usage & Styling advice (how to use in home decor, dining, gifting, or festive celebrations).
   - Care & Maintenance instructions in English and Hindi.
   - Sustainability credentials (natural materials, eco-friendly, plastic-free, fair trade).
   - 6-8 search tags and keywords in lowercase.

Return ONLY valid JSON matching this exact structure with no markdown fences:
{
  "name": string,
  "titleEn": string,
  "titleHi": string,
  "aiDescription": string,
  "descriptionEn": string,
  "descriptionHi": string,
  "category": string,
  "craftType": string,
  "material": string,
  "dimensions": string,
  "weight": string,
  "primaryColors": string[],
  "originRegion": string,
  "heritageStory": string,
  "heritageStoryHi": string,
  "craftProcess": string,
  "craftProcessHi": string,
  "highlights": string[],
  "usageAndStyling": string,
  "careInstructions": string,
  "careInstructionsHi": string,
  "sustainabilityNotes": string,
  "estimatedProductionHours": number,
  "tags": string[],
  "keywords": string[]
}`;

class CatalogService {
  /**
   * Generates a deep, rich, bilingual catalog listing using Gemini API.
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
      console.log('[CatalogService] Calling Gemini API for detailed catalog generation...');
      const generated = await llmService.generateJSON<GeneratedCatalogOutput>(
        [
          { role: 'system', content: DETAILED_CATALOG_PROMPT },
          { role: 'user', content: userPayload },
        ],
        { temperature: 0.3 }
      );

      const name = generated.name || generated.titleEn || attributes.productName || 'Handcrafted Artisan Product';
      const tags = Array.isArray(generated.tags) ? generated.tags : ['handicraft', 'handmade', 'artisan', 'indian-craft'];

      return {
        name,
        titleEn: generated.titleEn || name,
        titleHi: generated.titleHi || name,
        aiDescription: generated.aiDescription || generated.descriptionEn || sourceText,
        descriptionEn: generated.descriptionEn || generated.aiDescription || sourceText,
        descriptionHi: generated.descriptionHi || generated.aiDescription || sourceText,
        category: generated.category || attributes.craftType || 'Home & Living',
        craftType: generated.craftType || attributes.craftType || 'Traditional Artisan Craft',
        material: generated.material || attributes.material || 'Natural Handcrafted Material',
        dimensions: generated.dimensions || attributes.size || attributes.dimensions || 'Standard Artisan Dimensions',
        weight: generated.weight || attributes.weight || 'Approx. 500g – 1.2kg',
        primaryColors: Array.isArray(generated.primaryColors) && generated.primaryColors.length
          ? generated.primaryColors
          : ['Natural Earthen', 'Terracotta'],
        originRegion: generated.originRegion || attributes.region || 'India',
        heritageStory: generated.heritageStory || 'This artisanal piece carries forward centuries-old cultural traditions of Indian craftsmanship, passed down across generations of skilled master artisans.',
        heritageStoryHi: generated.heritageStoryHi || 'यह कलात्मक उत्पाद भारतीय शिल्पकला की सदियों पुरानी सांस्कृतिक विरासत और पीढ़ियों से चली आ रही पारंपरिक कारीगरी का उत्कृष्ट प्रतीक है।',
        craftProcess: generated.craftProcess || 'Hand-shaped and sculpted using traditional manual techniques, followed by careful sun-curing and hand finishing with natural pigments.',
        craftProcessHi: generated.craftProcessHi || 'प्राकृतिक सामग्रियों का उपयोग करके हाथ से गढ़ा गया, जिसके बाद प्राकृतिक रंगों और पारंपरिक तकनीकों से सजाया गया है।',
        highlights: Array.isArray(generated.highlights) && generated.highlights.length
          ? generated.highlights
          : [
              '100% handcrafted by certified rural artisans',
              'Eco-friendly, plastic-free natural materials',
              'Unique authentic handmade texture and finish',
              'Fair-trade guaranteed directly supporting artisan families',
            ],
        usageAndStyling: generated.usageAndStyling || 'Ideal as an aesthetic interior accent, tabletop centerpiece, traditional gift, or festive decorative display.',
        careInstructions: generated.careInstructions || 'Wipe gently with a soft dry cloth. Keep away from harsh abrasive cleaners and excess moisture.',
        careInstructionsHi: generated.careInstructionsHi || 'मुलायम सूखे कपड़े से धीरे से पोंछें। कठोर रसायनों और अधिक नमी से दूर रखें।',
        sustainabilityNotes: generated.sustainabilityNotes || 'Zero plastic, 100% biodegradable and sustainably sourced materials.',
        estimatedProductionHours: Number(generated.estimatedProductionHours) || 8,
        tags,
        keywords: generated.keywords || tags,
      };
    } catch (err: any) {
      console.error('[CatalogService] Gemini catalog generation fallback:', err.message);
      const fallbackName = attributes.productName || sourceText.slice(0, 45) || 'Handcrafted Artisan Product';
      return {
        name: fallbackName,
        titleEn: fallbackName,
        titleHi: fallbackName,
        aiDescription: sourceText || 'Handcrafted authentic artisan product made with traditional Indian techniques.',
        descriptionEn: sourceText || 'Handcrafted authentic artisan product made with traditional Indian techniques.',
        descriptionHi: 'पारंपरिक भारतीय तकनीकों से निर्मित प्रामाणिक हस्तशिल्प उत्पाद।',
        category: attributes.craftType || 'Home & Decor',
        craftType: attributes.craftType || 'Artisan Craft',
        material: attributes.material || 'Natural Artisan Material',
        dimensions: attributes.size || 'Standard Size',
        weight: '500g approx.',
        primaryColors: ['Natural Clay', 'Earth Brown'],
        originRegion: attributes.region || 'India',
        heritageStory: 'Rooted in traditional Indian craft communities, honoring indigenous artisan craftsmanship.',
        heritageStoryHi: 'पारंपरिक भारतीय शिल्प समुदायों से जुड़ा, स्वदेशी कारीगरी का सम्मान करता है।',
        craftProcess: 'Handmade using heritage artisan tools and finished by master craftspersons.',
        craftProcessHi: 'पारंपरिक औजारों से हाथ से निर्मित और अनुभवी कारीगरों द्वारा तैयार किया गया।',
        highlights: [
          'Authentic handmade craftsmanship',
          'Sustainably sourced natural materials',
          'Direct fair-trade artisan support',
          'Durable and artistic heritage design',
        ],
        usageAndStyling: 'Ideal for home decor, traditional styling, and meaningful festive gifting.',
        careInstructions: 'Clean with a soft dry cotton cloth. Avoid abrasive detergents.',
        careInstructionsHi: 'नरम सूखे सूती कपड़े से साफ करें। कठोर डिटर्जेंट से बचें।',
        sustainabilityNotes: 'Biodegradable, eco-friendly, plastic-free packaging.',
        estimatedProductionHours: 10,
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
   * Generates a high-definition, printable A4 PDF catalog flyer for a single product.
   */
  async generateProductPdf(productId: number): Promise<Buffer> {
    const product = await db.orm.public.Product.where({ id: productId })
      .include('artisan', (a) => a.include('user', (u) => u))
      .include('catalogue', (c) => c)
      .include('pricing', (p) => p)
      .include('images', (img) => img)
      .all()
      .first();

    if (!product) throw new HttpError(404, 'Product not found.');

    const artisan = product.artisan;
    const catalogue = product.catalogue;
    const pricing = product.pricing;

    // Resolve product image to Base64 data URL
    let imageSrc = '';
    const imgKey = product.images?.[0]?.outputSquareKey || product.images?.[0]?.studioKey || product.images?.[0]?.cleanedKey;
    if (imgKey) {
      try {
        const url = await r2.getAccessUrl(imgKey, 3600);
        const res = await fetch(url);
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          const mime = imgKey.endsWith('.png') ? 'image/png' : 'image/jpeg';
          imageSrc = `data:${mime};base64,${buf.toString('base64')}`;
        }
      } catch (err: any) {
        console.warn('[CatalogService] Failed to load product image for PDF:', err.message);
      }
    }

    const titleEn = catalogue?.titleEn || product.name || 'Handcrafted Artisan Product';
    const titleHi = catalogue?.titleHi || '';
    const descEn = catalogue?.descriptionEn || product.description || '';
    const descHi = catalogue?.descriptionHi || '';
    const price = pricing?.recommendedPrice ?? product.price ?? 0;
    const material = product.material || 'Handmade Natural Material';
    const category = product.category || 'Handicraft';
    const care = catalogue?.careInstructions || 'Handle with care. Wipe gently with a soft dry cloth.';
    const keywords = Array.isArray(catalogue?.keywords) ? catalogue.keywords : ['handmade', 'artisan', 'indian-craft'];

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${titleEn} - ShilpSetu Catalog</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
      background: #FFFFFF;
      color: #2B2420;
      line-height: 1.45;
      padding: 32px 36px;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #C26D43;
      padding-bottom: 14px;
      margin-bottom: 22px;
    }
    .brand-title {
      font-size: 24px;
      font-weight: 800;
      color: #B5502F;
      letter-spacing: -0.5px;
    }
    .brand-subtitle {
      font-size: 11px;
      color: #7D6B63;
      font-weight: 500;
      margin-top: 2px;
    }
    .badge-artisan {
      background: #F6EEDF;
      border: 1px solid #E4D8C3;
      color: #56423C;
      font-size: 11px;
      padding: 4px 10px;
      border-radius: 9999px;
      font-weight: 600;
    }
    .hero {
      display: grid;
      grid-template-columns: 240px 1fr;
      gap: 24px;
      margin-bottom: 22px;
    }
    .img-box {
      width: 240px;
      height: 240px;
      border-radius: 12px;
      overflow: hidden;
      background: #F9F7F4;
      border: 1px solid #E4D8C3;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .img-box img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .hero-details {
      display: flex;
      flex-direction: column;
      justify-content: center;
    }
    .category-tag {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: #B5502F;
      font-weight: 700;
      margin-bottom: 4px;
    }
    .product-title {
      font-size: 22px;
      font-weight: 700;
      color: #2B2420;
      line-height: 1.25;
      margin-bottom: 4px;
    }
    .product-title-hi {
      font-size: 15px;
      color: #7D6B63;
      margin-bottom: 12px;
      font-weight: 500;
    }
    .price-row {
      display: flex;
      align-items: baseline;
      gap: 12px;
      margin-bottom: 14px;
    }
    .price-main {
      font-size: 24px;
      font-weight: 800;
      color: #B5502F;
    }
    .fair-trade-pill {
      background: rgba(91,110,78,0.12);
      border: 1px solid #5B6E4E;
      color: #5B6E4E;
      font-size: 10px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 9999px;
    }
    .description-text {
      font-size: 12px;
      color: #56423C;
      line-height: 1.5;
    }
    .section-title {
      font-size: 13px;
      font-weight: 700;
      color: #2B2420;
      border-left: 3px solid #B5502F;
      padding-left: 8px;
      margin-bottom: 8px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .spec-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      background: #FFFDF8;
      border: 1px solid #E4D8C3;
      border-radius: 10px;
      padding: 12px 16px;
      margin-bottom: 18px;
    }
    .spec-item {
      display: flex;
      justify-content: space-between;
      font-size: 11px;
      padding: 3px 0;
      border-bottom: 1px dashed #EDE5D8;
    }
    .spec-item:last-child, .spec-item:nth-last-child(2) {
      border-bottom: none;
    }
    .spec-label {
      color: #8A726B;
      font-weight: 500;
    }
    .spec-val {
      color: #2B2420;
      font-weight: 600;
    }
    .two-col {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 18px;
    }
    .card-box {
      background: #FFFDF8;
      border: 1px solid #E4D8C3;
      border-radius: 10px;
      padding: 12px;
      font-size: 11px;
      color: #56423C;
      line-height: 1.45;
    }
    .tag-container {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }
    .tag-pill {
      background: #F6EEDF;
      border: 1px solid #E4D8C3;
      border-radius: 4px;
      padding: 2px 7px;
      font-size: 10px;
      color: #56423C;
    }
    .footer {
      margin-top: 22px;
      border-top: 1px solid #E4D8C3;
      padding-top: 12px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 10px;
      color: #8A726B;
    }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand-title">ShilpSetu · शिल्पसेतु</div>
      <div class="brand-subtitle">Empowering Traditional Indian Artisans · MoSJE Certified Catalog</div>
    </div>
    <div style="text-align: right;">
      <span class="badge-artisan">${artisan?.storeName || artisan?.user?.name || 'Verified Master Artisan'}</span>
      <div style="font-size: 10px; color: #8A726B; margin-top: 4px;">${artisan?.district ? `${artisan.district}, ` : ''}${artisan?.state || 'India'}</div>
    </div>
  </div>

  <div class="hero">
    <div class="img-box">
      ${imageSrc ? `<img src="${imageSrc}" alt="${titleEn}"/>` : '<div style="color: #999; font-size: 12px;">Product Image</div>'}
    </div>
    <div class="hero-details">
      <div class="category-tag">${category} · ${material}</div>
      <h1 class="product-title">${titleEn}</h1>
      ${titleHi ? `<div class="product-title-hi">${titleHi}</div>` : ''}
      <div class="price-row">
        <span class="price-main">₹${Number(price).toLocaleString('en-IN')}</span>
        <span class="fair-trade-pill">✓ 100% Direct Artisan Fair Trade</span>
      </div>
      <div class="description-text">${descEn}</div>
      ${descHi ? `<div class="description-text" style="margin-top: 6px; color: #7D6B63;">${descHi}</div>` : ''}
    </div>
  </div>

  <div class="section-title">Technical Specifications & Craft Metrics</div>
  <div class="spec-grid">
    <div class="spec-item"><span class="spec-label">Category</span><span class="spec-val">${category}</span></div>
    <div class="spec-item"><span class="spec-label">Craft Form</span><span class="spec-val">${artisan?.craftType || 'Traditional Artisan Craft'}</span></div>
    <div class="spec-item"><span class="spec-label">Primary Material</span><span class="spec-val">${material}</span></div>
    <div class="spec-item"><span class="spec-label">Origin Cluster</span><span class="spec-val">${artisan?.district || 'Traditional Cluster'}, ${artisan?.state || 'India'}</span></div>
    <div class="spec-item"><span class="spec-label">Stock Quantity</span><span class="spec-val">${product.quantity || 1} available</span></div>
    <div class="spec-item"><span class="spec-label">Handmade Guarantee</span><span class="spec-val">100% Authentic Handcraft</span></div>
  </div>

  <div class="two-col">
    <div class="card-box">
      <div class="section-title" style="margin-bottom: 6px;">Care & Preservation Guide</div>
      <p>${care}</p>
      <div class="tag-container">
        ${keywords.map((k: string) => `<span class="tag-pill">#${k}</span>`).join('')}
      </div>
    </div>
    <div class="card-box">
      <div class="section-title" style="margin-bottom: 6px;">Artisan & Sustainability Commitment</div>
      <p>By purchasing this piece, you directly empower rural artisan families, preserve traditional Indian craft heritage, and support zero-plastic, eco-friendly manufacturing.</p>
      <p style="margin-top: 6px; font-weight: 600; color: #5B6E4E;">Certified by ShilpSetu & Ministry of Social Justice and Empowerment.</p>
    </div>
  </div>

  <div class="footer">
    <div>Direct Artisan Listing · Verified on ShilpSetu Digital Hub</div>
    <div>Generated: ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
  </div>
</body>
</html>`;

    return await this.renderHtmlToPdf(html);
  }

  /**
   * Generates a printable single-product PDF catalog flyer directly from live draft data (e.g. from review screen).
   */
  async generateDraftPdf(draft: any): Promise<Buffer> {
    const titleEn = draft.name || draft.titleEn || 'Handcrafted Artisan Product';
    const titleHi = draft.titleHi || '';
    const descEn = draft.description || draft.descriptionEn || draft.aiDescription || 'Authentic traditional handmade product.';
    const descHi = draft.descriptionHi || '';
    const material = draft.material || 'Natural Handcrafted Material';
    const craftType = draft.craftType || 'Traditional Craft';
    const category = draft.category || 'Handicraft';
    const dimensions = draft.dimensions || 'Standard Dimensions';
    const weight = draft.weight || '500g approx.';
    const originRegion = draft.originRegion || 'India';
    const careInstructions = draft.careInstructions || 'Wipe gently with a soft dry cloth. Avoid harsh chemicals.';
    const highlights = Array.isArray(draft.highlights) && draft.highlights.length
      ? draft.highlights
      : ['100% Handcrafted by master artisans', 'Eco-friendly natural materials', 'Fair-trade direct compensation'];
    const price = draft.price || draft.suggestedPrice || 899;

    let imageSrc = '';
    const firstImg = Array.isArray(draft.images) && draft.images[0];
    if (typeof firstImg === 'string' && (firstImg.startsWith('http') || firstImg.startsWith('data:image'))) {
      imageSrc = firstImg;
    }

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${titleEn} - ShilpSetu Flyer</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
      background: #FFFFFF;
      color: #2B2420;
      padding: 32px 36px;
      line-height: 1.45;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #C26D43;
      padding-bottom: 12px;
      margin-bottom: 20px;
    }
    .brand-title { font-size: 24px; font-weight: 800; color: #B5502F; }
    .brand-sub { font-size: 11px; color: #7D6B63; }
    .hero {
      display: grid;
      grid-template-columns: 240px 1fr;
      gap: 20px;
      margin-bottom: 20px;
    }
    .img-box {
      width: 240px;
      height: 240px;
      border-radius: 12px;
      border: 1px solid #E4D8C3;
      background: #F9F7F4;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .img-box img { width: 100%; height: 100%; object-fit: cover; }
    .title { font-size: 20px; font-weight: 700; color: #2B2420; }
    .title-hi { font-size: 14px; color: #7D6B63; margin-bottom: 8px; }
    .price { font-size: 22px; font-weight: 800; color: #B5502F; margin-bottom: 8px; }
    .desc { font-size: 11.5px; color: #56423C; line-height: 1.5; }
    .spec-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px;
      background: #FFFDF8;
      border: 1px solid #E4D8C3;
      border-radius: 8px;
      padding: 10px 14px;
      font-size: 11px;
      margin-bottom: 16px;
    }
    .spec-row { display: flex; justify-content: space-between; padding: 2px 0; border-bottom: 1px dashed #EDE5D8; }
    .spec-row:last-child, .spec-row:nth-last-child(2) { border-bottom: none; }
    .section-title { font-size: 12px; font-weight: 700; color: #B5502F; text-transform: uppercase; margin-bottom: 6px; }
    .box { background: #FFFDF8; border: 1px solid #E4D8C3; border-radius: 8px; padding: 10px; font-size: 11px; line-height: 1.45; }
    .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; margin-bottom: 16px; }
    .highlights li { margin-left: 16px; margin-bottom: 3px; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <div class="brand-title">ShilpSetu · शिल्पसेतु</div>
      <div class="brand-sub">Artisan Product Catalog · MoSJE Certified</div>
    </div>
    <div style="text-align: right; font-size: 11px; color: #56423C; font-weight: 600;">
      Official E-Commerce Catalog
    </div>
  </div>

  <div class="hero">
    <div class="img-box">
      ${imageSrc ? `<img src="${imageSrc}" alt="${titleEn}"/>` : '<div style="color: #999; font-size: 12px;">Craft Photo</div>'}
    </div>
    <div>
      <div style="font-size: 10px; font-weight: 700; color: #B5502F; text-transform: uppercase; margin-bottom: 4px;">${category} · ${craftType}</div>
      <div class="title">${titleEn}</div>
      ${titleHi ? `<div class="title-hi">${titleHi}</div>` : ''}
      <div class="price">₹${Number(price).toLocaleString('en-IN')}</div>
      <div class="desc">${descEn}</div>
      ${descHi ? `<div class="desc" style="margin-top: 4px; color: #7D6B63;">${descHi}</div>` : ''}
    </div>
  </div>

  <div class="section-title">Specifications & Dimensions</div>
  <div class="spec-grid">
    <div class="spec-row"><span style="color: #8A726B;">Material</span><span style="font-weight: 600;">${material}</span></div>
    <div class="spec-row"><span style="color: #8A726B;">Dimensions</span><span style="font-weight: 600;">${dimensions}</span></div>
    <div class="spec-row"><span style="color: #8A726B;">Weight</span><span style="font-weight: 600;">${weight}</span></div>
    <div class="spec-row"><span style="color: #8A726B;">Origin Region</span><span style="font-weight: 600;">${originRegion}</span></div>
  </div>

  <div class="two-col">
    <div class="box">
      <div class="section-title">Key Highlights</div>
      <ul class="highlights">
        ${highlights.map((h: string) => `<li>${h}</li>`).join('')}
      </ul>
    </div>
    <div class="box">
      <div class="section-title">Care & Preservation</div>
      <p>${careInstructions}</p>
      <p style="margin-top: 6px; color: #5B6E4E; font-weight: 600;">100% Eco-Friendly & Fair Trade Certified</p>
    </div>
  </div>

  <div style="border-top: 1px solid #E4D8C3; padding-top: 10px; display: flex; justify-content: space-between; font-size: 10px; color: #8A726B;">
    <div>Generated by ShilpSetu Digital Platform for Artisans</div>
    <div>${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
  </div>
</body>
</html>`;

    return await this.renderHtmlToPdf(html);
  }

  /**
   * Generate an artisan's comprehensive PDF catalog of published products.
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

    // Pre-fetch image URLs and convert to base64 data URIs
    const productCards = await Promise.all(
      products.map(async (product: any) => {
        const imgKey = product.images?.[0]?.outputSquareKey || product.images?.[0]?.studioKey || product.images?.[0]?.cleanedKey;
        let imageHtml = '<div style="width:100%;height:180px;background:#F9F7F4;border-bottom:1px solid #E4D8C3;display:flex;align-items:center;justify-content:center;color:#999;font-size:12px;">Craft Photo</div>';
        if (imgKey) {
          try {
            const url = await r2.getAccessUrl(imgKey, 3600);
            const res = await fetch(url);
            if (res.ok) {
              const buf = Buffer.from(await res.arrayBuffer());
              const b64 = buf.toString('base64');
              const mime = imgKey.endsWith('.png') ? 'image/png' : 'image/jpeg';
              imageHtml = `<img src="data:${mime};base64,${b64}" style="width:100%;height:180px;object-fit:cover;border-bottom:1px solid #E4D8C3;" />`;
            }
          } catch { /* fall through to placeholder */ }
        }

        const title = product.catalogue?.titleEn || product.name;
        const titleHi = product.catalogue?.titleHi ? `<div style="font-size: 11px; color: #7D6B63; margin-bottom: 4px;">${product.catalogue.titleHi}</div>` : '';
        const desc = product.catalogue?.descriptionEn || product.description || '';
        const price = product.pricing?.recommendedPrice ?? product.price;

        return `
          <div class="card">
            ${imageHtml}
            <div class="card-body">
              <div style="font-size: 10px; text-transform: uppercase; color: #B5502F; font-weight: 700;">${product.category || 'Handicraft'}</div>
              <h3>${title}</h3>
              ${titleHi}
              <p class="desc">${desc.slice(0, 110)}${desc.length > 110 ? '…' : ''}</p>
              <div class="meta">
                <span class="price">₹${price != null ? Number(price).toLocaleString('en-IN') : '—'}</span>
                <span class="qty">In Stock: ${product.quantity}</span>
              </div>
              <div class="tags">
                ${product.material ? `<span class="tag">${product.material}</span>` : ''}
                <span class="tag" style="background: rgba(91,110,78,0.1); color: #5B6E4E; border-color: #5B6E4E;">Fair Trade</span>
              </div>
            </div>
          </div>`;
      })
    );

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>${artisan.storeName || artisan.user?.name} - Catalog</title>
  <style>
    @page { size: A4 portrait; margin: 0; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Helvetica, Arial, sans-serif;
      padding: 32px 36px;
      color: #2B2420;
      background: #FFFFFF;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .header {
      text-align: center;
      margin-bottom: 24px;
      border-bottom: 2px solid #C26D43;
      padding-bottom: 16px;
    }
    .header h1 { font-size: 26px; color: #B5502F; font-weight: 800; }
    .header .subtitle { font-size: 12px; color: #7D6B63; margin-top: 4px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .card {
      border: 1px solid #E4D8C3;
      border-radius: 10px;
      overflow: hidden;
      break-inside: avoid;
      background: #FFFDF8;
    }
    .card-body { padding: 12px; }
    .card-body h3 { font-size: 14px; margin: 2px 0 4px 0; color: #2B2420; font-weight: 700; }
    .desc { font-size: 11px; color: #56423C; line-height: 1.4; margin-bottom: 8px; }
    .meta { display: flex; justify-content: space-between; align-items: baseline; font-size: 12px; margin-bottom: 6px; }
    .price { font-weight: 800; font-size: 16px; color: #B5502F; }
    .qty { color: #8A726B; font-size: 10px; }
    .tags { display: flex; gap: 6px; flex-wrap: wrap; }
    .tag { background: #F6EEDF; border: 1px solid #E4D8C3; border-radius: 4px; padding: 2px 6px; font-size: 10px; color: #56423C; }
    .footer { text-align: center; margin-top: 24px; font-size: 10px; color: #8A726B; border-top: 1px solid #E4D8C3; padding-top: 10px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>${artisan.storeName || artisan.user?.name || 'Artisan Craft Catalog'}</h1>
    <div class="subtitle">${artisan.craftType ?? 'Handicrafts'} · ${artisan.district ? `${artisan.district}, ` : ''}${artisan.state ?? 'India'} · ShilpSetu Certified</div>
  </div>
  <div class="grid">
    ${productCards.join('\n')}
  </div>
  <div class="footer">
    ShilpSetu Artisan Network · Ministry of Social Justice & Empowerment · ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}
  </div>
</body>
</html>`;

    return await this.renderHtmlToPdf(html);
  }

  /**
   * Internal helper to render HTML strings to PDF buffer via Puppeteer.
   */
  private async renderHtmlToPdf(html: string): Promise<Buffer> {
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    });
    try {
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'load', timeout: 30000 });
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
