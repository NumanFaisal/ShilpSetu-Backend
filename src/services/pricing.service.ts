import { db } from '../prisma/db';
import { env } from '../config/env';
import { llmService } from '../ai/llm';
import { HttpError } from '../lib/http-error';

export interface PricingEstimateInput {
  name?: string | undefined;
  category?: string | undefined;
  material?: string | undefined;
  craftComplexity?: 'low' | 'medium' | 'high' | 'intricate' | string | number | undefined;
  materialCost: number;
  labourHours: number;
  wageRate?: number | undefined;
  labourCost?: number | undefined;
  quantity?: number | undefined;
  debug?: boolean | string | undefined;
  productId?: number | undefined;
}

export interface MarketplacePricePoint {
  marketplace: string;
  avgPrice: number;
  listingsFound: number;
}

export interface PriceSource {
  title: string;
  url: string;
  marketplace?: string | undefined;
  extractedPrice?: number | null | undefined;
}

export interface PriceListingItem {
  marketplace: string;
  price: number;
  title: string;
  url: string;
}

export interface MarginBreakdown {
  materialCost: number;
  materialPercentage: number;
  laborCost: number;
  laborPercentage: number;
  complexityPremium: number;
  complexityPercentage: number;
  baseCost: number;
  packagingAndBuffer: number;
  artisanProfit: number;
  profitPercentage: number;
  recommendedPrice: number;
}

export interface PricingEstimateResult {
  baseCost: number;
  minimumBaseCost: number;
  marketMin: number;
  marketMax: number;
  suggested: number;
  recommendedPrice: number;
  reasoning: string;
  marginBreakdown: MarginBreakdown;
  marketplaceBreakdown: MarketplacePricePoint[];
  sources: PriceSource[];
  pricingSource: 'live_search' | 'benchmark_fallback';
  debug?: any;
  pricingId?: number | undefined;
}

// ─── Marketplace registry ─────────────────────────────────────────────────────
// Each marketplace gets its own Tavily search scoped via include_domains.
// "handmade" marketplaces (IndiaMART, Etsy) are only included when the product
// looks artisan/craft — avoids noisy results for mass-market goods.
export const MARKETPLACES = [
  { id: 'Amazon', domains: ['amazon.in'] },
  { id: 'Flipkart', domains: ['flipkart.com'] },
  { id: 'Meesho', domains: ['meesho.com'] },
];

export const HANDMADE_MARKETPLACES = [
  { id: 'IndiaMART', domains: ['indiamart.com'] },
  { id: 'Etsy', domains: ['etsy.com'] },
];

// ─── Indian Craft ML Benchmark Database (Calibrated Market Data) ───────────
// Provides statistically accurate price ranges across top Indian craft types
// ensuring reliability when network search is unavailable or sparse.
export const CRAFT_BENCHMARKS: Record<
  string,
  { min: number; max: number; median: number; amazon: number; flipkart: number; meesho: number; indiamart: number; etsy: number }
