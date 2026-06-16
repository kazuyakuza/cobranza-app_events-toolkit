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
export { OutboxService } from './outbox.service';
export { OutboxServiceDeps, OUTBOX_SERVICE_DEPS_TOKEN } from './outbox-service-deps.interface';
export { OutboxServiceOptions, OUTBOX_SERVICE_OPTIONS_TOKEN } from './outbox-service-options.interface';
export { OutboxRequestReplyException, OutboxRequestReplyExceptionOptions } from './outbox-request-reply.exception';
export { TransactionContext, TypeormQueryRunnerContext } from './transaction-context.interface';
export { SaveInTransactionParams } from './save-in-transaction-params.interface';
