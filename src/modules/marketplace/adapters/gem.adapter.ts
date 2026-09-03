import { HttpError } from '../../../lib/http-error';
import type { MarketplaceAdapter, MarketplaceProduct } from '../marketplace.types';

/**
 * GeM (Government e-Marketplace) adapter.
 *
 * GeM has its own seller onboarding + approval process. For this project we export
 * products into a GeM-compatible data model (JSON) that can be uploaded once a
 * GeM seller account exists; we do not promise automatic GeM seller creation.
 */
export class GemAdapter implements MarketplaceAdapter {
  name = 'GEM' as const;

  async connect(authPayload: Record<string, unknown>): Promise<{ externalSellerId?: string }> {
    // GeM requires a registered seller. We record the seller/vendor id if provided.
    const sellerId = typeof authPayload.sellerId === 'string' ? authPayload.sellerId : undefined;
    if (!sellerId) {
      throw new HttpError(400, 'GeM connect requires a registered seller id in "sellerId".');
    }
    return { externalSellerId: sellerId };
  }

  async createListing(product: MarketplaceProduct): Promise<{ externalId: string }> {
    return { externalId: `GEM-${product.id}` };
  }

  async updateListing(_product: MarketplaceProduct): Promise<void> {
    // No-op until live GeM integration.
  }

  async updateInventory(_externalId: string, _quantity: number): Promise<void> {
    // No-op until live GeM integration.
  }

  async updatePrice(_externalId: string, _price: number): Promise<void> {
    // No-op until live GeM integration.
  }

  /** Exports a product into a GeM-compatible product data model (JSON). */
  exportSchema(product: MarketplaceProduct): object {
    const title = product.catalogue?.titleEn || product.name;
    const desc = product.catalogue?.descriptionEn || product.description || '';
    const price = product.pricing?.recommendedPrice ?? product.price;

    return {
      product: {
        sku: `SHILPSETU-${product.id}`,
        title,
        description: desc,
        category: product.category || 'Handicrafts',
        material: product.material,
        unit: 'Nos',
        price: price ?? 0,
        quantity: product.quantity,
        currency: 'INR',
        keywords: product.catalogue?.keywords ?? [],
        careInstructions: product.catalogue?.careInstructions,
        // GeM onboarding fields to be completed by the registered seller.
        gstApplicable: false,
        delivery: {
          type: 'FORWARD',
        },
      },
    };
  }
}

export const gemAdapter = new GemAdapter();
