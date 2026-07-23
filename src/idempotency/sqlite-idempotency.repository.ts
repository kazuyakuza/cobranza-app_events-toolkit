import Database from 'better-sqlite3';
import { IdempotencyRepository } from './idempotency.types';
import { nowIso } from '../common/utils/date.utils';
import { computeExpiry } from './compute-expiry.util';

const CREATE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS idempotency_keys (
    key TEXT PRIMARY KEY,
    created_at TEXT NOT NULL,
    expires_at TEXT
  )
`;

const INSERT_SQL = `
  INSERT OR IGNORE INTO idempotency_keys (key, created_at, expires_at)
  VALUES (?, ?, ?)
`;

const SELECT_EXISTS_SQL = `
  SELECT 1 FROM idempotency_keys
  WHERE key = ? AND (expires_at IS NULL OR expires_at >= ?)
  LIMIT 1
`;

const DELETE_EXPIRED_SQL = `
  DELETE FROM idempotency_keys
  WHERE expires_at IS NOT NULL AND expires_at < ?
`;

/**
 * SQLite-backed {@link IdempotencyRepository} using `better-sqlite3`.
 *
 * Creates the idempotency_keys table on construction and enables WAL
 * journaling. Uses `INSERT OR IGNORE` for idempotent inserts.
 */
export class SqliteIdempotencyRepository implements IdempotencyRepository {
  private readonly database: Database.Database;

  constructor(dbPath: string) {
    this.database = new Database(dbPath);
    this.database.pragma('journal_mode = WAL');
    this.database.exec(CREATE_TABLE_SQL);
  }

  /** @inheritdoc */
  async isProcessed(key: string): Promise<boolean> {
    const row = this.database.prepare(SELECT_EXISTS_SQL).get(key, nowIso());
    return row !== undefined;
  }

  /** @inheritdoc */
  async markAsProcessed(key: string, ttlSeconds?: number): Promise<void> {
    const expiresAt = ttlSeconds == null ? null : computeExpiry(ttlSeconds);
    this.database.prepare(INSERT_SQL).run(key, nowIso(), expiresAt);
  }

  /** @inheritdoc */
  async clearExpired(): Promise<void> {
    this.database.prepare(DELETE_EXPIRED_SQL).run(nowIso());
  }
}
