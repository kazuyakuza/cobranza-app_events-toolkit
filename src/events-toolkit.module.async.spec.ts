import { DynamicModule } from '@nestjs/common';
import { EventsToolkitModule } from './events-toolkit.module';
import { JETSTREAM_TOKEN } from './producer/producer.constants';
import { EventLoggerService } from './logging/event-logger.service';
import { RequestReplyService } from './request-reply/request-reply.service';
import { REQUEST_REPLY_DEPS_TOKEN } from './request-reply/request-reply.types';

const forRootAsyncOptions = {
  useFactory: async () => ({ nats: { servers: ['nats://localhost:4222'] } }),
};

function getModuleName(imported: unknown): string | undefined {
  const dynamicModule = imported as DynamicModule | undefined;
  return dynamicModule?.module?.name;
}

function findProvider(providers: Provider[] | undefined, token: unknown): Provider | undefined {
  return providers?.find((p) => p === token || ('provide' in p && p.provide === token));
}

type Provider = Record<string, unknown>;

describe('EventsToolkitModule', () => {
  describe('forRootAsync', () => {
    it('should import sub-modules globally and export toolkit-level tokens', () => {
      const module = EventsToolkitModule.forRootAsync(forRootAsyncOptions);
      const importNames = (module.imports ?? []).map(getModuleName);
      expect(importNames).toContain('ProducerModule');
      expect(importNames).toContain('ConsumerModule');
      expect(importNames).toContain('OutboxModule');
      expect(module.exports).toContain('EVENTS_TOOLKIT_OPTIONS');
      expect(module.exports).toContain(JETSTREAM_TOKEN);
      expect(module.exports).toContain(EventLoggerService);
      expect(module.exports).toContain(RequestReplyService);
      expect(module.exports).toContain(REQUEST_REPLY_DEPS_TOKEN);
    });

    it('should be a global module', () => {
      const module = EventsToolkitModule.forRootAsync(forRootAsyncOptions);
      expect(module.global).toBe(true);
    });

    it('should provide JETSTREAM_TOKEN from single source', () => {
      const module = EventsToolkitModule.forRootAsync(forRootAsyncOptions);
      const jsProvider = findProvider(module.providers as Provider[] | undefined, JETSTREAM_TOKEN);
      expect(jsProvider).toBeDefined();
    });

    it('should provide EVENTS_TOOLKIT_OPTIONS from factory', () => {
      const module = EventsToolkitModule.forRootAsync(forRootAsyncOptions);
      const optsProvider = findProvider(module.providers as Provider[] | undefined, 'EVENTS_TOOLKIT_OPTIONS');
      expect(optsProvider).toBeDefined();
    });

    it('should include user-provided imports', () => {
      const dummyModule = { module: class DummyModule {} };
      const module = EventsToolkitModule.forRootAsync({
        ...forRootAsyncOptions,
        imports: [dummyModule],
      });
      expect(module.imports).toContain(dummyModule);
    });

    it('should provide async logging from EVENTS_TOOLKIT_OPTIONS', () => {
      const module = EventsToolkitModule.forRootAsync({
        ...forRootAsyncOptions,
        useFactory: async () => ({
          nats: { servers: ['nats://localhost:4222'] },
          logging: { level: 'debug' },
        }),
      });
      const loggerProvider = findProvider(module.providers as Provider[] | undefined, EventLoggerService) as Provider;
      expect(loggerProvider).toBeDefined();
      expect('useFactory' in loggerProvider).toBe(true);
    });

    it('should use ProducerModule with useExisting for JETSTREAM_TOKEN', () => {
      const module = EventsToolkitModule.forRootAsync(forRootAsyncOptions);
      const producerImport = module.imports?.find((m) => getModuleName(m) === 'ProducerModule');
      expect(producerImport).toBeDefined();
      const producerProviders = (producerImport as DynamicModule | undefined)?.providers ?? [];
      const hasJetStreamProvider = producerProviders.some(
        (p) =>
          'provide' in (p as unknown as Record<string, unknown>) &&
          (p as unknown as Record<string, unknown>).provide === JETSTREAM_TOKEN,
      );
      expect(hasJetStreamProvider).toBe(false);
    });

    it('should provide and export RequestReplyService and REQUEST_REPLY_DEPS_TOKEN', () => {
      const module = EventsToolkitModule.forRootAsync(forRootAsyncOptions);
      expect(findProvider(module.providers as Provider[] | undefined, REQUEST_REPLY_DEPS_TOKEN)).toBeDefined();
      expect(findProvider(module.providers as Provider[] | undefined, RequestReplyService)).toBeDefined();
    });
  });
});
