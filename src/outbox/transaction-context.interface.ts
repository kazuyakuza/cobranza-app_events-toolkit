import { EntityManagerLike } from './outbox.types';

/** Base transaction context for outbox repository operations. */
export interface TransactionContext {
  /** Discriminator for the transaction context type. */
  readonly type: string;
}

/** Transaction context backed by a TypeORM QueryRunner. */
export interface TypeormQueryRunnerContext extends TransactionContext {
  readonly type: 'typeorm-query-runner';
  /** QueryRunner bound to an active TypeORM transaction. */
  readonly queryRunner: EntityManagerLike;
}
