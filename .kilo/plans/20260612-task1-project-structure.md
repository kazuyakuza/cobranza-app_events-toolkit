# Implementation Plan — Task 1: Project Structure & Initialize Package Configuration

## Plan Date
2026-06-12

## Task Summary
Create the full folder structure per `brief.md` section 4, configure `package.json`, `tsconfig.json`, and `tsconfig.build.json`.

---

## High-Level Approach

The project is a NestJS **library** (not a standalone service). It has no `package.json`, no TypeScript config, and an empty `src/` directory. The approach is:

1. Create TypeScript configuration files (`tsconfig.json`, `tsconfig.build.json`) with NestJS-appropriate compiler options.
2. Create `package.json` with the correct name, version, dependencies (runtime), peerDependencies (NestJS/NATS/validators), and devDependencies.
3. Create all `src/` subdirectories per `brief.md` section 4 folder structure.
4. Update `.gitignore` to add missing `node_modules/` pattern.
5. Run `npm install` to generate `package-lock.json` and populate `node_modules/`.
6. Verify build compiles successfully (even with empty source files).
7. Update `.agent/project-structure.md`.

---

## Pre-Implementation Notes

### Ambiguity: Package Name
- **TODO task** specifies: `@cobranza/events-toolkit`
- **All project docs** (`brief.md`, `tech.md`, `product.md`, `README.md`, `architecture.md`) use: `@cobranza-app/events-toolkit`
- **Resolution**: Use `@cobranza-app/events-toolkit` — project docs are authoritative. Flag to user for confirmation.

### Build Script Decision
- Prior fix plan Issue 5 suggested `nest build` but this adds `@nestjs/cli` + `@nestjs/schematics` as unnecessary dev dependencies for a library.
- **Decision**: Use `tsc -p tsconfig.build.json` — TypeScript's native compiler handles decorators via `experimentalDecorators` + `emitDecoratorMetadata` compiler options. No `@nestjs/cli` needed.

### .gitignore Gap
- Current `.gitignore` is missing `node_modules/`. This must be added before `npm install`.

---

## Detailed Steps

### Step 1: Update `.gitignore` — Add `node_modules/`

**File**: `.gitignore`
**Action**: Add `node_modules/` to the ignore patterns.
**Rationale**: The current `.gitignore` covers `build/`, `dist/`, and various temp files but omits `node_modules/`.

**Change**: Insert after the "Build artifacts" block (after line 32):

```
# Dependencies
node_modules/
```

---

### Step 2: Create `tsconfig.json`

**File**: `tsconfig.json` (project root)
**Action**: Create with NestJS-library-appropriate compiler options.

```json
{
  "compilerOptions": {
    "target": "ES2021",
    "module": "commonjs",
    "lib": ["ES2021"],
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "experimentalDecorators": true,
    "emitDecoratorMetadata": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "moduleResolution": "node",
    "removeComments": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "strictNullChecks": true,
    "strictPropertyInitialization": false
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "**/*.spec.ts", "**/*.test.ts"]
}
```

**Key compiler options explained**:
- `target: ES2021` — Modern Node.js (v18+) supports this natively.
- `module: commonjs` — Required by NestJS/NATS ecosystem.
- `experimentalDecorators: true` / `emitDecoratorMetadata: true` — Required by NestJS decorators (`@Injectable()`, `@Module()`, custom decorators).
- `declaration: true` / `declarationMap: true` — Generates `.d.ts` files for library consumers.
- `strict: true` — Full strict mode (overridden only for `strictPropertyInitialization` which conflicts with `@IsOptional()` validators).
- `rootDir: ./src` — Ensures output structure mirrors `src/` structure.
- `removeComments: true` — Keeps output clean (self-documenting code, not comments).
- `noUnusedLocals` / `noUnusedParameters` — Code quality enforcement.

---

### Step 3: Create `tsconfig.build.json`

