import { db } from '../prisma/db';

/**
 * MoSJE Admin & Impact Analytics (Component 5).
 * Aggregates onboarding, economics, and marketplace health metrics.
 */
class AnalyticsService {
  // ------------------------------------------------------------------
  // Onboarding stats
  // ------------------------------------------------------------------

  async getOnboardingStats(): Promise<any> {
    const [artisanAgg, productAgg, regional] = await Promise.all([
      db.orm.public.Artisan.aggregate((a) => ({ count: a.count() })),
      db.orm.public.Product.where({ status: 'published' }).aggregate((a) => ({ count: a.count() })),
      db.orm.public.Artisan
        .groupBy('state')
        .aggregate((a) => ({ count: a.count() })),
    ]);

    return {
      totalArtisans: artisanAgg.count,
      publishedProducts: productAgg.count,
      regional: (regional as any[]).map((r) => ({ state: r.state, count: r.count })),
    };
  }

  // ------------------------------------------------------------------
  // Economics stats
  // ------------------------------------------------------------------

  async getEconomicsStats(): Promise<any> {
    const revenueAgg = await db.orm.public.Order.aggregate((a) => ({ total: a.sum('totalAmount') }));
    const avgPriceAgg = await db.orm.public.Product.aggregate((a) => ({ avg: a.avg('price') }));
    const inquiryAgg = await db.orm.public.B2BInquiry
      .where((i) => i.status.neq('PENDING'))
      .aggregate((a) => ({ count: a.count() }));

    return {
      estimatedRevenue: revenueAgg.total ?? 0,
      avgListingPrice: avgPriceAgg.avg ?? 0,
      matchedInquiries: inquiryAgg.count,
    };
  }

  // ------------------------------------------------------------------
  // Marketplace health
  // ------------------------------------------------------------------

  async getMarketplaceHealth(): Promise<any> {
    const connections = await db.orm.public.MarketplaceConnection.all();
    const listings = await db.orm.public.MarketplaceListing.all();

    // Artisans connected per platform
    const connectedByPlatform: Record<string, number> = {};
    for (const c of connections) {
      if (c.status === 'CONNECTED') {
        connectedByPlatform[c.marketplace] = (connectedByPlatform[c.marketplace] || 0) + 1;
      }
    }

    // Publish success / failed rates per platform
    const publishByPlatform: Record<string, { total: number; published: number; failed: number; pending: number }> = {};
    for (const l of listings) {
      const entry = (publishByPlatform[l.marketplace] ||= { total: 0, published: 0, failed: 0, pending: 0 });
      entry.total += 1;
      if (l.status === 'PUBLISHED') entry.published += 1;
      else if (l.status === 'FAILED') entry.failed += 1;
      else if (l.status === 'PENDING') entry.pending += 1;
    }

    return {
      connectedArtisans: connections.filter((c) => c.status === 'CONNECTED').length,
      connectionsByPlatform: connectedByPlatform,
      totalListings: listings.length,
      publishByPlatform,
    };
  }

  // ------------------------------------------------------------------
  // Combined dashboard
  // ------------------------------------------------------------------

  async getDashboard(): Promise<any> {
    const [onboarding, economics, marketplaces] = await Promise.all([
      this.getOnboardingStats(),
      this.getEconomicsStats(),
      this.getMarketplaceHealth(),
    ]);
    return { onboarding, economics, marketplaces };
  }

  async listArtisans(): Promise<any> {
    return db.orm.public.Artisan
      .include('user', (u) => u)
      .all();
  }

  async listProducts(): Promise<any> {
    return db.orm.public.Product
      .include('artisan', (a) => a)
      .all();
  }

  async listInquiries(): Promise<any> {
    return db.orm.public.B2BInquiry.all();
  }
}

export const analyticsService = new AnalyticsService();
