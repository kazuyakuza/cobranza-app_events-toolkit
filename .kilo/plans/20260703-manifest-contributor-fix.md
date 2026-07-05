# ManifestContributor Code Review Fix Plan

## Summary

All functional requirements are met and `npm run test`, `npm run typecheck`, and `npm run lint` pass. One project-rule violation was found.

## Issues Found

### Issue 1: `src/discovery/manifest-contributor.merger.spec.ts` exceeds max file length

- **File**: `src/discovery/manifest-contributor.merger.spec.ts`
- **Line**: file total 206 lines
- **Problem**: The [Max Lines per File Rule](../.kilo/rules/max-lines-per-file.md) limits `src/` code files to 200 lines. The spec file is 206 lines.
- **Impact**: Violates project coding standard.
- **Suggested fix**: Split the spec into two focused files and extract shared helpers to keep each under 200 lines.

## Fix Steps (in priority order)

1. **Create shared test fixtures**  
   New file: `src/discovery/manifest-contributor.merger.fixtures.ts`  
   Move the helper functions from the existing spec file:
   - `createMockManifest`
   - `createConsumeEntry`
   - `createProduceEntry`
   - `createContributor`

2. **Create base merge behavior spec**  
   New file: `src/discovery/manifest-contributor.merger.base.spec.ts`  
   Include tests for:
   - Empty contributors array
   - Contributors returning empty arrays
   - Appending contributor consumes
   - Appending contributor produces
   - No mutation of baseline manifest

3. **Create deduplication spec**  
   New file: `src/discovery/manifest-contributor.merger.dedup.spec.ts`  
   Include tests for:
   - Produces deduplicated by subject (baseline wins)
   - Consumes deduplicated by `subject|type` (baseline wins)
   - Same subject but different type in consumes (both kept)
   - Multiple contributors collision (earlier wins)

4. **Delete original spec file**  
   Remove `src/discovery/manifest-contributor.merger.spec.ts` after confirming the two new files cover all original test cases.

5. **Run verification**  
   - `npm run test`
   - `npm run typecheck`
   - `npm run lint`
   - Confirm each new file is ≤ 200 lines.

## Notes

- No functional changes are required; this is a test-file reorganization.
- All other reviewed files comply with the max-lines, max-depth, max-params, no-commented-code, and self-documenting-code rules.
