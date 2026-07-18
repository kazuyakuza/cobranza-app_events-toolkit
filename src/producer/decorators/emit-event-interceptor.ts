import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { EventContext } from '../../common/envelope/event-context.interface';
import { GlobalEventContext } from '../../common/envelope/global-event-context.interface';
import { EventScope } from '../../common/envelope/event-scope.enum';
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
  eventContext: EventContext | GlobalEventContext;
  data: unknown;
}

/** Parameter object for buildSubject to comply with the max-2-params rule. */
interface BuildSubjectInput {
  metadata: EmitEventMetadata;
  eventContext: EventContext | GlobalEventContext;
  scope: EventScope;
}

/**
 * NestJS interceptor that auto-publishes events for @EmitEvent() decorated methods.
 *
 * Reads the subject-building metadata stored by @EmitEvent(), builds the NATS subject
 * from the eventType and version, extracts EventContext from method arguments, and calls
 * ProducerService.emit() or ProducerService.emitGlobal() respectively.
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
   */
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.get<EmitEventMetadata>(EMIT_EVENT_METADATA, context.getHandler());
    if (!metadata) {
      return next.handle();
    }

    return next.handle().pipe(concatMap(async (data) => await this.handleEmission({ metadata, context, data })));
  }

  private async handleEmission(input: EmissionInput): Promise<unknown> {
    const scope = input.metadata.scope ?? EventScope.TENANT;
    const eventContext = this.findEventContext(input.context, scope);
    if (eventContext) {
      await this.emitEvent({ metadata: input.metadata, eventContext, data: input.data });
    }
    return input.data;
  }

  private findEventContext(
    context: ExecutionContext,
    scope?: EventScope,
  ): EventContext | GlobalEventContext | undefined {
    const args = context.getArgs();
    return args.find((arg): arg is EventContext | GlobalEventContext => this.isEventContext(arg, scope));
  }

  private isEventContext(arg: unknown, scope?: EventScope): arg is Record<string, unknown> {
    return this.isNonNullObject(arg) && this.hasRequiredContextFields(arg, scope);
  }

  private isNonNullObject(arg: unknown): arg is Record<string, unknown> {
    return typeof arg === 'object' && arg !== null;
  }

  private hasRequiredContextFields(arg: Record<string, unknown>, scope?: EventScope): boolean {
    if (scope === EventScope.GLOBAL) {
      return 'type' in arg;
    }
    return 'type' in arg && 'companyId' in arg;
  }

  private async emitEvent(input: EmitEventInput): Promise<void> {
    const scope = input.metadata.scope ?? EventScope.TENANT;
    const subject = this.buildSubject({ metadata: input.metadata, eventContext: input.eventContext, scope });
    if (scope === EventScope.GLOBAL) {
      await this.producerService.emitGlobal({
        subject,
        data: input.data,
        context: input.eventContext as GlobalEventContext,
      });
    } else {
      await this.producerService.emit({ subject, data: input.data, context: input.eventContext as EventContext });
    }
  }

  private buildSubject(input: BuildSubjectInput): string {
    if (input.scope === EventScope.GLOBAL) {
      return `global.${input.metadata.eventType}.v${input.metadata.version}`;
    }
    return `company.${(input.eventContext as EventContext).companyId}.${input.metadata.eventType}.v${input.metadata.version}`;
  }
}
