import { GlobalEventEnvelope } from '../common/envelope/global-event-envelope.class';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { GlobalEventContext } from '../common/envelope/global-event-context.interface';
import { ActorType } from '../common/envelope/actor-type.enum';
import { buildGlobalEnvelope, buildEnvelope } from './request-reply.helpers';

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

  describe('sendRequest with global context', () => {
    it('buildGlobalEnvelope is callable with a GlobalEventContext and payload', () => {
      const context: GlobalEventContext = {
        type: 'iam.company.created',
        version: '1.0.0',
        producer: 'iam-service',
        actorType: ActorType.SYSTEM,
        correlationId: '770e8400-e29b-41d4-a716-446655440002',
        replyTo: 'global.response.queue',
      };
      const envelope = buildGlobalEnvelope(context, { name: 'Acme' });
      expect(envelope).toBeInstanceOf(GlobalEventEnvelope);
      expect(envelope.reply_to).toBe('global.response.queue');
      expect(envelope.type).toBe('iam.company.created');
    });
  });

  describe('buildEnvelope with tenant context (backward compat)', () => {
    it('still produces an EventEnvelope with company_id', () => {
      const context = {
        type: 'payment.proof.uploaded',
        version: '1.0.0',
        producer: 'payment-service',
        companyId: '550e8400-e29b-41d4-a716-446655440000',
        actorType: ActorType.CLIENT,
        actorId: 'user-123',
        correlationId: '660e8400-e29b-41d4-a716-446655440001',
      };
      const envelope = buildEnvelope(context, { amount: 100 });
      expect(envelope).toBeInstanceOf(EventEnvelope);
      expect(envelope.company_id).toBe('550e8400-e29b-41d4-a716-446655440000');
    });
  });
});
