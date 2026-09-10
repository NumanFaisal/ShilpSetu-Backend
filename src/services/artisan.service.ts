import { db } from '../prisma/db';
import { HttpError } from '../lib/http-error';
import type { CreateArtisanInput, UpdateArtisanInput } from '../modules/artisan/artisan.types';

/** Turns "Meera's Bamboo Crafts" into "meeras-bamboo-crafts". */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60) || 'artisan';
}

export class ArtisanService {
  /**
   * Creates the Artisan profile for the currently authenticated User.
   * One Artisan per User (schema has a unique constraint on userId).
   */
  async createProfile(userId: number, input: CreateArtisanInput) {
    const existing = await db.orm.public.Artisan.where({ userId }).all().first();
    if (existing) {
      throw new HttpError(409, 'Artisan profile already exists for this account.');
    }

    const user = await db.orm.public.User.where({ id: userId }).first();
    if (!user) throw new HttpError(404, 'User not found.');

    // Generate a unique, storefront-friendly slug.
    const base = slugify(input.storeName || user.name);
    let slug = base;
    let suffix = 1;
    // eslint-disable-next-line no-await-in-loop
    while (await db.orm.public.Artisan.where({ slug }).all().first()) {
      slug = `${base}-${suffix}`;
      suffix += 1;
    }

    return db.orm.public.Artisan.create({
      userId,
      location: input.location,
      state: input.state,
      district: input.district,
      craftType: input.craftType,
      experience: input.experience ?? null,
      slug,
      storeName: input.storeName ?? null,
      bio: input.bio ?? null,
    });
  }

  async getByUserId(userId: number) {
    const artisan = await db.orm.public.Artisan.where({ userId }).all().first();
    if (!artisan) {
      throw new HttpError(404, 'No artisan profile yet — create one via POST /api/artisans first.');
    }
    return artisan;
  }

  async updateProfile(userId: number, input: UpdateArtisanInput) {
    const artisan = await this.getByUserId(userId);

    const patch: Record<string, unknown> = {};
    if (input.location !== undefined) patch.location = input.location;
    if (input.state !== undefined) patch.state = input.state;
    if (input.district !== undefined) patch.district = input.district;
    if (input.craftType !== undefined) patch.craftType = input.craftType;
    if (input.experience !== undefined) patch.experience = input.experience;
    if (input.bio !== undefined) patch.bio = input.bio;
    if (input.storeName !== undefined) patch.storeName = input.storeName;

    if (Object.keys(patch).length === 0) return artisan;

    await db.orm.public.Artisan.where({ id: artisan.id }).update(patch as any);
    return db.orm.public.Artisan.where({ id: artisan.id }).first();
  }

  /**
   * Every product/order/pricing/catalogue endpoint is scoped to "my" artisan
   * profile, not the raw JWT userId. This is the single place that resolves
   * userId -> artisanId (and 404s with a clear message if onboarding wasn't
   * finished), so every other service can just call this instead of
   * re-querying Artisan directly.
   */
  async requireArtisanId(userId: number): Promise<number> {
    const artisan = await this.getByUserId(userId);
    return artisan.id;
  }
}

export const artisanService = new ArtisanService();
