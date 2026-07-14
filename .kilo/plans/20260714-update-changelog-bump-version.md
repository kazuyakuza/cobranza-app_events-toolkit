# Plan: Update CHANGELOG for v0.10.5 and bump version to v0.10.6

## Context

The critical workflow for runtime error fixes (TODO 20260714-0) has been completed and merged to `main`. The `CHANGELOG.md` file still shows `[0.10.4]` as the latest unreleased version, but the actual code changes were released as `0.10.5`. Additionally, the CHANGELOG needs to document the fixes that were made.

## Tasks

### Task 1: Update CHANGELOG.md

- Add a new section `## [0.10.5] — 2026-07-14` at the top of the changelog (after the header).
- Document the three fixes under `### Fixed`:
  1. **JetStream consumer options**: `JetStreamConsumerService.subscribe()` and `RequestReplyConsumerService.subscribe()` now use `resolveConsumerSubscribeOpts()` to ensure valid consumer options are always passed to NATS. Prevents `TypeError: Cannot read properties of undefined (reading 'ack_policy')` when `consumerOpts` is omitted or `{}`.
  2. **Explorer metadata reflection**: `OnEventExplorer` and `OnRequestReplyExplorer` now guard against accessor properties (getters/setters) when scanning prototypes. Prevents `TypeError` from `Reflect.getMetadata(undefined)`.
- Document under `### Added`:
  - New end-to-end runtime regression test (`src/events-toolkit.runtime.e2e-spec.ts`) that boots `EventsToolkitModule.forRootAsync` through full NestJS lifecycle, covering both the explorer accessor-property bug and the empty-consumer-options bug.
- Document under `### Changed`:
  - Update existing e2e DI spec (`src/events-toolkit.module.e2e-spec.ts`) mock to include `AckPolicy` and `consumerOpts` exports, ensuring compatibility with the new default consumer options helper.

### Task 2: Bump version to 0.10.6

- Update `package.json` version from `0.10.5` to `0.10.6`.
- Commit with message: `chore: bump version to 0.10.6`.

## Acceptance Criteria

- `CHANGELOG.md` accurately reflects all changes introduced in v0.10.5.
- `package.json` version is `0.10.6`.
- `npm run lint` and `npm run build` pass after changes.
- Changes are committed to `main` and pushed to `origin`.
