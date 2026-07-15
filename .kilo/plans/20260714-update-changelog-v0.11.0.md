# Update CHANGELOG for v0.11.0 and Publish

## Context

The stream auto-creation feature was merged as part of `20260714-todo-2.md`, bumping `package.json` to `0.11.0`. However, `CHANGELOG.md` was never updated and still ends at `[0.10.7]`. This plan adds the missing `[0.11.0]` entry, bumps the version to `0.11.1` so the release is ready for publish, and pushes to origin.

## Steps

1. **Read `CHANGELOG.md`** — confirm no `[0.11.0]` entry exists.
2. **Insert the `[0.11.0]` section** immediately after the header and before `[0.10.7]`:

```markdown
## [0.11.0] — 2026-07-14

### Added

- **JetStream stream auto-creation** (`consumer.autoCreateStreams`): When enabled, `JetStreamConsumerService.subscribe()` automatically creates a NATS JetStream stream for the subject before subscribing, eliminating the `Error: no stream matches subject` startup failure. Uses `JetStreamManager` to check stream coverage via `streams.find(subject)`; if missing, creates a stream with file storage, limits retention, and unlimited messages/bytes/age. Race conditions (another service creating the same stream simultaneously) are silently handled.
- `StreamAutoCreator` class in `src/consumer/stream-auto-creator.ts` — encapsulates stream existence checks and creation logic.
- `buildStreamName()` utility in `src/consumer/build-stream-name.util.ts` — sanitizes NATS subject strings into valid stream names.
- `consumer.autoCreateStreams?: boolean` option on `EventsToolkitConsumerOptions` (default `false`, opt-in).
- `connection?: NatsConnection` and `autoCreateStreams?: boolean` added to `JetStreamConsumerDeps` interface.
- Tests: `stream-auto-creator.spec.ts`, `jetstream-consumer.service.auto-create.spec.ts`, `consumer.module.auto-create.spec.ts`.

### Changed

- `ConsumerModuleOptions` now accepts `autoCreateStreams` and propagates it through sync (`forRoot`) and async (`forRootAsync`) provider factories.
- `EventsToolkitModule` passes the resolved `NatsConnection` and `autoCreateStreams` flag to `ConsumerModule` in both `forRoot` and `forRootAsync` paths.
- `createSyncJetStreamConsumerDepsProvider` and `createSyncRequestReplyConsumerDepsProvider` refactored to accept single options objects (complying with max-2-params rule).
- Centralized JetStream resolution: removed duplicate `resolveJetStream` from `consumer.module.ts`; now imports `resolveJetStreamFromOptions` from `consumer-module.providers.ts`.

### Documentation

- New guide: `docs/nats-jetstream-configuration.md` — 11 sections covering NATS server requirements, JetStream configuration, stream auto-creation, manual setup, production recommendations, Docker Compose, resource limits, authentication & security, clustering & replication, monitoring & health checks, backup & restore.
- `README.md` Deployment section trimmed: removed duplicated programmatic stream setup snippet in favor of a link to the new configuration guide.
```

3. **Bump `package.json` version** from `0.11.0` to `0.11.1`.
4. **Verify markdown formatting** — ensure the entry follows Keep a Changelog format.
5. **Commit both files** with message: `docs: update CHANGELOG for v0.11.0 and bump version to 0.11.1`.
6. **Push `main` to `origin`** only.

## Verification

- `CHANGELOG.md` contains `[0.11.0]` entry.
- `package.json` version is `0.11.1`.
- Both files are committed on `main`.
- `origin/main` is up to date.
