import { DiscardPolicy, NatsConnection, RetentionPolicy, StorageType, StreamConfig } from 'nats';
import { buildStreamName, NO_STREAM_MATCHES_FRAGMENT, STREAM_NAME_INUSE_FRAGMENT } from './build-stream-name.util';

export interface StreamAutoCreatorDeps {
  connection: NatsConnection;
}

export class StreamAutoCreator {
  private readonly connection: NatsConnection;

  constructor(deps: StreamAutoCreatorDeps) {
    this.connection = deps.connection;
  }

  async ensureStreamExists(subject: string): Promise<void> {
    const jsm = await this.connection.jetstreamManager();
    if (await this.streamExists(jsm, subject)) return;
    await this.createStream(jsm, subject);
  }

  private buildStreamName(subject: string): string {
    return buildStreamName(subject);
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
    try {
      await jsm.streams.add(this.buildStreamConfig(subject));
    } catch (error) {
      if (this.isStreamNameInUseError(error)) return;
      throw error;
    }
  }

  private buildStreamConfig(subject: string): StreamConfig {
    return {
      name: this.buildStreamName(subject),
      subjects: [subject],
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
