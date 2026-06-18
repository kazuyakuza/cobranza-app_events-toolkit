# TODO — Upgrade NestJS from v10 to v11

## Tasks

### Upgrade NestJS to v11 [DONE]
1. Update `package.json` peer dependencies (`@nestjs/common`, `@nestjs/core`, `@nestjs/microservices`) to `^11.0.0`
2. Update `package.json` devDependencies (`@nestjs/testing`) to `^11.0.0`
3. Update `package.json` Node.js engine requirement from `>=18.0.0` to `>=20.0.0`
4. Run `npm install` to update lock file and verify dependency resolution
5. Run full test suite (`npm test`) to catch any runtime regressions
6. Fix any test failures caused by the module resolution algorithm change (use `moduleIdGeneratorAlgorithm: 'deep-hash'` in `Test.createTestingModule` if needed)
7. Run lint, format check, and typecheck to ensure code quality
8. Verify all imports and decorators still compile correctly
9. Update documentation if any API changes affect public surface
