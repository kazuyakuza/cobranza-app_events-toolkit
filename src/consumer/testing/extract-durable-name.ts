/**
 * Test-only helper for extracting `durable_name` from NATS consumer options.
 *
 * Used in unit tests to assert that gateway-level `durableName` and per-subscription
 * consumer opts are correctly merged into the resolved `ConsumerOpts` passed to
 * `jetStream.subscribe()`. Not intended for production use.
 *
 * Supports two input shapes:
 * - `ConsumerOptsBuilder` — extracts via duck-typed `getOpts()` method.
 * - `Partial<ConsumerOpts>` — reads `config.durable_name` directly.
 *
 * @param optsArg - The resolved consumer opts value (builder or plain config).
 * @returns The `durable_name` string if present, or `undefined` for ephemeral consumers.
 */
export function extractDurableName(optsArg: unknown): string | undefined {
  const getOptsFn = (optsArg as { getOpts?: () => { config: Record<string, unknown> } }).getOpts;
  if (typeof getOptsFn === 'function') {
    return getOptsFn.call(optsArg).config.durable_name as string | undefined;
  }
  return (optsArg as { config?: Record<string, unknown> }).config?.durable_name as string | undefined;
}
