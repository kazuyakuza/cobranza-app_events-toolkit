import type { NatsConnection, StreamConfig } from 'nats';
import { EventLoggerService } from '../logging/event-logger.service';
import { StreamAutoCreator } from './stream-auto-creator';

/**
 * Creates a {@link StreamAutoCreator} when auto-creation is enabled and a connection is available.
 *
 * Called by consumer services during construction to lazily initialize stream auto-creation.
 * Returns `undefined` when either `autoCreateStreams` is `false`/omitted or no NATS `connection`
 * is provided, allowing callers to pass the result through to {@link ensureStreamExists} without
 * null-checking at every call site.
 *
 * @param deps.autoCreateStreams - Whether stream auto-creation is enabled. Default: `false`.
 * @param deps.connection - Active NATS connection. Required for auto-creation.
 * @param deps.streamConfig - Optional `Partial<StreamConfig>` overrides merged over auto-creator defaults.
 * @param deps.logger - Logger instance for auto-creation events.
 * @returns A configured {@link StreamAutoCreator}, or `undefined` when auto-creation is disabled.
 * @see {@link docs/nats-jetstream-configuration.md#stream-auto-creation} for usage guide.
 */
export function createStreamAutoCreator(deps: {
  autoCreateStreams?: boolean;
  connection?: NatsConnection;
  streamConfig?: Partial<StreamConfig>;
  logger: EventLoggerService;
}): StreamAutoCreator | undefined {
  if (!deps.autoCreateStreams || !deps.connection) {
    return undefined;
  }
  return new StreamAutoCreator({
    connection: deps.connection,
    streamConfig: deps.streamConfig,
    logger: deps.logger,
  });
}

/**
 * Ensures a stream exists for the given subject via the optional auto-creator.
 *
 * Called before each `jetStream.subscribe()` to guarantee the target stream covers the subject.
 * When `autoCreator` is defined, delegates to its `ensureStreamExists` which checks for an
 * existing stream via `jsm.streams.find(subject)` and creates one if absent. When `autoCreator`
 * is `undefined` (auto-creation disabled), this is a no-op.
 *
 * @param autoCreator - The stream auto-creator instance, or `undefined` when auto-creation is disabled.
 * @param subject - The NATS subject that must be covered by a stream before subscription.
 * @see {@link docs/nats-jetstream-configuration.md#stream-auto-creation} for usage guide.
 */
export async function ensureStreamExists(autoCreator: StreamAutoCreator | undefined, subject: string): Promise<void> {
  if (autoCreator) {
    await autoCreator.ensureStreamExists(subject);
  }
}
