import { NatsConnection, RetentionPolicy, StorageType, StreamConfig } from 'nats';

export interface StreamAutoCreatorDeps {
  connection: NatsConnection;
}

const STREAM_NAME_INUSE_FRAGMENT = 'stream name already in use';
const NO_STREAM_MATCHES_FRAGMENT = 'no stream matches subject';
const STREAM_NAME_PREFIX = 'auto-';

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

  buildStreamName(subject: string): string {
    const sanitized = subject.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    return `${STREAM_NAME_PREFIX}${sanitized}`;
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
      max_msgs: -1,
      max_bytes: -1,
      max_age: 0,
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
