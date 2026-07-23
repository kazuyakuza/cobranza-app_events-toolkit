import type { NatsConnection, StreamConfig } from 'nats';
import { EventLoggerService } from '../logging/event-logger.service';
import { StreamAutoCreator } from './stream-auto-creator';

/**
 * Creates a {@link StreamAutoCreator} when auto-creation is enabled and a connection is available.
 *
 * @returns A configured {@link StreamAutoCreator} or `undefined` when auto-creation is disabled.
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
 * When `autoCreator` is defined, delegates to its `ensureStreamExists`; otherwise a no-op.
 */
export async function ensureStreamExists(autoCreator: StreamAutoCreator | undefined, subject: string): Promise<void> {
  if (autoCreator) {
    await autoCreator.ensureStreamExists(subject);
  }
}
