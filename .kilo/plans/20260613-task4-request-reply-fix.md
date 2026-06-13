# Task 4 — Request-Reply Code Review Fix Plan

## Summary

The Request-Reply implementation adds `RequestReplyService` with synchronous request-reply support, the supporting types and dependency token, and barrel exports in `src/index.ts`. The service integrates with `NatsConnection.request`, `ProducerService.publish`, and `EventLoggerService`.

Verification results:

- `npm test -- --testPathPattern=request-reply` — **9 passed**.
- `npm run typecheck` — **clean**.
- `npm run lint` — **9 errors** (all prettier formatting / missing EOF newlines).

Several code-quality, observability, testing, and plan-adherence issues need to be addressed before the task is complete.

---

## Issues

### 1. Prettier formatting and missing trailing newlines

- **Files:**
  - `src/request-reply/request-reply.service.ts`
  - `src/request-reply/request-reply.types.ts`
  - `src/request-reply/request-reply.service.spec.ts`
- **Rule:** Prettier configuration
- **Issue:** `npm run lint` reports 9 prettier errors, including multi-line import/object formatting and missing EOF newlines.
- **Suggested fix:** Run `npm run format:write` (or `npx prettier --write "src/**/*.ts"`), then re-run `npm run lint` to confirm zero errors.

---

### 2. Plan adherence — `request()` signature differs from TODO specification

