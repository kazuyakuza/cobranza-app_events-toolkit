import { resolveCapabilities } from './events-toolkit-module.imports';

describe('EventsToolkitModule capabilities resolution', () => {
  describe('resolveCapabilities helper', () => {
    it('resolves idempotency and outbox when both enabled', () => {
      const capabilities = resolveCapabilities({
        nats: { servers: ['nats://localhost:4222'] },
        idempotency: { type: 'memory' },
        outbox: { type: 'sqlite', sqlitePath: ':memory:' },
      });
      expect(capabilities).toEqual(expect.arrayContaining(['idempotency', 'outbox']));
    });

    it('omits idempotency when disabled', () => {
      const capabilities = resolveCapabilities({
        nats: { servers: ['nats://localhost:4222'] },
        idempotency: { type: 'memory', enabled: false },
        outbox: { type: 'sqlite', sqlitePath: ':memory:' },
      });
      expect(capabilities).toContain('outbox');
      expect(capabilities).not.toContain('idempotency');
    });

    it('omits outbox when absent', () => {
      const capabilities = resolveCapabilities({
        nats: { servers: ['nats://localhost:4222'] },
        idempotency: { type: 'memory' },
      });
      expect(capabilities).toContain('idempotency');
      expect(capabilities).not.toContain('outbox');
    });

    it('includes user-defined discovery capabilities', () => {
      const capabilities = resolveCapabilities({
        nats: { servers: ['nats://localhost:4222'] },
        discovery: { capabilities: ['custom-capability'] },
      });
      expect(capabilities).toContain('custom-capability');
    });

    it('returns empty array when no capabilities enabled', () => {
      const capabilities = resolveCapabilities({
        nats: { servers: ['nats://localhost:4222'] },
      });
      expect(capabilities).toEqual([]);
    });
  });
});
