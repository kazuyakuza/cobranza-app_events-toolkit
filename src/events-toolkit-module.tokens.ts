import { JetStreamClient, NatsConnection } from 'nats';

/** Injection token for the resolved EventsToolkitModule options object. */
export const EVENTS_TOOLKIT_OPTIONS = 'EVENTS_TOOLKIT_OPTIONS';

/** Internal token that carries the single resolved NATS connection + jetStream + owned flag. */
export const RESOLVED_NATS_TOKEN = 'EVENTS_TOOLKIT_RESOLVED_NATS';

/** Resolved NATS connection pair used to derive jetStream and NatsConnection providers. */
export interface ResolvedNats {
  connection: NatsConnection;
  jetStream: JetStreamClient;
  owned: boolean;
}
