import { OutboxRepository, OutboxEntry, SaveOutboxEntryParams, EntityManagerLike } from './outbox.types';
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
  VALUES ($1, $2, $3, $4, 'pending', 0, NULL, $5, $6)
  ON CONFLICT (id) DO NOTHING
`;

const SELECT_PENDING_SQL = `
  SELECT * FROM outbox WHERE status = 'pending' ORDER BY created_at ASC LIMIT $1
`;

const UPDATE_SENT_SQL = `
  UPDATE outbox SET status = 'sent', updated_at = $2 WHERE id = $1
`;

const UPDATE_FAILED_SQL = `
  UPDATE outbox SET status = 'failed', attempts = attempts + 1, last_error = $2, updated_at = $3 WHERE id = $1
`;

export class PostgresOutboxRepository implements OutboxRepository {
  private tableEnsured = false;

  constructor(private readonly entityManager: EntityManagerLike) {}

  private async ensureTable(): Promise<void> {
    if (this.tableEnsured) {
      return;
    }
    await this.entityManager.query(CREATE_TABLE_SQL);
    this.tableEnsured = true;
  }

  async save(params: SaveOutboxEntryParams): Promise<void> {
    await this.ensureTable();
    const timestamp = nowIso();
    await this.entityManager.query(INSERT_SQL, [
      params.event.id,
      JSON.stringify(params.event),
      params.subject,
      params.metadata != null ? JSON.stringify(params.metadata) : null,
      timestamp,
      timestamp,
    ]);
  }

  async getPending(limit = 100): Promise<OutboxEntry[]> {
    await this.ensureTable();
    const rows = await this.entityManager.query(SELECT_PENDING_SQL, [limit]);
    return (rows as Array<Record<string, unknown>>).map(this.mapRowToEntry);
  }

  async markAsSent(id: string): Promise<void> {
    await this.entityManager.query(UPDATE_SENT_SQL, [id, nowIso()]);
  }

  async markAsFailed(id: string, error: string): Promise<void> {
    await this.entityManager.query(UPDATE_FAILED_SQL, [id, error, nowIso()]);
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