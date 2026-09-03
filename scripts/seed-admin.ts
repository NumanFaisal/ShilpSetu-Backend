import { db } from '../src/prisma/db';
import { env } from '../src/config/env';
import bcrypt from 'bcryptjs';

/**
 * Upserts an admin User (role: 'admin') from ADMIN_PHONE / ADMIN_PASSWORD env.
 * Run with: npm run seed:admin
 */
async function main() {
  const phone = env.ADMIN_PHONE;
  const password = env.ADMIN_PASSWORD;

  if (!phone || !password) {
    console.error(
      'ADMIN_PHONE and ADMIN_PASSWORD must be set in the environment/.env to seed an admin.'
    );
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const existing = await db.orm.public.User.where({ phone }).first();
  if (existing) {
    await db.orm.public.User.where({ id: existing.id }).update({
      role: 'admin',
      passwordHash,
      name: existing.name || 'MoSJE Admin',
    });
    console.log(`Admin updated for phone ${phone} (user id ${existing.id}).`);
  } else {
    await db.orm.public.User.create({
      name: 'MoSJE Admin',
      phone,
      passwordHash,
      role: 'admin',
      language: 'en',
    });
    console.log(`Admin created for phone ${phone}.`);
  }
}

main()
  .catch((err) => {
    console.error('seed-admin failed:', err);
    process.exit(1);
  })
  .finally(() => db.close());
