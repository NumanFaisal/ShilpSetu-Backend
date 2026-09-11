import Redis from 'ioredis';
import { env } from '../config/env';

/**
 * Creates a Redis connection for BullMQ.
 * Uses REDIS_URL if provided, otherwise falls back to individual env vars.
 */
export function createRedisConnection(): Redis {
  if (env.REDIS_URL) {
    const isTls = env.REDIS_URL.startsWith('rediss://');
    return new Redis(env.REDIS_URL, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      ...(isTls ? { tls: { rejectUnauthorized: false } } : {}),
      retryStrategy: (times) => Math.min(times * 200, 5000),
      reconnectOnError: (err) => {
        const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
        return targetErrors.some((target) => err.message.includes(target));
      },
    });
  }

  if (process.env.NODE_ENV === 'production') {
    console.warn(
      '⚠️ [Redis] REDIS_URL is not set in production! Falling back to REDIS_HOST: ' +
        env.REDIS_HOST +
        ':' +
        env.REDIS_PORT
    );
  }

  return new Redis({
    host: env.REDIS_HOST,
    port: env.REDIS_PORT,
    password: env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    retryStrategy: (times) => Math.min(times * 200, 5000),
  });
}
