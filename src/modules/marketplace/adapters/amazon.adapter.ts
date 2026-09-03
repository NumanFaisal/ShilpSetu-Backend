import { HttpError } from '../../../lib/http-error';
import type { MarketplaceAdapter, MarketplaceProduct } from '../marketplace.types';

/**
 * Amazon SP-API adapter (connect stub).
 *
 * Amazon requires a seller to authorize your application via OAuth 2.0 before you
 * can call SP-API on their behalf. Until a real Amazon developer app + seller
 * authorization exists, `connect` records the submitted seller/refresh token and
 * listing operations throw a clear error so the contract stays complete and a real
 * implementation can drop in later.
 */
export class AmazonAdapter implements MarketplaceAdapter {
  name = 'AMAZON' as const;

  async connect(authPayload: Record<string, unknown>): Promise<{ externalSellerId?: string }> {
    const sellerId = typeof authPayload.sellerId === 'string' ? authPayload.sellerId : undefined;
    if (!sellerId) {
      throw new HttpError(
        400,
        'Amazon connect requires a seller id (SP-API OAuth authorization is required).'
      );
    }
    return { externalSellerId: sellerId };
  }

  async createListing(_product: MarketplaceProduct): Promise<{ externalId: string }> {
    throw new HttpError(
      501,
      'Amazon listing creation requires SP-API seller OAuth authorization, which is not configured yet.'
    );
  }

  async updateListing(_product: MarketplaceProduct): Promise<void> {
    throw new HttpError(
      501,
      'Amazon listing update requires SP-API seller OAuth authorization, which is not configured yet.'
    );
  }

  async updateInventory(_externalId: string, _quantity: number): Promise<void> {
    throw new HttpError(501, 'Amazon inventory sync is not configured yet.');
  }

  async updatePrice(_externalId: string, _price: number): Promise<void> {
    throw new HttpError(501, 'Amazon price sync is not configured yet.');
  }
}

export const amazonAdapter = new AmazonAdapter();