**File**: `tsconfig.build.json` (project root)
**Action**: Create build-specific config that extends `tsconfig.json` and excludes tests.

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "declarationMap": false,
    "sourceMap": false
  },
  "exclude": ["node_modules", "dist", "**/*.spec.ts", "**/*.test.ts", "**/__mocks__/**"]
}
```

---

### Step 4: Create `package.json`

**File**: `package.json` (project root)
**Action**: Create with full metadata, scripts, dependencies, peerDependencies, and devDependencies.

```json
{
  "name": "@cobranza-app/events-toolkit",
  "version": "0.1.0",
  "description": "NestJS library for standardized NATS+JetStream event handling across Cobranza App microservices",
  "keywords": [
    "nestjs",
    "nats",
    "jetstream",
    "events",
    "messaging",
    "microservices",
    "cobranza"
  ],
  "repository": {
    "type": "git",
    "url": "https://github.com/cobranza-app/events-toolkit"
  },
  "license": "Unlicense",
  "author": "Cobranza App",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": [
    "dist/",
    "README.md",
    "LICENSE"
  ],
  "scripts": {
    "build": "tsc -p tsconfig.build.json",
    "test": "jest",
    "test:e2e": "jest --config jest.e2e.config.js",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage",
    "lint": "eslint \"src/**/*.ts\"",
    "lint:fix": "eslint \"src/**/*.ts\" --fix",
    "format": "prettier --write \"src/**/*.ts\"",
    "format:check": "prettier --check \"src/**/*.ts\"",
    "typecheck": "tsc --noEmit",
    "clean": "rimraf dist/",
    "prebuild": "npm run clean",
    "prepublishOnly": "npm run build"
  },
  "peerDependencies": {
    "@nestjs/common": "^10.0.0",
    "@nestjs/core": "^10.0.0",
    "@nestjs/microservices": "^10.0.0",
    "class-transformer": "^0.5.0",
    "class-validator": "^0.14.0",
    "nats": "^2.0.0"
  },
  "dependencies": {
    "better-sqlite3": "^9.0.0",
    "uuid": "^9.0.0",
    "winston": "^3.0.0"
  },
  "devDependencies": {
    "@nestjs/testing": "^10.0.0",
    "@types/better-sqlite3": "^7.0.0",
    "@types/jest": "^29.0.0",
    "@types/node": "^20.0.0",
    "@types/uuid": "^9.0.0",
    "@typescript-eslint/eslint-plugin": "^6.0.0",
    "@typescript-eslint/parser": "^6.0.0",
    "eslint": "^8.0.0",
    "eslint-config-prettier": "^9.0.0",
    "eslint-plugin-prettier": "^5.0.0",
    "jest": "^29.0.0",
    "prettier": "^3.0.0",
    "rimraf": "^5.0.0",
    "ts-jest": "^29.0.0",
    "typescript": "^5.0.0"
  },
  "engines": {
    "node": ">=18.0.0"
  },
  "publishConfig": {
    "access": "public"
  }
}
```

**Key decisions**:
- **peerDependencies**: `@nestjs/common`, `@nestjs/core`, `@nestjs/microservices`, `class-transformer`, `class-validator`, `nats` — these must be provided by the consuming microservice. Using `peerDependencies` avoids version conflicts and keeps the library lightweight.
- **dependencies**: `uuid`, `winston`, `better-sqlite3` — these are internal implementation details the consumer doesn't directly interact with. They get bundled with the library.
- **devDependencies**: Testing (`jest`, `ts-jest`, `@nestjs/testing`), linting (`eslint`, `prettier`, related plugins), types (`@types/*`), build tooling (`rimraf` for clean).
- **scripts**: `prebuild` → `clean` runs before build; `prepublishOnly` → `build` ensures dist/ is fresh on publish.
- **`main`**: `dist/index.js` — barrel export file.
- **`types`**: `dist/index.d.ts` — type declarations for consumers.
- **`files`**: Only `dist/`, `README.md`, `LICENSE` are published to npm.
- **`publishConfig.access: "public"`**: Required for scoped packages (`@cobranza-app/`).

---

### Step 5: Create Folder Structure in `src/`

**Action**: Create all directories per `brief.md` section 4 folder structure. Place a `.gitkeep` file in each empty leaf directory so they are tracked by git.

**Directories to create** (paths relative to `src/`):

```
src/
├── common/
│   ├── envelope/
│   │   └── validators/
│   ├── dto/
│   ├── utils/
│   └── errors/
├── producer/
│   └── decorators/
├── consumer/
│   └── decorators/
├── request-reply/
├── outbox/
└── logging/
```

**Commands** (PowerShell, from project root):
```powershell
New-Item -ItemType Directory -Force -Path "src/common/envelope/validators"
New-Item -ItemType Directory -Force -Path "src/common/dto"
New-Item -ItemType Directory -Force -Path "src/common/utils"
New-Item -ItemType Directory -Force -Path "src/common/errors"
New-Item -ItemType Directory -Force -Path "src/producer/decorators"
New-Item -ItemType Directory -Force -Path "src/consumer/decorators"
New-Item -ItemType Directory -Force -Path "src/request-reply"
New-Item -ItemType Directory -Force -Path "src/outbox"
New-Item -ItemType Directory -Force -Path "src/logging"
```

**`.gitkeep` files**: Place in each **leaf** directory:
- `src/common/envelope/validators/.gitkeep`
- `src/common/dto/.gitkeep`
- `src/common/utils/.gitkeep`
- `src/common/errors/.gitkeep`
- `src/producer/decorators/.gitkeep`
- `src/consumer/decorators/.gitkeep`
- `src/request-reply/.gitkeep`
- `src/outbox/.gitkeep`
- `src/logging/.gitkeep`

Remove the existing `src/.gitkeep` since directories will now have content.

---

### Step 6: Create Jest Configuration

**File**: `jest.config.js` (project root)
**Action**: Create Jest configuration for unit tests.

```js
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
};
```

**File**: `jest.e2e.config.js` (project root)
**Action**: Create Jest configuration for e2e/integration tests.

```js
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  testRegex: '\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  testEnvironment: 'node',
};
```

---

### Step 7: Create ESLint Configuration

**File**: `.eslintrc.js` (project root)
**Action**: Create ESLint configuration for TypeScript.

```js
module.exports = {
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: 'tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module',
  },
  plugins: ['@typescript-eslint/eslint-plugin'],
  extends: [
    'plugin:@typescript-eslint/recommended',
    'plugin:prettier/recommended',
  ],
  root: true,
  env: {
    node: true,
    jest: true,
  },
  ignorePatterns: ['.eslintrc.js', 'jest.config.js', 'jest.e2e.config.js'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-module-boundary-types': 'off',
  },
};
```

---

### Step 8: Create Prettier Configuration

**File**: `.prettierrc` (project root)
**Action**: Create Prettier configuration consistent with NestJS conventions.

```json
{
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 120,
  "tabWidth": 2,
  "semi": true,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

---

### Step 9: Create `.eslintignore`

**File**: `.eslintignore` (project root)
**Action**: Exclude build artifacts and config files.

```
dist/
node_modules/
coverage/
jest.config.js
jest.e2e.config.js
.eslintrc.js
```

---

### Step 10: Create `.prettierignore`

**File**: `.prettierignore` (project root)
**Action**: Exclude non-source files.

```
dist/
node_modules/
coverage/
package-lock.json
*.md
```

---

### Step 11: Run `npm install`

**Command** (from project root):
```powershell
npm install
```

**Expected outcome**:
- `node_modules/` populated with all dependencies.
- `package-lock.json` generated.
- No errors (warnings about peer dependencies are expected since NestJS/NATS are not installed locally — they're provided by the consuming microservice).

---

### Step 12: Verify Build Compiles

**Pre-requisite**: Before running build, create a minimal `src/index.ts` so TypeScript has at least one file to compile:

```typescript
// Public API barrel exports — populated in subsequent tasks
export {};
```

**Command** (from project root):
```powershell
npm run build
```

**Expected outcome**:
- `dist/` directory created with compiled output.
- No TypeScript errors.

---

### Step 13: Update `.agent/project-structure.md`

**File**: `.agent/project-structure.md`
**Action**: Replace `# (no folders yet)` with the actual folder structure reflecting all created directories.

```markdown
# Folders in src/

- common/ - Shared types, envelope, DTOs, utilities, and error classes
- common/envelope/ - EventEnvelope base class, ActorType enum, EventBase
- common/envelope/validators/ - Custom class-validator decorators
- common/dto/ - Data Transfer Objects (BuildSubjectDto)
- common/utils/ - SubjectBuilder, EventFactory, UUID and date utilities
- common/errors/ - EventConsumerException and error index
- producer/ - ProducerModule, ProducerService, EmitEvent decorator
- producer/decorators/ - @EmitEvent() decorator
- consumer/ - ConsumerModule, ConsumerService, JetStreamConsumerService
- consumer/decorators/ - @OnEvent() decorator
- request-reply/ - RequestReplyService and type definitions
- outbox/ - OutboxModule, SqliteOutboxService, Outbox entity
- logging/ - EventLoggerService (Winston-based)

# Other folders

- .kilo/modes/ - Built-in agent mode prompt overrides
- docs/ - Documentation files
```

---

### Step 14: Git Commit

**Command**:
```powershell
git add -A
git commit -m "feat: initialize project structure, package.json, and TypeScript config"
```

**Verify** `.gitignore` compliance: ensure `node_modules/`, `dist/`, `coverage/` are not staged.

---

## Step Summary Table

| Step | Action | File(s) | Tool |
|------|--------|---------|------|
| 1 | Add `node_modules/` to `.gitignore` | `.gitignore` | `replace_lines_code` |
| 2 | Create `tsconfig.json` | `tsconfig.json` | `create_file_code` |
| 3 | Create `tsconfig.build.json` | `tsconfig.build.json` | `create_file_code` |
| 4 | Create `package.json` | `package.json` | `create_file_code` |
| 5 | Create `src/` folder structure | 9 directories + `.gitkeep` files | `bash` (New-Item) |
| 5b | Create minimal `src/index.ts` | `src/index.ts` | `create_file_code` |
| 6 | Create `jest.config.js` | `jest.config.js` | `create_file_code` |
| 6b | Create `jest.e2e.config.js` | `jest.e2e.config.js` | `create_file_code` |
| 7 | Create `.eslintrc.js` | `.eslintrc.js` | `create_file_code` |
| 8 | Create `.prettierrc` | `.prettierrc` | `create_file_code` |
| 9 | Create `.eslintignore` | `.eslintignore` | `create_file_code` |
| 10 | Create `.prettierignore` | `.prettierignore` | `create_file_code` |
| 11 | Run `npm install` | `node_modules/`, `package-lock.json` | `bash` |
| 12 | Verify build compiles | `dist/` | `bash` |
| 13 | Update project structure doc | `.agent/project-structure.md` | `replace_lines_code` |
| 14 | Git commit | — | `bash` |

---

## Verification Checklist

- [ ] `.gitignore` includes `node_modules/`
- [ ] `tsconfig.json` exists with correct compiler options
- [ ] `tsconfig.build.json` exists extending `tsconfig.json`
- [ ] `package.json` exists with correct:
  - [ ] `name`: `@cobranza-app/events-toolkit`
  - [ ] `version`: `0.1.0`
  - [ ] `main` and `types` point to `dist/`
  - [ ] `files` includes only `dist/`, `README.md`, `LICENSE`
  - [ ] `scripts` include build, test, lint, format
  - [ ] `peerDependencies` include NestJS, class-validator, class-transformer, nats
  - [ ] `dependencies` include uuid, winston, better-sqlite3
  - [ ] `devDependencies` include TypeScript, Jest, ts-jest, ESLint, Prettier, @types/*
- [ ] All `src/` subdirectories created per `brief.md` section 4
- [ ] `.gitkeep` files in leaf directories, `src/.gitkeep` removed
- [ ] `src/index.ts` exists with barrel export placeholder
- [ ] `jest.config.js` and `jest.e2e.config.js` exist
- [ ] `.eslintrc.js`, `.eslintignore` exist
- [ ] `.prettierrc`, `.prettierignore` exist
- [ ] `npm install` succeeds, `package-lock.json` generated
- [ ] `npm run build` succeeds (creates `dist/`)
- [ ] `.agent/project-structure.md` updated with new folder structure
- [ ] Git commit created with meaningful message
- [ ] No `node_modules/`, `dist/`, or `coverage/` in staging area
