import { Temporal } from 'temporal-polyfill';

/**
 * Prisma Next maps DateTime columns to the TC39 Temporal `Instant` type.
 * Node 24 doesn't expose the global here, so we use the installed
 * `temporal-polyfill` to construct instants.
 */

/** Current moment as a Temporal.Instant. */
export function nowInstant(): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(Date.now());
}

/** Convert a date string / epoch ms / Date into a Temporal.Instant. */
export function toInstant(value: string | number | Date): Temporal.Instant {
  const ms = typeof value === 'number' ? value : new Date(value).getTime();
  return Temporal.Instant.fromEpochMilliseconds(ms);
}

/** Convert a Temporal.Instant or raw date value into a JavaScript Date safely. */
export function instantToDate(value: any): Date {
  if (!value) return new Date();
  if (value instanceof Date) return value;
  if (typeof value?.epochMilliseconds === 'number') {
    return new Date(value.epochMilliseconds);
  }
  try {
    return new Date(value.toString());
  } catch {
    return new Date();
  }
}

/** Convert a Temporal.Instant or raw date value into an ISO string. */
export function instantToString(value: any): string {
  if (!value) return new Date().toISOString();
  if (typeof value?.toString === 'function') {
    return value.toString();
  }
  return String(value);
}
