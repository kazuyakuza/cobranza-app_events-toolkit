# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/).

## [0.7.4] - 2026-06-27

### Fixed

- Fixed a NestJS 11 module compilation failure in `EventsToolkitModule.forRoot()` and `EventsToolkitModule.forRootAsync()`. The module previously declared an `exports` array containing `ProducerService`, `ConsumerService`, `OutboxService`, `EventLoggerService`, and `DiscoveryService`, but only `EventLoggerService` was declared in the module's own `providers` array. The remaining tokens belong to the imported sub-modules (`ProducerModule`, `ConsumerModule`, `OutboxModule`, `DiscoveryModule`).
- NestJS 11 introduced stricter provider-export validation (`Module.validateExportedProvider`), which rejects exporting a token that is neither declared in the module's own `providers` nor directly re-exported from an `imports` entry. This caused production startup (`nest start`) and test compilation (`Test.createTestingModule`) to fail with: `Nest cannot export a provider/module that is not a part of the currently processed module (EventsToolkitModule)`.
- Removed the redundant `exports` arrays from both `forRoot()` and `forRootAsync()`. Because `ProducerModule`, `ConsumerModule`, `OutboxModule`, and `DiscoveryModule` are all registered with `global: true` (and `EventsToolkitModule` itself is `global: true`), their providers remain available application-wide through the global DI registry. The `exports` array was both invalid and functionally redundant.

### Upgrade Notes

- **No code changes are required for consumers.** Continue to inject `ProducerService`, `ConsumerService`, `OutboxService`, `EventLoggerService`, and `DiscoveryService` via constructor dependency injection as before.
- Services remain available application-wide; nothing in the public API or consumption pattern changed.
- If you depend on `EventsToolkitModule` explicitly re-exporting those services (non-standard), switch to injecting them directly — they are globally available.
