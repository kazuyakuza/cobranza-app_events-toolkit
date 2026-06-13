import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { concatMap } from 'rxjs/operators';
import { BuildSubjectDto } from '../../common/dto/build-subject.dto';
import { SubjectBuilder } from '../../common/utils/subject.builder';
import { ProducerService, EventContext } from '../producer.service';
import { EMIT_EVENT_METADATA, EmitEventOptions } from './emit-event.decorator';

interface EmissionInput {
  options: EmitEventOptions;
  context: ExecutionContext;
  data: unknown;
}

interface EmitEventInput {
  options: EmitEventOptions;
  eventContext: EventContext;
  data: unknown;
}

/**
 * NestJS interceptor that auto-publishes events for @EmitEvent() decorated methods.
 *
 * Reads the subject-building metadata stored by @EmitEvent(), builds the NATS subject
 * using SubjectBuilder, extracts EventContext from method arguments, and calls
 * ProducerService.emit() with the method's return value after successful execution.
 *
 * Must be bound via @UseInterceptors(EmitEventInterceptor) on controllers or methods.
 * Requires ProducerModule to be imported for ProducerService availability.
 */
@Injectable()
export class EmitEventInterceptor implements NestInterceptor {
  private readonly subjectBuilder = new SubjectBuilder();

  constructor(
    private readonly reflector: Reflector,
    private readonly producerService: ProducerService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<EmitEventOptions>(EMIT_EVENT_METADATA, context.getHandler());
    if (!options) {
      return next.handle();
    }

    return next.handle().pipe(concatMap(async (data) => await this.handleEmission({ options, context, data })));
  }

  private async handleEmission(input: EmissionInput): Promise<unknown> {
    const eventContext = this.findEventContext(input.context);
    if (eventContext) {
      await this.emitEvent({ options: input.options, eventContext, data: input.data });
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
    const subject = this.buildSubject(input.options, input.eventContext);
    await this.producerService.emit({ subject, data: input.data, context: input.eventContext });
  }

  private buildSubject(options: EmitEventOptions, eventContext: EventContext): string {
    const dto = Object.assign(new BuildSubjectDto(), {
      companyId: eventContext.companyId,
      domain: options.domain,
      entity: options.entity,
      action: options.action,
      version: options.version ?? '1',
    });
    return this.subjectBuilder.build(dto);
  }
}
