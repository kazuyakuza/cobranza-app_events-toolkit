/**
 * Identifies whether an event is scoped to a tenant or to the global/platform scope.
 *
 * Used by `@EmitEvent` / `@OnEvent` metadata to drive subject routing:
 * - `tenant` → subject prefix `company.{companyId}...` (default; backward-compatible)
 * - `global` → subject prefix `global....`
 */
export enum EventScope {
  TENANT = 'tenant',
  GLOBAL = 'global',
}
