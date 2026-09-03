import { HttpError } from '../../../lib/http-error';
import type { MarketplaceAdapter, MarketplaceProduct } from '../marketplace.types';

/**
 * Flipkart Seller API adapter (connect stub).
 *
 * Flipkart requires sellers to register first, then configure API access via the
 * seller/developer portal (which yields a seller id + tokens). Until a real
 * registered seller exists, `connect` records the submitted seller id and listing
 * operations throw a clear error so a real implementation can drop in later.
 */
export class FlipkartAdapter implements MarketplaceAdapter {
  name = 'FLIPKART' as const;

  async connect(authPayload: Record<string, unknown>): Promise<{ externalSellerId?: string }> {
    const sellerId = typeof authPayload.sellerId === 'string' ? authPayload.sellerId : undefined;
    if (!sellerId) {
      throw new HttpError(
        400,
        'Flipkart connect requires a registered seller id (seller must complete Flipkart onboarding first).'
      );
    }
    return { externalSellerId: sellerId };
  }

  async createListing(_product: MarketplaceProduct): Promise<{ externalId: string }> {
    throw new HttpError(
      501,
      'Flipkart listing creation requires a registered seller with API access, which is not configured yet.'
    );
  }

  async updateListing(_product: MarketplaceProduct): Promise<void> {
    throw new HttpError(501, 'Flipkart listing update is not configured yet.');
  }

  async updateInventory(_externalId: string, _quantity: number): Promise<void> {
    throw new HttpError(501, 'Flipkart inventory sync is not configured yet.');
  }

  async updatePrice(_externalId: string, _price: number): Promise<void> {
    throw new HttpError(501, 'Flipkart price sync is not configured yet.');
  }
}

export const flipkartAdapter = new FlipkartAdapter();
