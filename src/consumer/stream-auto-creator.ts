import { DiscardPolicy, NatsConnection, RetentionPolicy, StorageType, StreamConfig } from 'nats';
import { EventLoggerService } from '../logging/event-logger.service';
import { buildStreamName, NO_STREAM_MATCHES_FRAGMENT, STREAM_NAME_INUSE_FRAGMENT } from './build-stream-name.util';

const CUSTOM_CONFIG_LOG_MESSAGE = 'Stream auto-creation with custom config overrides';
const REJECTED_CONFIG_LOG_MESSAGE = 'NATS server rejected stream config';

/** Dependencies required by {@link StreamAutoCreator}. */
export interface StreamAutoCreatorDeps {
  /** Active NATS connection used to access the JetStream manager. */
  connection: NatsConnection;
  /**
   * Optional overrides merged over the auto-creator's default JetStream stream config.
   *
   * Accepts `Partial<StreamConfig>` from the `nats` package. Any NATS-native stream
   * configuration field can be set — e.g. `max_bytes`, `max_msgs`, `num_replicas`,
   * `max_age`. User-supplied fields take precedence over built-in defaults.
   *
   * @see {@link docs/nats-jetstream-configuration.md} for examples and field reference.
   */
  streamConfig?: Partial<StreamConfig>;
  /**
   * Optional structured logger. When provided, custom overrides and server rejections
   * are logged at INFO/ERROR respectively for diagnostics.
   */
  logger?: EventLoggerService;
}

/**
 * Automatically creates JetStream streams for subjects that do not yet have one.
 *
 * When stream auto-creation is enabled via `consumer.autoCreateStreams`, the consumer
 * subsystem calls {@link ensureStreamExists} before subscribing to a subject. If no
 * stream matches the subject, a new stream is created with sensible defaults
 * (file storage, limits retention, unlimited consumers/messages).
 *
 * Supports config overrides via `streamConfig` in {@link StreamAutoCreatorDeps}: any
 * `Partial<StreamConfig>` fields supplied there are merged over the built-in defaults,
 * allowing consumers to set `max_bytes`, `max_msgs`, `num_replicas`, `max_age`, etc.
 * Custom overrides are INFO-logged before the stream is created.
 *
 * @see {@link docs/nats-jetstream-configuration.md} for full JetStream configuration guide.
 */
export class StreamAutoCreator {
  private readonly connection: NatsConnection;
  private readonly streamConfig?: Partial<StreamConfig>;
  private readonly logger?: EventLoggerService;

  constructor(deps: StreamAutoCreatorDeps) {
    this.connection = deps.connection;
    this.streamConfig = deps.streamConfig;
    this.logger = deps.logger;
  }

  /**
   * Ensures a JetStream stream exists for the given subject.
   *
   * If a stream already covers the subject the call is a no-op. Otherwise a new
   * stream is created with the name derived from the subject via `buildStreamName`.
   *
   * @param subject - NATS subject pattern (e.g. `company.>.payment.proof.uploaded.v1`).
   */
  async ensureStreamExists(subject: string): Promise<void> {
    const jsm = await this.connection.jetstreamManager();
    if (await this.streamExists(jsm, subject)) return;
    await this.createStream(jsm, subject);
  }

  private async streamExists(
    jsm: Awaited<ReturnType<NatsConnection['jetstreamManager']>>,
    subject: string,
  ): Promise<boolean> {
    try {
      await jsm.streams.find(subject);
      return true;
    } catch (error) {
      if (this.isNoStreamError(error)) return false;
      throw error;
    }
  }

  private async createStream(
    jsm: Awaited<ReturnType<NatsConnection['jetstreamManager']>>,
    subject: string,
  ): Promise<void> {
    const config = this.buildStreamConfig(subject);
    this.logCustomConfig(subject, config);
    try {
      await jsm.streams.add(config);
    } catch (error) {
      if (this.isStreamNameInUseError(error)) return;
      this.logRejectedConfig(subject, config, error);
      throw error;
    }
  }

  private logCustomConfig(subject: string, config: StreamConfig): void {
    if (this.shouldSkipCustomConfigLog()) return;
    this.logger!.logInfo(CUSTOM_CONFIG_LOG_MESSAGE, { subject, config });
  }

  private shouldSkipCustomConfigLog(): boolean {
    return !this.hasOverrides() || !this.logger;
  }

  private logRejectedConfig(subject: string, config: StreamConfig, error: unknown): void {
    if (!this.logger) return;
    const message = error instanceof Error ? error.message : String(error);
    this.logger.logError(REJECTED_CONFIG_LOG_MESSAGE, { subject, config, error: message });
  }

  private hasOverrides(): boolean {
    return Object.keys(this.streamConfig ?? {}).length > 0;
  }

  private buildStreamConfig(subject: string): StreamConfig {
    const config: StreamConfig = {
      ...this.defaultStreamFields(),
      name: buildStreamName(subject),
      subjects: [subject],
    };
    if (this.streamConfig) Object.assign(config, this.streamConfig);
    return config;
  }

  private defaultStreamFields(): Omit<StreamConfig, 'name' | 'subjects'> {
    return {
      retention: RetentionPolicy.Limits,
      storage: StorageType.File,
      max_consumers: -1,
      max_msgs: -1,
      max_bytes: -1,
      max_age: 0,
      max_msgs_per_subject: -1,
      max_msg_size: -1,
      discard: DiscardPolicy.Old,
      discard_new_per_subject: false,
      num_replicas: 1,
      sealed: false,
      first_seq: 0,
      duplicate_window: 0,
      allow_rollup_hdrs: false,
      deny_delete: false,
      deny_purge: false,
      allow_direct: false,
      mirror_direct: false,
    };
  }

  private isNoStreamError(error: unknown): boolean {
    return this.errorContainsFragment(error, NO_STREAM_MATCHES_FRAGMENT);
  }

  private isStreamNameInUseError(error: unknown): boolean {
    return this.errorContainsFragment(error, STREAM_NAME_INUSE_FRAGMENT);
  }

  private errorContainsFragment(error: unknown, fragment: string): boolean {
    return error instanceof Error && error.message.includes(fragment);
  }
}
