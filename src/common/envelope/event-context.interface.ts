import { BaseEventContext } from './base-event-context.interface';

/**
 * Context metadata for tenant-scoped events. Adds the mandatory `companyId`.
 *
 * @see BaseEventContext
 * @see GlobalEventContext
 * @see docs/event-messaging-convention.md — Section 3 (Event Envelope)
 */
export interface EventContext extends BaseEventContext {
  /**
   * Company UUID with dashes — mandatory for tenant isolation.
   * Format: `550e8400-e29b-41d4-a716-446655440000`
   */
  companyId: string;
}
