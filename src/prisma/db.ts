import 'dotenv/config';
// Prisma Next date codecs (timestamptz) read/write via the global Temporal API.
// Node does not expose Temporal globally, so install the polyfill before the client.
import { Temporal } from 'temporal-polyfill';
globalThis.Temporal = Temporal;
import postgres from '@prisma/orm-postgres/runtime';
import type { Contract } from './contract.d';
import contractJson from './contract.json' with { type: 'json' };

export const db = postgres<Contract>({
  contractJson,
  url: process.env['DATABASE_URL']!,
});
