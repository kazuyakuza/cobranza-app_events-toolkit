import { IsUUID } from 'class-validator';
import { BaseEventEnvelope } from './base-event-envelope.class';

/**
 * Tenant-scoped event envelope — adds the mandatory {@link company_id} for tenant isolation.
 *
 * @typeParam T - The domain-specific business payload type.
 * @see BaseEventEnvelope
 * @see GlobalEventEnvelope
 */
export class EventEnvelope<T = Record<string, unknown>> extends BaseEventEnvelope<T> {
  /**
   * Company UUID with dashes — mandatory for tenant isolation.
   * Format: `550e8400-e29b-41d4-a716-446655440000`
   */
  @IsUUID('4')
  company_id!: string;

  /**
   * Constructs an EventEnvelope with optional partial field initialization.
   *
   * @param properties - Partial envelope fields to initialize.
   *                     Useful for factory functions and plain-to-instance transformation.
   */
  constructor(properties?: Partial<EventEnvelope<T>>) {
    super(properties);
  }
}
