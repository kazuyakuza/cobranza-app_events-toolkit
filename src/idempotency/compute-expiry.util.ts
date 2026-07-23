/**
 * Computes an ISO-8601 expiry timestamp based on the current time plus TTL seconds.
 *
 * @param ttlSeconds - Number of seconds from now when the entry should expire.
 * @returns ISO-8601 date string suitable for the `expires_at` column.
 *
 * @example
 * ```ts
 * const expiresAt = computeExpiry(3600);
 * // => "2026-07-23T14:02:23.000Z"  (approximately one hour from now)
 * ```
 *
 * @see {@link IdempotencyEntry.expiresAt} — the field this value populates.
 */
export function computeExpiry(ttlSeconds: number): string {
  return new Date(Date.now() + ttlSeconds * 1000).toISOString();
}
