/**
 * Regression tests ensuring the public API remains backward compatible
 * after introducing {@link GlobalEventEnvelope}.
 *
 * All existing public symbols must still be exported and usable.
 */
import { EventEnvelope, EventBase, ActorType, EventContext } from './common/envelope';
import { BuildSubjectDto } from './common/dto';
import { SubjectBuilder, buildSubject, buildDlqSubject, DLQ_SUBJECT_PREFIX } from './common/utils';
import { createEvent } from './common/utils/event.factory';
import { buildResponseSubject } from './common/utils/subject-parser';

describe('Backward compatibility regression', () => {
  it('EventEnvelope is still exported', () => {
    const envelope = new EventEnvelope({
      id: 'evt_test',
      type: 'test',
      version: '1',
      produced_at: '2026-01-01T00:00:00.000Z',
      producer: 'test',
      company_id: '550e8400-e29b-41d4-a716-446655440000',
      actor_type: ActorType.SYSTEM,
      correlation_id: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      data: {},
    });
    expect(envelope).toBeInstanceOf(EventEnvelope);
    expect(envelope.company_id).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('EventBase is still exported', () => {
    expect(EventBase).toBeDefined();
  });

  it('EventContext is still exported', () => {
    const ctx: EventContext = {
      type: 'test',
      version: '1',
      producer: 'test',
      companyId: '550e8400-e29b-41d4-a716-446655440000',
      actorType: ActorType.SYSTEM,
      correlationId: 'corr',
    };
    expect(ctx.companyId).toBe('550e8400-e29b-41d4-a716-446655440000');
  });

  it('ActorType is still exported', () => {
    expect(ActorType.SYSTEM).toBe('system');
  });

  it('createEvent is still exported', () => {
    const ctx: EventContext = {
      type: 'test',
      version: '1',
      producer: 'test',
      companyId: '550e8400-e29b-41d4-a716-446655440000',
      actorType: ActorType.SYSTEM,
      correlationId: 'corr',
    };
    const event = createEvent({ data: 1 }, ctx);
    expect(event).toBeInstanceOf(EventEnvelope);
  });

  it('buildSubject is still exported', () => {
    const dto = new BuildSubjectDto();
    dto.companyId = '550e8400-e29b-41d4-a716-446655440000';
    dto.domain = 'test';
    dto.entity = 'test';
    dto.action = 'test';
    const subject = buildSubject(dto);
    expect(subject).toContain('company.');
  });

  it('BuildSubjectDto is still exported', () => {
    expect(BuildSubjectDto).toBeDefined();
  });

  it('SubjectBuilder is still exported', () => {
    expect(SubjectBuilder).toBeDefined();
  });

  it('buildResponseSubject is still exported', () => {
    const result = buildResponseSubject('company.aaaaaaaa00000000bbbbbbbbcccccccc.domain.entity.action.v1');
    expect(result).toContain('.response.');
  });

  it('buildDlqSubject is still exported', () => {
    expect(buildDlqSubject('test.subject')).toBe('dlq.test.subject');
  });

  it('DLQ_SUBJECT_PREFIX is still exported', () => {
    expect(DLQ_SUBJECT_PREFIX).toBe('dlq.');
  });
});