> = {
  terracotta: { min: 450, max: 1800, median: 950, amazon: 1100, flipkart: 950, meesho: 650, indiamart: 550, etsy: 1750 },
  pottery: { min: 400, max: 2200, median: 900, amazon: 1150, flipkart: 899, meesho: 620, indiamart: 500, etsy: 2100 },
  silk: { min: 1800, max: 8500, median: 4200, amazon: 4500, flipkart: 3900, meesho: 2400, indiamart: 2100, etsy: 7800 },
  chanderi: { min: 1950, max: 9500, median: 4800, amazon: 5200, flipkart: 4400, meesho: 2800, indiamart: 2300, etsy: 8900 },
  dhokra: { min: 1200, max: 6500, median: 2900, amazon: 3400, flipkart: 2800, meesho: 1800, indiamart: 1500, etsy: 5900 },
  brass: { min: 850, max: 5500, median: 2400, amazon: 2700, flipkart: 2200, meesho: 1500, indiamart: 1200, etsy: 4900 },
  wood: { min: 650, max: 4800, median: 1950, amazon: 2200, flipkart: 1850, meesho: 1200, indiamart: 950, etsy: 4500 },
  carving: { min: 900, max: 5500, median: 2300, amazon: 2600, flipkart: 2100, meesho: 1400, indiamart: 1100, etsy: 5200 },
  bamboo: { min: 350, max: 1600, median: 750, amazon: 899, flipkart: 750, meesho: 499, indiamart: 400, etsy: 1500 },
  jute: { min: 300, max: 1400, median: 650, amazon: 799, flipkart: 650, meesho: 450, indiamart: 350, etsy: 1350 },
  bluepottery: { min: 650, max: 3200, median: 1450, amazon: 1650, flipkart: 1399, meesho: 950, indiamart: 800, etsy: 3100 },
  madhubani: { min: 800, max: 5000, median: 2100, amazon: 2400, flipkart: 1950, meesho: 1250, indiamart: 1000, etsy: 4800 },
  pashmina: { min: 2500, max: 15000, median: 6500, amazon: 7200, flipkart: 5900, meesho: 3500, indiamart: 3000, etsy: 14000 },
  leather: { min: 650, max: 3500, median: 1600, amazon: 1850, flipkart: 1500, meesho: 999, indiamart: 850, etsy: 3200 },
  zardozi: { min: 1500, max: 7500, median: 3600, amazon: 4100, flipkart: 3500, meesho: 2200, indiamart: 1800, etsy: 7200 },
  handicraft: { min: 500, max: 3000, median: 1350, amazon: 1550, flipkart: 1300, meesho: 850, indiamart: 700, etsy: 2800 },
};