- **File:** `src/request-reply/request-reply.service.ts`
- **Line:** 44
- **Rule:** Critical Workflow plan adherence
- **Issue:** The implementation exposes `request<T, R>(options: RequestReplyOptions<T>)`. The TODO (#4, Task 1) specifies keeping the existing synchronous method shape `request<T, R>(subject, payload, options)`. This deviation breaks the expected public API and the documented call-site `requestReplyService.request<T, R>(subject, payload, options)`.
- **Suggested fix:** Update the public method signature to match the plan:

  ```ts
  async request<T, R>(
    subject: string,
    payload: T,
    options?: RequestReplyRequestOptions,
  ): Promise<RequestReplyResponse<R>>
  ```

  Where `RequestReplyRequestOptions` contains `context`, `timeoutMs`, and any other request-level overrides. Internally, build the envelope from `context` and `payload`, then call `this.natsConnection.request(subject, encoded, { timeout })`.

  If the options-object style is intentionally preferred for consistency with `ProducerService.emit`, update the TODO and README to reflect the actual API and obtain plan approval before finalizing.

---

### 3. Duplicate emission log when sending a response

- **File:** `src/request-reply/request-reply.service.ts`
- **Lines:** 63–68, 118–126
- **Issue:** `sendResponse` calls `ProducerService.publish`, which already logs "Event emitted" via `EventLoggerService.logEventEmitted`. Then `sendResponse` calls its own `logResponseSent`, which again calls `logEventEmitted` with the same subject/event. This produces two nearly identical log lines for a single response send.
- **Suggested fix:** Remove the redundant `logResponseSent` method and its call. Rely on `ProducerService.publish` for response emission logging. If request-reply response logging needs a distinct message/category, extend `EventLoggerService` with a dedicated method (e.g., `logResponseSent`) instead of double-logging with `logEventEmitted`.

---

### 4. Reply-consumed log uses the request envelope instead of the reply envelope

- **File:** `src/request-reply/request-reply.service.ts`
- **Lines:** 51–52
- **Issue:** After decoding the reply, `request` calls `this.logReplyReceived(options.subject, envelope)`, where `envelope` is the *outgoing request* envelope. The "Event consumed" log therefore records the request's `eventId` and `eventType`, not the reply's. This makes distributed tracing and correlation inaccurate.
- **Suggested fix:** Pass the decoded `responseEnvelope` to `logReplyReceived`:

  ```ts
  const responseEnvelope = this.decodeEnvelope<R>(msg.data);
  this.logReplyReceived(options.subject, responseEnvelope);
  ```

  Update the corresponding test to assert that the consumed log context uses the reply envelope's `id`, `type`, and `correlation_id`.

---

### 5. Missing error handling and logging for request failures

- **File:** `src/request-reply/request-reply.service.ts`
- **Lines:** 44–55, 98–100
- **Issue:**
  - `this.natsConnection.request` can throw on timeout or broker failure; the error is not caught or logged.
  - `decodeEnvelope` calls `JSON.parse` directly, so a malformed reply payload throws `SyntaxError` without context.
  - Neither path uses `EventLoggerService.logEventError`, which is the library's standard error-observability hook.
- **Suggested fix:** Wrap the NATS request and envelope decoding in `try/catch`, log structured errors via `this.logger.logEventError`, and re-throw a domain-specific exception. Introduce a `RequestReplyException` (or reuse `EventConsumerException` if semantically appropriate) carrying the original error, subject, correlation ID, and event ID. Add tests for:
  - NATS request timeout / rejection.
  - Malformed JSON in the reply body.
  - Error log context shape (subject, eventId, correlationId, error message).

---

### 6. Generic `Error` thrown for missing `reply_to`

- **File:** `src/request-reply/request-reply.service.ts`
- **Lines:** 102–108
- **Issue:** `ensureReplyTo` throws a plain `Error`. The rest of the library uses `EventConsumerException` for domain failures; request-reply should be consistent.
- **Suggested fix:** Throw a domain-specific exception (e.g., `RequestReplyException` or `EventConsumerException`) with the same descriptive message. Update the test expectation to match the new error type if applicable.

---

### 7. `logResponseSent` duplicates `toLogContext` structure

- **File:** `src/request-reply/request-reply.service.ts`
- **Lines:** 118–126, 128–136
- **Issue:** `logResponseSent` manually builds the same `EventLogContext` shape that `toLogContext` already produces. Once the redundant log is removed (Issue 3), this duplication becomes moot; if a distinct log method remains, reuse `toLogContext`.
- **Suggested fix:** After resolving Issue 3, delete `logResponseSent`. If a separate response-sent log is still required, refactor it to call `this.toLogContext(replyTo, envelope)`.

---

### 8. Test coverage gaps

- **File:** `src/request-reply/request-reply.service.spec.ts`
- **Issue:** Tests do not cover:
  - Request timeout / broker-level failure.
  - Malformed reply payload.
  - Error logging via `logEventError`.
  - The correct envelope being used for the reply-consumed log (see Issue 4).
  - `sendResponse` only logging once after the fix (Issue 3).
- **Suggested fix:** Add tests for the scenarios above. Keep the spec focused; if the file grows beyond 200 lines, split timeout/error tests into `request-reply.service.errors.spec.ts`.

---

### 9. Duplicated envelope serialization logic

- **Files:**
  - `src/request-reply/request-reply.service.ts`
  - `src/producer/producer.service.ts`
  - `src/consumer/jetstream-consumer.service.ts`
- **Issue:** Multiple services instantiate `TextEncoder`/`TextDecoder` and inline `JSON.stringify` / `JSON.parse`. This duplication increases maintenance cost and the risk of inconsistent serialization behavior.
- **Suggested fix:** Extract a small serialization helper in `src/common/utils/serialization.utils.ts`:

  ```ts
  export const encodeEvent = (event: unknown): Uint8Array =>
    new TextEncoder().encode(JSON.stringify(event));

  export const decodeEvent = <T>(raw: Uint8Array): T =>
    JSON.parse(new TextDecoder().decode(raw)) as T;
  ```

  Update `RequestReplyService`, `ProducerService`, and `JetStreamConsumerService` to import these helpers, adding unit tests for the utility.

---

## Recommended Fix Order

1. **Formatting:** Run `npm run format:write` and verify `npm run lint` passes.
2. **API alignment:** Resolve the `request()` signature mismatch with the TODO/plan (Issue 2) before any other public-API changes.
3. **Observability fixes:** Remove duplicate response log (Issue 3), fix reply-consumed log envelope (Issue 4), and add structured error handling (Issue 5).
4. **Domain exceptions:** Replace generic `Error` with a request-reply exception (Issue 6).
5. **Test coverage:** Add tests for timeout, malformed replies, error logging, and corrected log contexts (Issue 8).
6. **Refactoring:** Extract shared serialization helpers and adopt them across services (Issue 9).

---

## Verification After Fixes

- `npm test -- --testPathPattern=request-reply` should pass, including new error/timeout tests.
- `npm run typecheck` should remain clean.
- `npm run lint` should pass with 0 errors.
- `npm run format:check` should pass.
- The public `request()` API should match the approved plan/TODO.
