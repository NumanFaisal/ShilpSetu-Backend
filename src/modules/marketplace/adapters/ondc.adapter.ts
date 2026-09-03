import { r2 } from '../../../lib/r2';
import { HttpError } from '../../../lib/http-error';
import type { MarketplaceAdapter, MarketplaceProduct } from '../marketplace.types';

/**
 * ONDC (Open Network for Digital Commerce) adapter.
 *
 * ONDC is a network-participant model, not a single marketplace API. In practice
 * ShilpSetu would integrate as (or with) a Seller Network Participant. This adapter
 * implements the catalog export — the part that maps a master Product into ONDC's
 * catalog schema (RET10: retail) — plus a connect stub that records intent.
 */
export class OndcAdapter implements MarketplaceAdapter {
  name = 'ONDC' as const;

  async connect(authPayload: Record<string, unknown>): Promise<{ externalSellerId?: string }> {
    // ONDC onboarding = participant/NP setup. We record the NP/participant id.
    const sellerId = typeof authPayload.npId === 'string' ? authPayload.npId : undefined;
    if (!sellerId) {
      throw new HttpError(400, 'ONDC connect requires a participant (NP) id in "npId".');
    }
    return { externalSellerId: sellerId };
  }

  async createListing(product: MarketplaceProduct): Promise<{ externalId: string }> {
    // ONDC catalog push would go to the NP's catalog endpoint. Until a live NP
    // endpoint is configured, expose the export as the catalog payload.
    const schema = this.exportSchema!(product);
    return { externalId: `ONDC-${product.id}` };
  }

  async updateListing(_product: MarketplaceProduct): Promise<void> {
    // No-op for now — listing update flows through the NP catalog API.
  }

  async updateInventory(_externalId: string, _quantity: number): Promise<void> {
    // No-op until live NP integration.
  }

  async updatePrice(_externalId: string, _price: number): Promise<void> {
    // No-op until live NP integration.
  }

  /**
   * Exports a product into the ONDC catalog provider/items schema.
   * https://docs.ondc.org — retail domain (RET10).
   */
  exportSchema(product: MarketplaceProduct): object {
    const title = product.catalogue?.titleEn || product.name;
    const desc = product.catalogue?.descriptionEn || product.description || '';
    const price = product.pricing?.recommendedPrice ?? product.price;
    const imageKey = product.images?.find((i) => i.outputSquareKey)?.outputSquareKey;

    return {
      context: {
        domain: 'ONDC:RET10',
        country: 'IND',
        city: '*',
        action: 'on_search',
        core_version: '1.2.0',
      },
      message: {
        catalog: {
          'bpp/providers': [
            {
              id: `shilpsetu-${product.id}`,
              items: [
                {
                  id: String(product.id),
                  descriptor: {
                    name: title,
                    long_desc: desc,
                    images: imageKey ? [imageKey] : [],
                  },
                  price: {
                    currency: 'INR',
                    value: price != null ? String(price) : '0',
                  },
                  quantity: {
                    available: { count: product.quantity },
                    maximum: { count: product.quantity },
                  },
                  '@ondc/org/statutory_reqs_promotional': { '@ondc/org/brand': 'ShilpSetu' },
                },
              ],
            },
          ],
        },
      },
    };
  }
}

export const ondcAdapter = new OndcAdapter();