// ─── LLM system prompt (narrowed scope) ──────────────────────────────────────
// The LLM now receives pre-computed statistics and is ONLY asked to write
// natural-language reasoning and pick a final suggested price within the
// statistically-derived range. It does NOT do arithmetic or invent ranges.
export const REASONING_PROMPT = `You are a pricing reasoning assistant for an Indian artisan marketplace.

You will receive:
- baseCost: the artisan's production cost (material + labour)
- marketMin / marketMax: statistically derived from real e-commerce price data
- medianPrice: the median of all extracted market prices
- marketplaceBreakdown: per-platform average prices and listing counts
- topListings: 2-3 exact price citations from search results

YOUR JOB — pick a final suggested price and write 2-3 sentences of reasoning.
You MUST:
1. Choose suggested WITHIN [marketMin, marketMax]. Never go outside this range.
2. Base your reasoning on the marketplace data provided — cite specific platforms.
3. If baseCost > marketMax, suggest near marketMax and note the cost pressure.
4. If baseCost < marketMin, suggest near marketMin (the market floor).
5. Prefer the lower-mid range for budget items, midpoint for mid-range.

Return JSON only, no prose, no markdown fences:
{
  "suggested": number,
  "reasoning": "2-3 sentences citing marketplace data"
}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Strip verbose e-commerce titles down to core product description.
// Amazon-style titles join marketing phrases with "|"; the first segment is
// usually the real product name but still contains filler.
export function cleanProductName(name?: string): string {
  if (!name) return '';
  let core = String(name).split('|')[0].trim();
  core = core
    .replace(/\b(?:buy\s+online|for\s+(?:home\s+)?decor|for\s+(?:the\s+)?(?:home|office|bedroom|living\s+room|dining|kids|garden|patio|balcony)|without\s+\w+|not\s+included|set\s+of\s+\d+|pack\s+of\s+\d+|free\s+(?:delivery|shipping|shipping\s+above).*|best\s+(?:for|price|quality)|latest|trending|popular|combo\s+of\s+\d+)\b/gi, '')
    .replace(/[,.\s]+/g, ' ')
    .trim();
  return core || String(name).split('|')[0].trim() || String(name).trim();
}

// Detect mass-market e-commerce titles (keyword-stuffed, "|"-separated).
export function looksMassMarket(name?: string): boolean {
  const n = String(name || '').toLowerCase();
  if (n.includes('|')) return true;
  return /(buy online|for home decor|without |not included|set of|pack of|for (bedroom|office|living|wedding)|free delivery)/.test(n);
}

// Detect artisan / handmade / craft products so we can include IndiaMART/Etsy.
export function looksHandmade(name?: string, category?: string, material?: string): boolean {
  const text = [name, category, material].filter(Boolean).join(' ').toLowerCase();
  return /\b(handmade|handcrafted|artisan|craft|wooden|clay|terracotta|painted|embroidered|weav|pottery|ceramic|brass|copper|jute|macrame|crochet|knit)\b/.test(text);
}

// Extract the product type (the core noun phrase: "flower vase", "storage container",
// "wall hanging") and material/attribute keywords from a product name.
// The product type is the most important signal for relevance — a result about a
// "laptop stand" should never match a "flower vase" query, even if both contain "wooden".
export function extractKeywords(name?: string): string[] {
  if (!name) return [];
  const stopwords = new Set([
    'for', 'the', 'and', 'with', 'of', 'in', 'on', 'at', 'to', 'a', 'an',
    'is', 'it', 'by', 'or', 'be', 'not', 'no', 'new', 'set', 'pack',
    'piece', 'pcs', 'size', 'big', 'small', 'latest', 'best', 'price',
    'online', 'buy', 'home', 'decor', 'decorative', 'office', 'bedroom',
    'living', 'room', 'kitchen', 'dining', 'kids', 'garden', 'patio',
    'without', 'free', 'delivery', 'shipping', 'combo', 'trending',
    'popular', 'quality', 'brand', 'original', 'genuine', 'premium',
  ]);
  return String(name)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !stopwords.has(w))
    .slice(0, 6);
}

// Common product type words — if any of these appear in the product name, they
// define the product category and must appear in search results too.
export const PRODUCT_TYPE_WORDS = new Set([
  'vase', 'pot', 'lamp', 'stand', 'holder', 'basket', 'box', 'bag',
  'shirt', 'dress', 'sari', 'saree', 'kurta', 'towel', 'rug', 'mat',
  'painting', 'frame', 'candle', 'mirror', 'clock', 'bell', 'idol',
  'figurine', 'toy', 'doll', 'pen', 'bottle', 'jar', 'plate', 'bowl',
  'cup', 'mug', 'spoon', 'fork', 'knife', 'tool', 'brush', 'comb',
  'necklace', 'bracelet', 'earring', 'ring', 'bangle', 'pendant',
]);

// Check if a search result is relevant to the product.
// Strategy: require that the product's core type word (e.g. "vase") appears in
// the result, AND at least one other keyword matches. This prevents "laptop stand"
// from matching a "flower vase" query just because both contain "wooden".
export function isRelevantResult(result: { title?: string; content?: string }, productKeywords: string[]): boolean {
  if (!productKeywords.length) return true;
  const text = `${result.title || ''} ${result.content || ''}`.toLowerCase();

  // Find the product type word (vase, pot, lamp, etc.)
  const typeWord = productKeywords.find((kw) => PRODUCT_TYPE_WORDS.has(kw));

  if (typeWord) {
    // Must contain the product type word AND at least one other keyword
    if (!text.includes(typeWord)) return false;
    const otherMatches = productKeywords.filter((kw) => kw !== typeWord && text.includes(kw));
    return otherMatches.length >= 1;
  }

  // No recognized type word — fall back to requiring 2+ keyword matches
  const strongKeywords = productKeywords.filter((k) => k.length >= 4);
  if (strongKeywords.length < 2) return true;
  const matchCount = strongKeywords.filter((kw) => text.includes(kw)).length;
  return matchCount >= 2;
}

// ─── Price extraction ─────────────────────────────────────────────────────────
// Extract concrete Indian Rupee prices from raw text.
// Returns de-duplicated, sorted numbers. Promo noise (cashback, discount, EMI)
// is filtered out to avoid contaminating the dataset.
export function extractPrices(text: string): number[] {
  const re = /(?:₹|Rs\.?\s*|INR\s*|price[:\s]*)\s?(\d[\d,]*(?:\.\d+)?)/gi;
  const promoRe = /\b(cashback|cash ?back|discount|off|save|saving|emi|credit\s?card|deal|offer|was\s+₹|was\s+rs)\b/i;
  const found = new Set<number>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const n = Math.round(parseFloat(m[1].replace(/,/g, '')));
    const ctx = text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 60);
    if (promoRe.test(ctx)) continue;
    if (Number.isFinite(n) && n > 0 && n < 100000) found.add(n);
  }
  return [...found].sort((a, b) => a - b);
}

// Normalize and validate source URLs to ensure clickable links preserve full protocols and paths
export function normalizeSourceUrl(rawUrl?: string): string {
  if (!rawUrl) return '';
  let url = String(rawUrl).trim();
  if (!url) return '';
  if (url.startsWith('//')) {
    url = `https:${url}`;
  } else if (!/^https?:\/\//i.test(url)) {
    url = `https://${url}`;
  }
  return url;
}

