import { JsMsg } from 'nats';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { EventEnvelope } from '../common/envelope/event-envelope.class';
import { GlobalEventEnvelope } from '../common/envelope/global-event-envelope.class';
import { AnyEventEnvelope } from '../common/envelope/envelope-types';
import { EventConsumerException } from '../common/errors/event-consumer.exception';
import { isGlobalSubject } from '../common/utils/subject.builder';
import { ValidationErrorOptions } from './subscribe-options.interface';

/**
 * Shared validation utilities for JetStream message processing.
 *
 * Centralizes the duplicated parse/validate/exception logic that was
 * previously inlined in both {@link JetStreamConsumerService} and
 * {@link RequestReplyMessageProcessor}.
 */
export class EnvelopeValidationUtil {
  /**
   * Parses a JetStream message's binary data into a plain JSON object.
   *
   * @param msg - The incoming JetStream message.
   * @returns A plain object representation of the message data.
   * @throws EventConsumerException if the payload is not valid JSON.
   */
  private static createParseException(message: string): EventConsumerException {
    return new EventConsumerException({
      message,
      eventId: 'unknown',
      eventType: 'unknown',
    });
  }

  static parseMessageData(msg: JsMsg): Record<string, unknown> {
    const text = new TextDecoder().decode(msg.data);
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      throw this.createParseException('Message payload is not valid JSON');
    }
    if (this.isInvalidEventPayload(parsed)) {
      throw this.createParseException('Message payload is not a valid JSON object');
    }
    return parsed as Record<string, unknown>;
  }

  /**
   * Validates a plain object against the appropriate envelope class
   * based on the NATS subject prefix.
   *
   * @param plain - The parsed message data as a plain object.
   * @param subject - The NATS subject the message was received on.
   * @returns A validated event envelope instance (tenant or global).
   * @throws EventConsumerException if validation fails.
   */
  static validateEnvelope(plain: Record<string, unknown>, subject: string): AnyEventEnvelope<unknown> {
    const cls = this.pickEnvelopeClass(subject);
    const envelope = plainToInstance(cls, plain);
    const errors = validateSync(envelope);
    if (errors.length > 0) {
      throw this.createValidationException({ errors, subject, plain });
    }
    return envelope as AnyEventEnvelope<unknown>;
  }

  /**
   * Creates an {@link EventConsumerException} from class-validator errors.
   */
  static createValidationException(options: ValidationErrorOptions): EventConsumerException {
    const { errors, subject, plain } = options;
    const eventId = typeof plain.id === 'string' ? plain.id : 'unknown';
    const eventType = typeof plain.type === 'string' ? plain.type : 'unknown';
    const correlationId = typeof plain.correlation_id === 'string' ? plain.correlation_id : undefined;
    const messages = errors.map((e) => Object.values(e.constraints ?? {}).join('; ')).join(', ');
    return new EventConsumerException({
      message: `Event validation failed on subject ${subject}: ${messages}`,
      eventId,
      eventType,
      correlationId,
      cause: new Error(JSON.stringify(errors)),
    });
  }

  private static pickEnvelopeClass(subject: string): typeof EventEnvelope | typeof GlobalEventEnvelope {
    return isGlobalSubject(subject) ? GlobalEventEnvelope : EventEnvelope;
  }

  private static isInvalidEventPayload(parsed: unknown): boolean {
    return typeof parsed !== 'object' || parsed === null || Array.isArray(parsed);
  }
}
