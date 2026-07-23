import { IdempotencyRepository } from './idempotency.types';
import { EntityManagerLike } from '../outbox/outbox.types';
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
  INSERT INTO idempotency_keys (key, created_at, expires_at)
  VALUES ($1, $2, $3)
  ON CONFLICT (key) DO NOTHING
`;

const SELECT_EXISTS_SQL = `
  SELECT 1 FROM idempotency_keys
  WHERE key = $1 AND (expires_at IS NULL OR expires_at >= $2)
  LIMIT 1
`;

const DELETE_EXPIRED_SQL = `
  DELETE FROM idempotency_keys
  WHERE expires_at IS NOT NULL AND expires_at < $1
`;

/**
 * PostgreSQL-backed {@link IdempotencyRepository} using a TypeORM-compatible
 * {@link EntityManagerLike}.
 *
 * Defers table creation until the first query and caches the result to avoid
 * repeated DDL execution. Uses `ON CONFLICT (key) DO NOTHING` for idempotent inserts.
 */
export class PostgresIdempotencyRepository implements IdempotencyRepository {
  private tableEnsured = false;

  constructor(private readonly entityManager: EntityManagerLike) {}

  /** @inheritdoc */
  async isProcessed(key: string): Promise<boolean> {
    await this.ensureTable();
    const rows = await this.entityManager.query(SELECT_EXISTS_SQL, [key, nowIso()]);
    return Array.isArray(rows) && rows.length > 0;
  }

  /** @inheritdoc */
  async markAsProcessed(key: string, ttlSeconds?: number): Promise<void> {
    await this.ensureTable();
    const expiresAt = ttlSeconds == null ? null : computeExpiry(ttlSeconds);
    await this.entityManager.query(INSERT_SQL, [key, nowIso(), expiresAt]);
  }

  /** @inheritdoc */
  async clearExpired(): Promise<void> {
    await this.ensureTable();
    await this.entityManager.query(DELETE_EXPIRED_SQL, [nowIso()]);
  }

  private async ensureTable(): Promise<void> {
    if (this.tableEnsured) {
      return;
    }
    await this.entityManager.query(CREATE_TABLE_SQL);
    this.tableEnsured = true;
  }
}