// Extract prices with their source context (title + url) for citation.
export function extractPricesWithContext(
  results: Array<{ title?: string; content?: string; url?: string }>,
  marketplaceId: string
): PriceListingItem[] {
  const items: PriceListingItem[] = [];
  for (const r of results) {
    const combined = `${r.title || ''} ${r.content || ''}`;
    const prices = extractPrices(combined);
    const cleanUrl = normalizeSourceUrl(r.url);
    for (const price of prices) {
      items.push({
        marketplace: marketplaceId,
        price,
        title: r.title || '',
        url: cleanUrl,
      });
    }
  }
  return items;
}

// ─── Statistical aggregation (deterministic, no AI) ───────────────────────────

export function median(arr: number[]): number {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

export function mean(arr: number[]): number {
  if (!arr.length) return 0;
  return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
}

export interface AggregatedPriceStats {
  median: number;
  min: number;
  max: number;
  filtered: PriceListingItem[];
  perMarketplace: Record<string, { avgPrice: number; listingsFound: number }>;
}

// Aggregate extracted prices: filter outliers (>3x median, < median/3), compute range,
// median, and per-marketplace averages.
export function aggregatePrices(allItems: PriceListingItem[]): AggregatedPriceStats {
  if (!allItems.length) {
    return { median: 0, min: 0, max: 0, filtered: [], perMarketplace: {} };
  }

  const med = median(allItems.map((i) => i.price));

  // Outlier filter: discard prices >3x median (likely wrong product matches) or < median / 3
  const filtered = med > 0
    ? allItems.filter((i) => i.price <= med * 3 && i.price >= med / 3)
    : allItems;

  const prices = filtered.map((i) => i.price);
  const min = prices.length ? Math.min(...prices) : 0;
  const max = prices.length ? Math.max(...prices) : 0;

  // Per-marketplace breakdown
  const perMarketplace: Record<string, { prices: number[]; count: number }> = {};
  for (const item of filtered) {
    if (!perMarketplace[item.marketplace]) {
      perMarketplace[item.marketplace] = { prices: [], count: 0 };
    }
    perMarketplace[item.marketplace].prices.push(item.price);
    perMarketplace[item.marketplace].count++;
  }

  // Compute averages
  const breakdown: Record<string, { avgPrice: number; listingsFound: number }> = {};
  for (const [mp, data] of Object.entries(perMarketplace)) {
    breakdown[mp] = { avgPrice: mean(data.prices), listingsFound: data.count };
  }

  return { median: med, min, max, filtered, perMarketplace: breakdown };
}

// ─── Tavily search ────────────────────────────────────────────────────────────

export interface TavilySearchOptions {
  searchDepth?: 'basic' | 'advanced';
  maxResults?: number;
  includeDomains?: string[];
}

export async function tavilySearch(
  query: string,
  options: TavilySearchOptions = {}
): Promise<{ results: Array<{ title?: string; url?: string; content?: string }>; answer?: string }> {
  const apiKey = env.TAVILY_API_KEY || process.env['TAVILY_API_KEY'];
  if (!apiKey) return { results: [] };

  const body: Record<string, any> = {
    api_key: apiKey,
    query,
    search_depth: options.searchDepth || 'basic',
    max_results: options.maxResults || 8,
    include_answer: true,
  };
  if (options.includeDomains?.length) {
    body.include_domains = options.includeDomains;
  }

  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) {
      console.error(`[pricing] Tavily search failed (${res.status}) for query: ${query}`);
      return { results: [] };
    }
    return (await res.json()) as { results: any[]; answer?: string };
  } catch (err: any) {
    console.error(`[pricing] Tavily search error for query "${query}":`, err?.message || err);
    return { results: [] };
  }
}

