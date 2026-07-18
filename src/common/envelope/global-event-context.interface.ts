import { BaseEventContext } from './base-event-context.interface';

/**
 * Context metadata for tenant-less (global) events.
 *
 * Extends {@link BaseEventContext} without adding `companyId`. Used by
 * global producers and the global event factory.
 *
 * @see BaseEventContext
 * @see EventContext
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GlobalEventContext extends BaseEventContext {}
