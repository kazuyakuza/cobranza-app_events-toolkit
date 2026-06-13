# Fix Plan: README.md — Task 2

## Issues Found

### 1. Missing `EventBase` reference
**Location**: Core Concepts / What it provides / Architecture  
**Problem**: `EventBase` is exported from `src/index.ts` and listed as a core class in `brief.md` and `architecture.md`, but it is not mentioned in the README.  
**Fix**: Add `EventBase` to the "What it provides" bullet list and mention it in the "Core Concepts" section as the abstract base class that `EventEnvelope<T>` extends.

### 2. Missing `constants.ts` and `validators/` in Architecture tree
**Location**: Architecture section  
**Problem**: The `src/common/` tree in the README omits `constants.ts` and `validators/` which are present in `brief.md` and `architecture.md`.  
**Fix**: Update the Architecture tree to include:
```
│   ├── constants.ts              # Magic strings, defaults
│   ├── envelope/
│   │   ├── validators/           # Custom class-validator decorators
```

### 3. `createEvent` example ambiguity
**Location**: Usage / Event Factory  
**Problem**: The example shows `type: PaymentProofUploadedEvent` where `PaymentProofUploadedEvent` is a class. Since the `EventEnvelope` class has a `readonly type` property that is a string (e.g., `'payment.proof.uploaded'`), passing the class as `type` is confusing.  
**Fix**: Change the `createEvent` example parameter to use a clearer name like `eventClass` or show the actual factory signature. If the factory signature uses `type` for the class, add a comment explaining it.

### 4. `EventContext` type not defined
**Location**: Usage / Defining an Event, Producer, Outbox  
**Problem**: The `EventContext` type is used in multiple examples (`handleUpload`, `processWithOutbox`) but never defined or shown.  
**Fix**: Add a small "Event Context" subsection under Core Concepts showing what `EventContext` contains (at least `companyId`, `actorType`, `actorId`, `correlationId`, `traceId`, etc.) or link to the convention document.

### 5. `requestEvent` undefined in Request-Reply example
**Location**: Usage / Request-Reply Pattern  
**Problem**: The `sendAndWait` example uses `requestEvent` without showing its creation.  
**Fix**: Add the creation of `requestEvent` in the snippet or add a comment explaining it.

### 6. `PaymentProofUploadedData` example inconsistency
**Location**: Usage / Defining an Event  
**Problem**: The `brief.md` example includes `currency` with `@IsEnum(Currency)` decorator. The README example omits it.  
**Fix**: Add `currency` field to the README example to match the authoritative `brief.md` example, or add a comment that it's optional.

### 7. UUID naming in Architecture tree
**Location**: Architecture section  
**Problem**: The README tree shows `UUIDv7` instead of `uuid.utils.ts` or `generateUuidV7`.  
**Fix**: Update the tree label to `uuid.utils.ts` or `generateUuidV7` to match the actual source file.

## Steps
1. Edit `README.md` to address issues 1–7.
2. Verify all internal links still work.
3. Ensure no broken Markdown formatting.