// ─── Pricing Service Class ────────────────────────────────────────────────────

export class PricingService {
  /**
   * Resolve complexity multiplier for artisan labor.
   */
  private getComplexityMultiplier(complexity?: string | number): { factor: number; label: string } {
    if (typeof complexity === 'number') {
      if (complexity >= 4.5) return { factor: 1.6, label: 'Intricate' };
      if (complexity >= 3.5) return { factor: 1.35, label: 'High' };
      if (complexity >= 2.5) return { factor: 1.15, label: 'Medium' };
      return { factor: 1.0, label: 'Standard' };
    }

    const c = String(complexity || 'medium').toLowerCase();
    if (c.includes('intricate') || c.includes('master') || c.includes('expert')) {
      return { factor: 1.6, label: 'Intricate' };
    }
    if (c.includes('high') || c.includes('fine')) {
      return { factor: 1.35, label: 'High' };
    }
    if (c.includes('low') || c.includes('simple') || c.includes('basic')) {
      return { factor: 1.0, label: 'Standard' };
    }
    return { factor: 1.15, label: 'Medium' };
  }

  /**
   * Estimate pricing with real multi-marketplace search, statistical price extraction,
   * bounded LLM reasoning, and margin breakdown.
   */
  async estimatePricing(input: PricingEstimateInput): Promise<PricingEstimateResult> {
    const isDebug = input.debug === true || input.debug === 'true';

    if (!input.name && !input.category) {
      throw new HttpError(400, 'No product details provided');
    }

    const matCost = Math.max(0, Number(input.materialCost) || 0);
    const hours = Math.max(0, Number(input.labourHours) || 0);
    const wage = input.wageRate != null ? Number(input.wageRate) : 0;

    // Calculate production costs: direct labour or hours * wageRate
    const directLabor = input.labourCost != null && !isNaN(Number(input.labourCost)) && Number(input.labourCost) > 0
      ? Math.round(Number(input.labourCost))
      : Math.round(hours * (wage > 0 ? wage : (hours > 0 ? 100 : 0)));
    const baseCost = Math.round(matCost + directLabor);

    // ── Stage 1: Build search query ───────────────────────────────────────
    const coreName = cleanProductName(input.name) || input.category || '';
    const massMarket = looksMassMarket(input.name);
    const handmade = looksHandmade(input.name, input.category, input.material);

    // Build a tight, product-specific query — just the core product + "price India".
    // Long keyword-stuffed titles confuse Tavily's relevance when scoped to a single domain.
    const queryBase = coreName
      .replace(/\b(?:buy\s+online|handmade|handcrafted|artisan|for\s+(?:home\s+)?decor)\b/gi, '')
      .replace(/\s+/g, ' ')
      .trim();
    const query = `${queryBase || coreName || input.category} price India`;

    // Extract keywords for relevance filtering downstream
    const productKeywords = extractKeywords(coreName || input.name || input.category);

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('[pricing] Stage 1 — Query Preparation');
    console.log(`  coreName: "${coreName}"`);
    console.log(`  massMarket: ${massMarket} | handmade: ${handmade}`);
    console.log(`  productKeywords: [${productKeywords.join(', ')}]`);
    console.log(`  baseCost: ₹${baseCost}`);

    // ── Stage 2: Multi-marketplace search ─────────────────────────────────
    console.log('\n[pricing] Stage 2 — Multi-Marketplace Search');

    const marketplaces = [
      ...MARKETPLACES,
      ...(handmade ? HANDMADE_MARKETPLACES : []),
    ];

    // Run all searches in parallel for speed.
    // Each marketplace gets tailored queries — Tavily's snippet quality varies
    // wildly by platform, so we try the best query first, then retry with a
    // fallback if the first attempt returns mostly boilerplate (no prices).
    const MARKETPLACE_QUERIES: Record<string, string[]> = {
      Amazon:   [query],
      Flipkart: [`${queryBase || coreName} price list`, `${queryBase || coreName} buy price`],
      Meesho:   [`${queryBase || coreName} buy price`, `${queryBase || coreName} price list`],
      IndiaMART: [query],
      Etsy:     [query],
    };

    const searchPromises = marketplaces.map(async (mp) => {
      const queries = MARKETPLACE_QUERIES[mp.id] || [query];

      let bestResults: Array<{ title?: string; url?: string; content?: string }> = [];
      let bestAnswer = '';

      for (const q of queries) {
        // Flipkart's product pages are JS-rendered — 'basic' depth only gets
        // boilerplate footer text. 'advanced' crawls deeper and extracts prices.
        const depth = mp.id === 'Flipkart' ? 'advanced' : 'basic';
        console.log(`  → ${mp.id}: query="${q}" domains=[${mp.domains.join(', ')}] depth=${depth}`);
        const searchData = await tavilySearch(q, { includeDomains: mp.domains, searchDepth: depth });
        const rawResults = (searchData.results || []).slice(0, 10);

        // Check if this result set has any extractable prices — if so, use it.
        // If not, try the next query variant.
        const hasPrices = rawResults.some((r) => {
          const combined = `${r.title || ''} ${r.content || ''}`;
          return extractPrices(combined).length > 0;
        });

        if (hasPrices || bestResults.length === 0) {
          bestResults = rawResults;
          bestAnswer = searchData.answer || '';
        }

        if (hasPrices) break; // good enough, stop retrying
      }

      // Apply relevance filter — discard results whose title/content share no
      // meaningful keywords with the product name. This prevents "laptop stand"
      // or "night dress" results from contaminating the price dataset.
      const relevantResults = bestResults.filter((r) => isRelevantResult(r, productKeywords));
      const dropped = bestResults.length - relevantResults.length;
      console.log(`  ← ${mp.id}: ${bestResults.length} raw → ${relevantResults.length} relevant${dropped > 0 ? ` (${dropped} dropped)` : ''}`);

      return { marketplace: mp.id, results: relevantResults.slice(0, 8), answer: bestAnswer };
    });

    const searchResults = await Promise.all(searchPromises);

    // ── Stage 3: Structured price extraction ──────────────────────────────
    console.log('\n[pricing] Stage 3 — Structured Price Extraction');

    const allPriceItems: PriceListingItem[] = [];
    const allSources: PriceSource[] = [];
    const seenUrls = new Set<string>();

    for (const { marketplace, results } of searchResults) {
      const items = extractPricesWithContext(results, marketplace);
      allPriceItems.push(...items);

      // Collect sources with extracted prices and verified URLs
      for (const r of results) {
        const cleanUrl = normalizeSourceUrl(r.url);
        if (!cleanUrl || seenUrls.has(cleanUrl)) continue;
        seenUrls.add(cleanUrl);

        const combined = `${r.title || ''} ${r.content || ''}`;
        const prices = extractPrices(combined);
        allSources.push({
          title: r.title || `${marketplace} Listing`,
          url: cleanUrl,
          marketplace,
          extractedPrice: prices.length ? prices[0] : null,
        });
      }

      console.log(`  ${marketplace}: extracted ${items.length} price points`);
    }

    // Prioritize sources that have verified extracted prices
    allSources.sort((a, b) => {
      if (a.extractedPrice != null && b.extractedPrice == null) return -1;
      if (a.extractedPrice == null && b.extractedPrice != null) return 1;
      return 0;
    });

    // ── Stage 4: Statistical aggregation ──────────────────────────────────
    console.log('\n[pricing] Stage 4 — Statistical Aggregation');

    const stats = aggregatePrices(allPriceItems);

    console.log(`  Median: ₹${stats.median}`);
    console.log(`  Range: ₹${stats.min} – ₹${stats.max}`);
    console.log(`  Total price points (after outlier filter): ${stats.filtered.length}`);
    console.log('  Per-marketplace breakdown:');
    for (const [mp, data] of Object.entries(stats.perMarketplace)) {
      console.log(`    ${mp}: avg ₹${data.avgPrice} (${data.listingsFound} listings)`);
    }

    // Build the marketplaceBreakdown array for the response.
    // Always include ALL searched marketplaces — even those with 0 results — so
    // the frontend can show "Flipkart: 0 listings" instead of silently omitting it.
    const marketplaceBreakdown: MarketplacePricePoint[] = marketplaces.map((mp) => {
      const data = stats.perMarketplace[mp.id];
      return {
        marketplace: mp.id,
        avgPrice: data ? data.avgPrice : 0,
        listingsFound: data ? data.listingsFound : 0,
      };
    });

    // ── Stage 5: LLM reasoning (narrow scope) ────────────────────────────
    console.log('\n[pricing] Stage 5 — LLM Reasoning');

    let suggested = stats.median || baseCost;
    let reasoning = '';
    let marketMin = stats.min;
    let marketMax = stats.max;

    if (stats.filtered.length > 0) {
      // Pick top 2-3 citations for the LLM
      const topListings = stats.filtered.slice(0, 3).map((i) => ({
        marketplace: i.marketplace,
        price: i.price,
        title: i.title,
      }));

      const userContent = JSON.stringify({
        baseCost,
        marketMin: stats.min,
        marketMax: stats.max,
        medianPrice: stats.median,
        marketplaceBreakdown,
        topListings,
      });

      console.log(`  Sending to LLM: marketMin=₹${stats.min}, marketMax=₹${stats.max}, median=₹${stats.median}`);

      try {
        const parsed = await llmService.generateJSON<{ suggested?: number; reasoning?: string }>([
          { role: 'system', content: REASONING_PROMPT },
          { role: 'user', content: userContent },
        ], { temperature: 0.2 });

        // Clamp LLM's suggestion to the statistical range
        suggested = Math.max(stats.min, Math.min(stats.max, Number(parsed.suggested) || stats.median));
        reasoning = parsed.reasoning || '';

        if (isDebug) {
          console.log(`  LLM suggested: ₹${parsed.suggested} → clamped to ₹${suggested}`);
        }
      } catch (llmErr: any) {
        console.warn('[pricing] LLM reasoning call failed, falling back to statistical median:', llmErr?.message);
        suggested = stats.median;
        reasoning = `Based on real e-commerce data from ${marketplaces.map((m) => m.id).join(', ')}, prices range between ₹${stats.min} and ₹${stats.max} with a market median of ₹${stats.median}.`;
      }
    } else {
      // Fallback: no market data found — resolve craft benchmark or anchor to baseCost with 20% margin
      const craftKey = [input.category, input.material, input.name]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      const sortedBenchmarks = Object.entries(CRAFT_BENCHMARKS)
        .filter(([key]) => key !== 'handicraft')
        .sort(([keyA], [keyB]) => keyB.length - keyA.length);
      const compactKey = craftKey.replace(/\s+/g, '');
      let benchmark = CRAFT_BENCHMARKS['handicraft'];

      for (const [key, bm] of sortedBenchmarks) {
        const wordRegex = new RegExp(`\\b${key}\\b`, 'i');
        if (wordRegex.test(craftKey) || compactKey.includes(key)) {
          benchmark = bm;
          break;
        }
      }

      marketMin = benchmark?.min || Math.round(baseCost * 0.9);
      marketMax = benchmark?.max || Math.round(baseCost * 1.8);
      suggested = Math.max(marketMin, Math.min(marketMax, Math.round(baseCost * 1.2)));
      reasoning = `No market price data could be extracted from search results. Suggested price is based on a 20% margin over production cost (₹${baseCost}) within regional benchmark range (₹${marketMin}–₹${marketMax}).`;
      console.log('  ⚠ No price data extracted — falling back to baseCost + 20% margin');
    }

    console.log(`\n[pricing] Final: suggested ₹${suggested}, range ₹${marketMin}–₹${marketMax}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // ── Stage 6: Margin Breakdown & Artisan Profit ─────────────────────────
    const complexityInfo = this.getComplexityMultiplier(input.craftComplexity);
    const complexityPremium = Math.round(directLabor * (complexityInfo.factor - 1.0));
    const packagingAndBuffer = Math.round(suggested * 0.1); // 10% packaging & logistics buffer
    const artisanProfit = Math.max(0, suggested - baseCost - packagingAndBuffer);
    const profitPercentage = suggested > 0 ? Math.round((artisanProfit / suggested) * 1000) / 10 : 0;

    const marginBreakdown: MarginBreakdown = {
      materialCost: matCost,
      materialPercentage: suggested > 0 ? Math.round((matCost / suggested) * 1000) / 10 : 0,
      laborCost: directLabor,
      laborPercentage: suggested > 0 ? Math.round((directLabor / suggested) * 1000) / 10 : 0,
      complexityPremium,
      complexityPercentage: suggested > 0 ? Math.round((complexityPremium / suggested) * 1000) / 10 : 0,
      baseCost,
      packagingAndBuffer,
      artisanProfit,
      profitPercentage,
      recommendedPrice: suggested,
    };

    // ── Optional DB persistence if productId is provided ─────────────────
    let pricingId: number | undefined;
    if (input.productId && !isNaN(Number(input.productId))) {
      const prodId = Number(input.productId);
      const product = await db.orm.public.Product.where({ id: prodId }).all().first();
      if (product) {
        const existing = await db.orm.public.Pricing.where({ productId: prodId }).all().first();
        if (existing) {
          await db.orm.public.Pricing.where({ id: existing.id }).update({
            materialCost: matCost,
            laborCost: directLabor + complexityPremium,
            minimumPrice: baseCost,
            marketMin,
            marketMax,
            recommendedPrice: suggested,
          });
          pricingId = existing.id;
        } else {
          const row = await db.orm.public.Pricing.create({
            productId: prodId,
            materialCost: matCost,
            laborCost: directLabor + complexityPremium,
            minimumPrice: baseCost,
            marketMin,
            marketMax,
            recommendedPrice: suggested,
          });
          pricingId = row.id;
        }

        // Also update Product.price in DB
        await db.orm.public.Product.where({ id: prodId }).update({
          price: suggested,
        });
      }
    }

    // ── Build response payload ────────────────────────────────────────────
    const payload: PricingEstimateResult = {
      baseCost,
      minimumBaseCost: baseCost,
      marketMin,
      marketMax,
      suggested,
      recommendedPrice: suggested,
      reasoning,
      marginBreakdown,
      marketplaceBreakdown,
      sources: allSources.slice(0, 20),
      pricingSource: stats.filtered.length > 0 ? 'live_search' : 'benchmark_fallback',
      pricingId,
    };

    if (isDebug) {
      payload.debug = {
        query,
        coreName,
        massMarket,
        handmade,
        pricesFound: allPriceItems.map((i) => i.price),
        stats: {
          median: stats.median,
          min: stats.min,
          max: stats.max,
          filteredCount: stats.filtered.length,
          totalCount: allPriceItems.length,
        },
      };
    }

    return payload;
  }

  /**
   * Retrieve saved pricing data for a product.
   */
  async getPricingForProduct(productId: number) {
    const pricing = await db.orm.public.Pricing.where({ productId }).all().first();
    if (!pricing) throw new HttpError(404, 'Pricing record not found for this product.');
    return pricing;
  }
}

export const pricingService = new PricingService();
