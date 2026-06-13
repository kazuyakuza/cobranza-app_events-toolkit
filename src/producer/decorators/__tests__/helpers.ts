import { of } from 'rxjs';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { EventContext } from '../../../common/envelope/event-context.interface';
import { ActorType } from '../../../common/envelope/actor-type.enum';

export const sampleContext: EventContext = {
  type: 'payment.proof.uploaded',
  version: '1.0.0',
  producer: 'payment-service',
  companyId: '550e8400-e29b-41d4-a716-446655440000',
  actorType: ActorType.CLIENT,
  actorId: 'user-123',
  correlationId: '660e8400-e29b-41d4-a716-446655440001',
};

export function createMockExecutionContext(
  handler: (...args: unknown[]) => unknown,
  args: unknown[],
): ExecutionContext {
  return {
    getHandler: () => handler,
    getArgs: () => args,
    switchToHttp: jest.fn(),
    switchToRpc: jest.fn(),
    getType: jest.fn(),
    getClass: jest.fn(),
  } as unknown as ExecutionContext;
}

export function createMockCallHandler(returnValue: unknown): CallHandler {
  return {
    handle: () => of(returnValue),
  } as CallHandler;
}
