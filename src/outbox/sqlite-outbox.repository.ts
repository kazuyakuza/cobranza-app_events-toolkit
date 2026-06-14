import Database from 'better-sqlite3';
import { OutboxRepository, OutboxEntry, SaveOutboxEntryParams } from './outbox.types';
import { nowIso } from '../common/utils/date.utils';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS outbox (
    id TEXT PRIMARY KEY,
    event_data TEXT NOT NULL,
    subject TEXT NOT NULL,
    metadata TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    last_error TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )
`;

const INSERT_SQL = `
  INSERT INTO outbox (id, event_data, subject, metadata, status, attempts, last_error, created_at, updated_at)
  VALUES (@id, @event_data, @subject, @metadata, 'pending', 0, NULL, @created_at, @updated_at)
`;

const SELECT_PENDING_SQL = `
  SELECT * FROM outbox WHERE status = 'pending' ORDER BY created_at ASC LIMIT ?
`;

const UPDATE_SENT_SQL = `
  UPDATE outbox SET status = 'sent', updated_at = @updated_at WHERE id = @id
`;

const UPDATE_FAILED_SQL = `
  UPDATE outbox
  SET status = 'failed', attempts = attempts + 1, last_error = @last_error, updated_at = @updated_at
  WHERE id = @id
`;

export class SqliteOutboxRepository implements OutboxRepository {
  private readonly database: Database.Database;

  constructor(dbPath: string) {
    this.database = new Database(dbPath);
    this.database.pragma('journal_mode = WAL');
    this.database.exec(CREATE_TABLE_SQL);
  }

  async save(params: SaveOutboxEntryParams): Promise<void> {
    const timestamp = nowIso();
    this.database.prepare(INSERT_SQL).run({
      id: params.event.id,
      event_data: JSON.stringify(params.event),
      subject: params.subject,
      metadata: this.serializeMetadata(params.metadata),
      created_at: timestamp,
      updated_at: timestamp,
    });
  }

  async getPending(limit = 100): Promise<OutboxEntry[]> {
    const rows = this.database.prepare(SELECT_PENDING_SQL).all(limit);
    return (rows as Array<Record<string, unknown>>).map(this.mapRowToEntry);
  }

  async markAsSent(id: string): Promise<void> {
    this.database.prepare(UPDATE_SENT_SQL).run({ id, updated_at: nowIso() });
  }

  async markAsFailed(id: string, error: string): Promise<void> {
    this.database.prepare(UPDATE_FAILED_SQL).run({ id, last_error: error, updated_at: nowIso() });
  }

  private serializeMetadata(metadata: unknown): string | null {
    return metadata != null ? JSON.stringify(metadata) : null;
  }

  private mapRowToEntry(row: Record<string, unknown>): OutboxEntry {
    return {
      id: row.id as string,
      eventData: row.event_data as string,
      subject: row.subject as string,
      metadata: row.metadata as string | null,
      status: row.status as OutboxEntry['status'],
      attempts: row.attempts as number,
      lastError: row.last_error as string | null,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
    };
  }
}