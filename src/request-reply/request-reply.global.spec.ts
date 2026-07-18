import { GlobalEventEnvelope } from '../common/envelope/global-event-envelope.class';
import { GlobalEventContext } from '../common/envelope/global-event-context.interface';
import { ActorType } from '../common/envelope/actor-type.enum';
import { buildGlobalEnvelope } from './request-reply.helpers';

describe('RequestReplyService — global events', () => {
  describe('buildGlobalEnvelope helper', () => {
    it('returns a GlobalEventEnvelope with mapped fields', () => {
      const context: GlobalEventContext = {
        type: 'iam.company.created',
        version: '1.0.0',
        producer: 'iam-service',
        actorType: ActorType.SYSTEM,
        correlationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
        replyTo: 'global.response.queue',
      };
      const payload = { name: 'Acme Corp' };
      const envelope = buildGlobalEnvelope(context, payload);

      expect(envelope).toBeInstanceOf(GlobalEventEnvelope);
      expect(envelope.type).toBe('iam.company.created');
      expect(envelope.version).toBe('1.0.0');
      expect(envelope.producer).toBe('iam-service');
      expect(envelope.actor_type).toBe(ActorType.SYSTEM);
      expect(envelope.correlation_id).toBe('7c9e6679-7425-40de-944b-e07fc1f90ae7');
      expect(envelope.reply_to).toBe('global.response.queue');
      expect(envelope.data).toEqual(payload);
      expect('company_id' in envelope).toBe(false);
    });

    it('auto-fills id with evt_ prefix', () => {
      const context: GlobalEventContext = {
        type: 'iam.company.created',
        version: '1.0.0',
        producer: 'iam-service',
        actorType: ActorType.SYSTEM,
        correlationId: '7c9e6679-7425-40de-944b-e07fc1f90ae7',
      };
      const envelope = buildGlobalEnvelope(context, {});
      expect(envelope.id).toMatch(/^evt_/);
    });
  });

  describe('buildResponseEnvelope with global context', () => {
    it('preserves correlation and causation from request event', () => {
      const requestEnvelope = new GlobalEventEnvelope({
        id: 'evt_request-001',
        type: 'iam.company.created',
        version: '1.0.0',
        produced_at: '2026-06-13T15:00:00.000Z',
        producer: 'iam-service',
        actor_type: ActorType.SYSTEM,
        correlation_id: 'corr-request-001',
        data: { name: 'Acme Corp' },
      });

      const responseContext: GlobalEventContext = {
        type: 'iam.company.created.response',
        version: '1.0.0',
        producer: 'iam-service',
        actorType: ActorType.SYSTEM,
        correlationId: 'ignored',
      };

      const preservedContext = {
        ...responseContext,
        correlationId: requestEnvelope.correlation_id,
        causationId: requestEnvelope.id,
      };
      const responseEnvelope = buildGlobalEnvelope(preservedContext, { success: true });

      expect(responseEnvelope.correlation_id).toBe('corr-request-001');
      expect(responseEnvelope.causation_id).toBe('evt_request-001');
    });
  });
});
