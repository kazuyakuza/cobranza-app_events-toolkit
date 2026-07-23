import { AckPolicy, DeliverPolicy, ReplayPolicy } from 'nats';
import { ConsumerSubscribeOpts } from './subscribe-options.interface';

/**
 * Gateway-level JetStream consumer configuration threaded from
 * {@link EventsToolkitConsumerOptions} through the consumer DI chain and merged
 * with per-subscription options via {@link resolveSubscriptionConsumerOpts}.
 *
 * Convenience scalars (durableName, deliverPolicy, ackPolicy, maxDeliver,
 * replayPolicy) override matching fields from `consumerOpts` when both are set.
 */
export interface GatewayConsumerOptions {
  /** Full NATS-native consumer options (builder or partial config). */
  consumerOpts?: ConsumerSubscribeOpts;
  /** Durable consumer name — enables server-side position persistence and resume. */
  durableName?: string;
  /** Where to start consuming. Omit when `durableName` is set to use the durable's stored state. */
  deliverPolicy?: DeliverPolicy;
  /** Acknowledgment policy. Default `AckPolicy.Explicit` when omitted. */
  ackPolicy?: AckPolicy;
  /** Max delivery attempts before redelivery stops. Default server value when omitted. */
  maxDeliver?: number;
  /** Replay policy (Instant | Original). */
  replayPolicy?: ReplayPolicy;
}
