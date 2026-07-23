import { AckPolicy, DeliverPolicy, ReplayPolicy } from 'nats';
import { ConsumerSubscribeOpts } from './subscribe-options.interface';

/**
 * Module-level JetStream consumer configuration threaded from
 * {@link EventsToolkitConsumerOptions} through the consumer DI chain and merged
 * with per-subscription options via {@link resolveSubscriptionConsumerOpts}.
 *
 * Use this interface to configure durable consumers, delivery policies, and
 * acknowledgment behavior at the module level (via `EventsToolkitModule.forRoot()`).
 * These settings apply to **all** subscriptions unless overridden per-subscription.
 *
 * **When to use:**
 * - Set `durableName` for production consumers to persist ack position across reconnects.
 * - Set `deliverPolicy` to control where a new consumer starts reading (e.g., `DeliverPolicy.Last`).
 * - Omit `deliverPolicy` when `durableName` is set — NATS will resume from the durable's stored state.
 *
 * **Precedence:** Convenience scalars (`durableName`, `deliverPolicy`, `ackPolicy`, `maxDeliver`,
 * `replayPolicy`) override matching fields from `consumerOpts` when both are set.
 *
 * @see {@link https://docs.nats.io/using-nats/developer/receiving/consumers NATS Consumer Configuration}
 * @see {@link https://docs.nats.io/using-nats/developer/receiving/durables NATS Durable Consumers}
 * @see {@link resolveSubscriptionConsumerOpts} for merge precedence rules.
 */
export interface ModuleConsumerOptions {
  /**
   * Full NATS-native consumer options. Accepts a `ConsumerOptsBuilder` (e.g.,
   * `consumerOpts().durable('x').deliverAll()`) or a plain `Partial<ConsumerOpts>`.
   *
   * When omitted, built-in defaults are applied by {@link resolveConsumerSubscribeOpts}:
   * manual ack, explicit ack policy, and an ephemeral inbox delivery subject.
   *
   * Convenience scalars below override matching fields from this object when both are set.
   */
  consumerOpts?: ConsumerSubscribeOpts;
  /**
   * Durable consumer name — enables server-side position persistence and resume.
   *
   * When set, NATS persists the consumer's last acknowledged position. On reconnect,
   * the consumer resumes from that position instead of replaying history. The same
   * `durable_name` must be used on every reconnect.
   *
   * @see {@link https://docs.nats.io/using-nats/developer/receiving/durables NATS Durable Consumers}
   */
  durableName?: string;
  /**
   * Where to start consuming when no durable state exists.
   *
   * Omit when `durableName` is set to use the durable's stored state automatically.
   * When set without `durableName`, controls the initial delivery position for ephemeral consumers.
   *
   * @see {@link https://docs.nats.io/using-nats/developer/receiving/consumers#deliverpolicy NATS DeliverPolicy}
   */
  deliverPolicy?: DeliverPolicy;
  /**
   * Acknowledgment policy for delivered messages.
   *
   * Default: `AckPolicy.Explicit` when omitted (applied by {@link resolveConsumerSubscribeOpts}).
   * Other options: `AckPolicy.All`, `AckPolicy.None`.
   *
   * @see {@link https://docs.nats.io/using-nats/developer/receiving/consumers#ackpolicy NATS AckPolicy}
   */
  ackPolicy?: AckPolicy;
  /**
   * Maximum number of delivery attempts before redelivery stops.
   *
   * Default: server-side value (typically unlimited) when omitted.
   * Set to a positive integer to limit retries for transient failures.
   *
   * @see {@link https://docs.nats.io/using-nats/developer/receiving/consumers#max_deliver NATS max_deliver}
   */
  maxDeliver?: number;
  /**
   * Replay policy controlling message delivery timing.
   *
   * - `ReplayPolicy.Instant` (default): deliver messages as fast as possible.
   * - `ReplayPolicy.Original`: replay messages at the original production rate.
   *
   * @see {@link https://docs.nats.io/using-nats/developer/receiving/consumers#replaypolicy NATS ReplayPolicy}
   */
  replayPolicy?: ReplayPolicy;
}
