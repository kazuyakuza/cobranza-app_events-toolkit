/**
 * Regression tests ensuring the new global-event API symbols are exported
 * after introducing {@link GlobalEventEnvelope}.
 */
import {
  GlobalEventEnvelope,
  GlobalEventBase,
  GlobalEventContext,
  EventScope,
  AnyEventEnvelope,
  AnyEventContext,
  isGlobalEnvelope,
  isGlobalContext,
  BaseEventEnvelope,
} from './common/envelope';
import { BuildGlobalSubjectDto } from './common/dto';
import { buildGlobalSubject, isGlobalSubject, buildGlobalResponseSubject } from './common/utils';
import { createGlobalEvent } from './common/utils/event.factory';
import { ActorType } from './common/envelope/actor-type.enum';

describe('Global API regression', () => {
  it('new GlobalEventEnvelope is exported', () => {
    const envelope = new GlobalEventEnvelope({
      id: 'evt_test',
      type: 'test',
      version: '1',
      produced_at: '2026-01-01T00:00:00.000Z',
      producer: 'test',
      actor_type: ActorType.SYSTEM,
      correlation_id: 'corr',
      data: {},
    });
    expect(envelope).toBeInstanceOf(GlobalEventEnvelope);
  });

  it('GlobalEventContext is exported', () => {
    const ctx: GlobalEventContext = {
      type: 'test',
      version: '1',
      producer: 'test',
      actorType: ActorType.SYSTEM,
      correlationId: 'corr',
    };
    expect(ctx.type).toBe('test');
  });

  it('GlobalEventBase is exported', () => {
    expect(GlobalEventBase).toBeDefined();
  });

  it('BaseEventEnvelope is exported', () => {
    expect(BaseEventEnvelope).toBeDefined();
  });

  it('EventScope is exported', () => {
    expect(EventScope.GLOBAL).toBe('global');
    expect(EventScope.TENANT).toBe('tenant');
  });

  it('AnyEventEnvelope and AnyEventContext types are exported', () => {
    const envelope: AnyEventEnvelope = new GlobalEventEnvelope();
    expect(envelope).toBeDefined();
    const context: AnyEventContext = {
      type: 'test',
      version: '1',
      producer: 'test',
      actorType: ActorType.SYSTEM,
      correlationId: 'corr',
    };
    expect(context).toBeDefined();
  });

  it('isGlobalEnvelope and isGlobalContext guards are exported', () => {
    expect(typeof isGlobalEnvelope).toBe('function');
    expect(typeof isGlobalContext).toBe('function');
  });

  it('BuildGlobalSubjectDto is exported', () => {
    expect(BuildGlobalSubjectDto).toBeDefined();
  });

  it('buildGlobalSubject and isGlobalSubject are exported', () => {
    const dto = new BuildGlobalSubjectDto();
    dto.domain = 'test';
    dto.entity = 'test';
    dto.action = 'test';
    expect(buildGlobalSubject(dto)).toContain('global.');
    expect(isGlobalSubject('global.test.v1')).toBe(true);
  });

  it('buildGlobalResponseSubject is exported', () => {
    expect(buildGlobalResponseSubject('global.test.test.test.v1')).toContain('.response.');
  });

  it('createGlobalEvent is exported', () => {
    const ctx: GlobalEventContext = {
      type: 'test',
      version: '1',
      producer: 'test',
      actorType: ActorType.SYSTEM,
      correlationId: 'corr',
    };
    const event = createGlobalEvent({ data: 1 }, ctx);
    expect(event).toBeInstanceOf(GlobalEventEnvelope);
  });
});
