/**
 * Computes an ISO-8601 expiry timestamp based on the current time plus TTL seconds.
 *
 * @param ttlSeconds - Number of seconds from now when the entry should expire.
 * @returns ISO-8601 date string.
 */
export function computeExpiry(ttlSeconds: number): string {
  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}
