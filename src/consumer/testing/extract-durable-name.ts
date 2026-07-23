/**
 * Extracts the `durable_name` from a resolved consumer opts value.
 *
 * Works with both ConsumerOptsBuilder (via duck-typed getOpts()) and
 * plain Partial<ConsumerOpts> objects.
 */
export function extractDurableName(optsArg: unknown): string | undefined {
  const getOptsFn = (optsArg as { getOpts?: () => { config: Record<string, unknown> } }).getOpts;
  if (typeof getOptsFn === 'function') {
    return getOptsFn.call(optsArg).config.durable_name as string | undefined;
  }
  return (optsArg as { config?: Record<string, unknown> }).config?.durable_name as string | undefined;
}
