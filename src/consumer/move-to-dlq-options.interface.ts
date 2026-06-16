import { JsMsg } from 'nats';

/** Options for manually routing a message to the Dead Letter Queue. */
export interface MoveToDlqOptions {
  /** JetStream message to route to the DLQ. */
  message: JsMsg;
  /** Human-readable reason for moving the message to the DLQ. */
  reason: string;
  /** Original NATS subject the message was consumed from. Defaults to `message.subject`. */
  subject?: string;
  /** Original payload of the message. If not provided, an empty object is used. */
  originalPayload?: Record<string, unknown>;
}
