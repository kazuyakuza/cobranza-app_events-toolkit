# TECH — events-toolkit

## 1. Technology Stack

| Category | Technology | Purpose |
|----------|-----------|---------|
| **Runtime** | Node.js >= 20 | JavaScript runtime |
| **Language** | TypeScript 5.x | Static typing, decorators |
| **Framework** | NestJS 11.x | Module system, DI, decorators |
| **Validation** | `class-validator` 0.14.x | Runtime validation via decorators |
| **Transformation** | `class-transformer` 0.5.x | Plain object -> class instance |
| **UUID** | `uuid` 9.x | UUIDv7 generation for event IDs |
| **Logging** | `winston` 3.x | Structured logging |
| **Messaging** | `nats` 2.x + `@nestjs/microservices` | NATS client + NestJS integration |
| **Outbox DB** | `better-sqlite3` | Synchronous SQLite for file-based outbox |
| **Package Manager** | npm or pnpm | Dependency management |
| **Testing** | Jest (`@nestjs/testing`) | Unit and integration tests |
| **Linting** | ESLint + Prettier | Code style enforcement |

## 2. Development Setup

### Prerequisites
- Node.js >= 20.0.0
- npm >= 9 or pnpm >= 8
- NATS server (for integration testing) — can use Docker: `docker run -p 4222:4222 nats:latest -js`

### Local Development
```bash
# Clone and install
git clone <repo-url>
cd events-toolkit
npm install

# Build
npm run build

# Run tests
npm test

# Run tests with NATS (integration)
npm run test:e2e
```

### Project Dependencies (`package.json`)
```json
{
  "name": "@cobranza-app/events-toolkit",
  "version": "0.1.0",
  "description": "NestJS library for standardized NATS+JetStream event handling",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "scripts": {
    "build": "nest build",
    "test": "jest",
    "test:e2e": "jest --config jest.e2e.config.js",
    "lint": "eslint src/",
    "format": "prettier --write src/"
  },
  "peerDependencies": {
    "@nestjs/common": "^11.0.0",
    "@nestjs/microservices": "^11.0.0",
    "class-transformer": "^0.5.0",
    "class-validator": "^0.14.0",
    "nats": "^2.0.0"
  },
  "dependencies": {
    "uuid": "^9.0.0",
    "winston": "^3.0.0",
    "better-sqlite3": "^9.0.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.0.0",
    "@types/uuid": "^9.0.0",
    "@nestjs/testing": "^11.0.0",
    "typescript": "^5.0.0",
    "jest": "^29.0.0",
    "ts-jest": "^29.0.0",
    "eslint": "^8.0.0",
    "prettier": "^3.0.0"
  }
}
```

## 3. Technical Constraints

### Code Constraints (from `.agent/RULES.md`)
- **Max 200 lines per file** in `src/` (ideally <=125 excluding blanks/comments/imports).
- **Max 50 lines per method body**.
- **Max 2 levels of indentation** (extract deeper logic to separate methods).
- **Max 2 parameters per method/function** (encapsulate more in a class/object).
- **Prefer private members** — public only when necessary for the public API.
- **Self-documenting code** — clear names over comments.
- **No commented-out code** — use git history for restoration.
- **Single-section boolean conditions** — extract complex conditions to named methods.

### Architecture Constraints
- **No domain payloads in the toolkit** — each microservice defines its own event data types.
- **Library, not a service** — no `main.ts`, no bootstrap; only modules, services, utilities.
- **NestJS module pattern** — each concern is a separate DynamicModule.

### Event Constraints (from `docs/event-messaging-convention.md`)
- Subject format: `company.{company_id}.{domain}.{entity}.{action}.v{version}`
- Event ID: UUIDv7 with `evt_` prefix.
- `company_id` mandatory in every envelope.
- `actor_type` and `actor_id` mandatory for audit trails.
- Consumers must be idempotent.

## 4. Tool Usage Patterns

### Subject Builder
```typescript
const subject = subjectBuilder.build({
  companyId: '550e8400e29b41d4a716446655440000', // UUID without dashes
  domain: 'payment',
  entity: 'proof',
  action: 'uploaded',
  version: '1'
});
// Result: "company.550e8400e29b41d4a716446655440000.payment.proof.uploaded.v1"
```

### Event Publishing
```typescript
// Direct service injection
await this.producerService.publish(subject, eventEnvelope);

// Decorator-based (auto-publish on method return)
@EmitEvent({
  domain: 'payment',
  entity: 'proof',
  action: 'uploaded'
})
async handleProofUpload(data: ProofData, context: EventContext): Promise<PaymentProofUploadedEvent> {
  return new PaymentProofUploadedEvent(data, context);
}
```

### Event Consumption
```typescript
@OnEvent({
  domain: 'payment',
  entity: 'proof',
  action: 'uploaded'
})
async onPaymentProofUploaded(event: EventEnvelope<PaymentProofUploadedData>) {
  // Business logic — toolkit handles validation, parsing, DLQ routing
}
```

### Outbox Pattern
```typescript
// Save to outbox (persisted to SQLite file)
await this.outboxService.saveToOutbox(eventEnvelope);

// Background processor automatically publishes when NATS is available
```

## 5. Build & Output

- TypeScript compiled to `dist/` with `declaration: true` (generates `.d.ts` files).
- Package entry points: `main: "dist/index.js"`, `types: "dist/index.d.ts"`.
- Consumers import: `import { ProducerModule, EventEnvelope } from '@cobranza-app/events-toolkit'`.

## 6. Testing Strategy

- **Unit tests**: Jest with `@nestjs/testing`. Each service, util, and decorator tested in isolation.
- **Integration tests**: Require a running NATS server. Test end-to-end publish->consume, DLQ routing, and outbox processing.
- **Validation tests**: Every `class-validator` rule tested with valid and invalid inputs.
- **Subject builder tests**: Edge cases for UUID formats, special characters in domain/entity/action.

## 7. Version Compatibility

- NestJS 11.x (peer dependency — consumer microservice chooses exact version).
- Node.js >= 20.
- NATS server >= 2.10 with JetStream enabled.
- SQLite 3.x (via `better-sqlite3`).

## 8. Related Documentation

- [brief.md](brief.md) — Project scope and folder structure.
- [architecture.md](architecture.md) — System architecture, module design, and data flows.
- [event-messaging-convention.md](../../docs/event-messaging-convention.md) — Event & messaging convention standard.