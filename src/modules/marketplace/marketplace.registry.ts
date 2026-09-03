import type { Marketplace, MarketplaceAdapter } from './marketplace.types';
import { amazonAdapter } from './adapters/amazon.adapter';
import { flipkartAdapter } from './adapters/flipkart.adapter';
import { ondcAdapter } from './adapters/ondc.adapter';
import { gemAdapter } from './adapters/gem.adapter';

/**
 * Registry of all marketplace adapters, keyed by Marketplace name.
 * Mirrors the AI-provider pattern in modules/image/ai/ai.service.ts.
 */
const REGISTRY: Record<Marketplace, MarketplaceAdapter> = {
  AMAZON: amazonAdapter,
  FLIPKART: flipkartAdapter,
  ONDC: ondcAdapter,
  GEM: gemAdapter,
};

export function getAdapter(marketplace: Marketplace): MarketplaceAdapter {
  const adapter = REGISTRY[marketplace];
  if (!adapter) {
    throw new Error(`Unknown marketplace adapter: ${marketplace}`);
  }
  return adapter;
}

export function listAdapters(): MarketplaceAdapter[] {
  return Object.values(REGISTRY);
}

export function isMarketplace(value: string): value is Marketplace {
  return Object.prototype.hasOwnProperty.call(REGISTRY, value);
}
