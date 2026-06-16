import { PostgresOutboxRepository } from './postgres-outbox.repository';
import { ActorType } from '../common/envelope/actor-type.enum';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { TypeormQueryRunnerContext, TransactionContext } from './transaction-context.interface';

function createTestEnvelope(id: string): EventEnvelope<unknown> {
  return new EventEnvelope<unknown>({
    id,
    type: 'test.created',
    version: '1.0.0',
    produced_at: new Date().toISOString(),
    producer: 'test-service',
    company_id: '00000000-0000-0000-0000-000000000001',
    actor_type: ActorType.SYSTEM,
    actor_id: 'actor-1',
    correlation_id: '00000000-0000-0000-0000-000000000002',
    data: { value: 'test' },
  });
}

describe('PostgresOutboxRepository - transaction context', () => {
  let entityManager: { query: jest.Mock };
  let repository: PostgresOutboxRepository;

  beforeEach(() => {
    entityManager = { query: jest.fn().mockResolvedValue(undefined) };
    repository = new PostgresOutboxRepository(entityManager);
  });

  it('uses queryRunner from transactionContext for INSERT when type is typeorm-query-runner', async () => {
    const queryRunner = { query: jest.fn().mockResolvedValue(undefined) };
    const context: TypeormQueryRunnerContext = { type: 'typeorm-query-runner', queryRunner };
    const envelope = createTestEnvelope('evt_txn_001');

    await repository.save({ event: envelope, subject: 'test.created', transactionContext: context });

    expect(queryRunner.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO outbox'), expect.any(Array));
    expect(entityManager.query).toHaveBeenCalledWith(expect.stringContaining('CREATE TABLE'));
    expect(entityManager.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO outbox'),
      expect.any(Array),
    );
  });

  it('uses entityManager for INSERT when no transactionContext is provided', async () => {
    const envelope = createTestEnvelope('evt_no_txn');

    await repository.save({ event: envelope, subject: 'test.created' });

    expect(entityManager.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO outbox'), expect.any(Array));
  });

  it('falls back to entityManager when transactionContext has an unknown type', async () => {
    const context: TransactionContext = { type: 'unknown-orm' };
    const envelope = createTestEnvelope('evt_unknown');

    await repository.save({ event: envelope, subject: 'test.created', transactionContext: context });

    expect(entityManager.query).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO outbox'), expect.any(Array));
  });

  it('uses entityManager for ensureTable even when transactionContext is provided', async () => {
    const queryRunner = { query: jest.fn().mockResolvedValue(undefined) };
    const context: TypeormQueryRunnerContext = { type: 'typeorm-query-runner', queryRunner };
    const envelope = createTestEnvelope('evt_ddl');

    await repository.save({ event: envelope, subject: 'test.created', transactionContext: context });

    const entityManagerCreateCalls = entityManager.query.mock.calls.filter((call: [string]) =>
      call[0].includes('CREATE TABLE'),
    );
    expect(entityManagerCreateCalls.length).toBeGreaterThanOrEqual(1);
    const queryRunnerCreateCalls = queryRunner.query.mock.calls.filter((call: [string]) =>
      call[0].includes('CREATE TABLE'),
    );
    expect(queryRunnerCreateCalls.length).toBe(0);
  });
});
