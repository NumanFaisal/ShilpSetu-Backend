import Redis from 'ioredis';
import { env } from '../config/env';

/**
 * Creates a Redis connection for BullMQ.
 * Uses REDIS_URL if provided, otherwise falls back to individual env vars.
 */
export function createRedisConnection(): Redis {
  if (env.REDIS_URL) {
    return new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
    });
  }

  return new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });
}
