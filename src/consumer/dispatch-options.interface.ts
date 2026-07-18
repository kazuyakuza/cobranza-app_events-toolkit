import { AnyEventEnvelope, AnyEventContext } from '../common/envelope/envelope-types';

/** Options for {@link ConsumerService.dispatch}. */
export interface DispatchOptions {
  /** Exact NATS subject of the incoming message. */
  subject: string;
  /** Deserialized and validated event envelope (tenant or global). */
  event: AnyEventEnvelope<unknown>;
  /** Metadata context extracted from the event envelope. */
  context: AnyEventContext;
}
