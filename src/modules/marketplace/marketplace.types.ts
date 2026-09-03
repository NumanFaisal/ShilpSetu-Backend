/**
 * Marketplace domain types (Component 4).
 * A single master Product is translated to each platform via a MarketplaceAdapter.
 */

export const MARKETPLACES = ['AMAZON', 'FLIPKART', 'ONDC', 'GEM'] as const;
export type Marketplace = (typeof MARKETPLACES)[number];

export const CONNECTION_STATUSES = [
  'NOT_CONNECTED',
  'PENDING',
  'CONNECTED',
  'EXPIRED',
  'ERROR',
  'DISCONNECTED',
] as const;
export type ConnectionStatus = (typeof CONNECTION_STATUSES)[number];

export const LISTING_STATUSES = [
  'NOT_PUBLISHED',
  'PENDING',
  'PUBLISHED',
  'FAILED',
  'PAUSED',
] as const;
export type ListingStatus = (typeof LISTING_STATUSES)[number];

/** The subset of a master Product the adapters need (fields + linked images). */
export interface MarketplaceProduct {
  id: number;
  name: string;
  category: string | null;
  material: string | null;
  description: string | null;
  price: number | null;
  quantity: number;
  status: string;
  catalogue?: {
    titleEn: string | null;
    titleHi: string | null;
    descriptionEn: string | null;
    descriptionHi: string | null;
    keywords: string[];
    careInstructions: string | null;
  } | null;
  pricing?: {
    recommendedPrice: number | null;
    marketMin: number | null;
    marketMax: number | null;
  } | null;
  /** Final square image R2 key(s) — used to build public URLs. */
  images?: Array<{ outputSquareKey: string | null }>;
}

/**
 * The contract every marketplace backend implements.
 * Amazon/Flipkart adapters are connect-stubs until real seller OAuth exists;
 * ONDC/GeM adapters provide real exportSchema() serializers.
 */
export interface MarketplaceAdapter {
  name: Marketplace;

  /** Initiate/store a connection for an artisan (OAuth start, creds, or NP setup). */
  connect(authPayload: Record<string, unknown>): Promise<{ externalSellerId?: string }>;

  /** Create a listing on the marketplace. Returns the external listing id. */
  createListing(product: MarketplaceProduct): Promise<{ externalId: string }>;

  /** Update an existing listing. */
  updateListing(product: MarketplaceProduct): Promise<void>;

  /** Sync inventory (quantity) to the marketplace. */
  updateInventory(externalId: string, quantity: number): Promise<void>;

  /** Sync price to the marketplace. */
  updatePrice(externalId: string, price: number): Promise<void>;

  /** Export the product to this marketplace's native schema (ONDC/GeM). */
  exportSchema?(product: MarketplaceProduct): object;
}

export interface MarketplacePublishJobData {
  productId: number;
  marketplace: Marketplace;
}
