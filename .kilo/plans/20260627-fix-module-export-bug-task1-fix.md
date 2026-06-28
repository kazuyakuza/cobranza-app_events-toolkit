# Fix Plan: Task 1 — Code Review Findings

## Issues Found

`npm run lint` fails in `src/events-toolkit.module.spec.ts` due to Prettier arrow-function parameter style violations introduced by the new tests.

### Lint Errors

```
C:\projects\cobranza-app\events-toolkit\src\events-toolkit.module.spec.ts
   41:31  error  Replace `n` with `(n)`    prettier/prettier
   42:30  error  Replace `(n` with `((n)`  prettier/prettier
   43:31  error  Replace `n` with `(n)`    prettier/prettier
  117:31  error  Replace `n` with `(n)`    prettier/prettier
  118:30  error  Replace `(n` with `((n)`  prettier/prettier
  119:31  error  Replace `n` with `(n)`    prettier/prettier
```

### Affected Lines

- Line 41: `expect(importNames.some(n => n === 'ProducerModule')).toBe(true);`
- Line 42: `expect(importNames.some(n => n === 'ConsumerModule')).toBe(true);`
- Line 43: `expect(importNames.some(n => n === 'DiscoveryModule')).toBe(true);`
- Line 117: `expect(importNames.some(n => n === 'ProducerModule')).toBe(true);`
- Line 118: `expect(importNames.some(n => n === 'ConsumerModule')).toBe(true);`
- Line 119: `expect(importNames.some(n => n === 'OutboxModule')).toBe(true);`

## Fix Instructions

1. Open `src/events-toolkit.module.spec.ts`.
2. Wrap the single arrow-function parameter `n` with parentheses on the six lines listed above.
   - Example: `n => n === 'ProducerModule'` becomes `(n) => n === 'ProducerModule'`.
3. Run `npm run lint -- --max-warnings=0` and confirm zero errors.
4. Run `npm test -- --testPathPattern=events-toolkit.module.spec.ts` and confirm all tests still pass.
5. Commit the formatting fix with a meaningful message (e.g., `style: fix arrow-function formatting in module spec`).

## Notes

- The bug fix itself (removing redundant `exports` arrays) is correct and resolves the NestJS 11 `Module.validateExportedProvider` failure.
- All other rule compliance checks (max lines, max depth, max params, no commented code, single-section booleans, etc.) passed.
- The only blocking issue is the Prettier/ESLint formatting error in the newly added tests.
