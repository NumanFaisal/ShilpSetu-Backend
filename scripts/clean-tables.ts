import { Client } from 'pg';
import { env } from '../src/config/env';

async function main() {
  const client = new Client({
    connectionString: env.DATABASE_URL,
  });

  await client.connect();
  console.log('Connected to Postgres.');

  // Drop conflicting old dev tables if present so prisma db update can cleanly recreate them
  await client.query(`DROP TABLE IF EXISTS "productImage" CASCADE;`);
  await client.query(`DROP TABLE IF EXISTS "imageVersion" CASCADE;`);
  await client.query(`DROP TABLE IF EXISTS "imageBatch" CASCADE;`);
  await client.query(`DROP TABLE IF EXISTS "aILog" CASCADE;`);

  console.log('Cleaned old table definitions.');
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
