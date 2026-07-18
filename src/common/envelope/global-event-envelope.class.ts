import { BaseEventEnvelope } from './base-event-envelope.class';

/**
 * Event envelope for tenant-less (global) operations such as creating
 * cross-tenant entities (`company`, `user`, `role`) or system-wide
 * configuration changes.
 *
 * Extends {@link BaseEventEnvelope} and adds no `company_id` field;
 * consumers subscribing to `global.**` subjects are responsible for
 * their own authorization.
 *
 * @typeParam T - The domain-specific business payload type.
 *
 * @see docs/global-events.md (created in Task 3)
 * @see EventEnvelope for the tenant-scoped counterpart.
 */
export class GlobalEventEnvelope<T = Record<string, unknown>> extends BaseEventEnvelope<T> {
  /**
   * Constructs a GlobalEventEnvelope with optional partial field initialization.
   *
   * @param properties - Partial envelope fields to initialize.
   *                     Useful for factory functions and plain-to-instance transformation.
   */
  constructor(properties?: Partial<GlobalEventEnvelope<T>>) {
    super(properties);
  }
}
