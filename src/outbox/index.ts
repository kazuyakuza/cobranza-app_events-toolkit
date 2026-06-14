/**
 * @packageDocumentation
 * Public API for the outbox module — transactional outbox pattern for reliable event publishing.
 */
export { OutboxModule } from './outbox.module';
export {
  OUTBOX_REPOSITORY_TOKEN,
  OutboxRepository,
  OutboxEntry,
  SaveOutboxEntryParams,
  OutboxModuleOptions,
  OutboxModuleAsyncOptions,
  EntityManagerLike,
} from './outbox.types';
export { SqliteOutboxRepository } from './sqlite-outbox.repository';
export { PostgresOutboxRepository } from './postgres-outbox.repository';
