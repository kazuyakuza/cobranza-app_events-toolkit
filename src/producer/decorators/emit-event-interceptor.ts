import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { EventContext } from '../../common/envelope/event-context.interface';
import { ProducerService } from '../producer.service';
import { EMIT_EVENT_METADATA, EmitEventMetadata } from './emit-event.decorator';

/** Internal bundle passed to handleEmission for post-handler event publishing. */
interface EmissionInput {
  metadata: EmitEventMetadata;
  context: ExecutionContext;
  data: unknown;
}

/** Internal bundle passed to emitEvent for subject building and publishing. */
interface EmitEventInput {
  metadata: EmitEventMetadata;
  eventContext: EventContext;
  data: unknown;
}

/**
 * NestJS interceptor that auto-publishes events for @EmitEvent() decorated methods.
 *
 * Reads the subject-building metadata stored by @EmitEvent(), builds the NATS subject
 * from the eventType and version, extracts EventContext from method arguments, and calls
 * ProducerService.emit() with the method's return value after successful execution.
 *
 * Must be bound via @UseInterceptors(EmitEventInterceptor) on controllers or methods.
 * Requires ProducerModule to be imported for ProducerService availability.
 */
@Injectable()
export class EmitEventInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly producerService: ProducerService,
  ) {}

  /**
   * Intercepts handler execution; if @EmitEvent() metadata is present,
   * auto-publishes the return value after successful completion.
   *
   * @param context - NestJS execution context for the current request.
   * @param next - Call handler providing the observable stream.
   * @returns Observable that resolves to the handler's return value.
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.get<EmitEventMetadata>(EMIT_EVENT_METADATA, context.getHandler());
    if (!metadata) {
      return next.handle();
    }

    return next.handle().pipe(concatMap(async (data) => await this.handleEmission({ metadata, context, data })));
  }

  private async handleEmission(input: EmissionInput): Promise<unknown> {
    const eventContext = this.findEventContext(input.context);
    if (eventContext) {
      await this.emitEvent({ metadata: input.metadata, eventContext, data: input.data });
    }
    return input.data;
  }

  private findEventContext(context: ExecutionContext): EventContext | undefined {
    const args = context.getArgs();
    return args.find((arg): arg is EventContext => this.isEventContext(arg));
  }

  private isEventContext(arg: unknown): arg is EventContext {
    return this.isNonNullObject(arg) && this.hasRequiredContextFields(arg);
  }

  private isNonNullObject(arg: unknown): arg is Record<string, unknown> {
    return typeof arg === 'object' && arg !== null;
  }

  private hasRequiredContextFields(arg: Record<string, unknown>): boolean {
    return 'companyId' in arg && 'type' in arg;
  }

  private async emitEvent(input: EmitEventInput): Promise<void> {
    const subject = this.buildSubject(input.metadata, input.eventContext);
    await this.producerService.emit({ subject, data: input.data, context: input.eventContext });
  }

  private buildSubject(metadata: EmitEventMetadata, eventContext: EventContext): string {
    return `company.${eventContext.companyId}.${metadata.eventType}.v${metadata.version}`;
  }
}
