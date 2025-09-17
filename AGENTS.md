# Repository Guidelines

## Project Structure & Module Organization

- `src/`: TypeScript sources. Key areas: `commands/` (CLI actions), `core/`, `services/`, `tui/`, `util/`, `config.ts`, entry `cli.ts`.
- `src/__tests__/`: Co-located unit tests near subjects.
- `tests/` and `test/`: Organized and integration tests mirroring `src/` structure.
- `scripts/`: Developer utilities (coverage, performance, helpers).
- `docs/`: Architecture notes and runbooks. See `ARCHITECTURE.md`.

Naming example: `src/services/session-service.ts`, test `src/__tests__/services/session-service.test.ts`.

## Build, Test, and Development Commands

- Install deps: `npm ci` (Node 20+ recommended).
- Dev run: `npm run dev` (tsx executes `src/cli.ts`).
- Build: `npm run build` (emits JS to `dist/`). Start built CLI with `npm start`.
- Test (Jest): `npm test` or `npm run test:watch`; coverage with `npm run test:coverage` or CI-friendly `npm run test:ci`.
- Lint/format: `npm run lint` and `npm run fmt` (ESLint + Prettier).
- Docker (optional): `npm run docker:build` then `npm run docker:run`.

## Coding Style & Naming Conventions

- Indentation: 2 spaces; line length ≤ 100 chars.
- Names: `camelCase` vars/functions, `PascalCase` classes, kebab-case file names (`*.ts`/`*.tsx`).
- Structure: small, focused modules; avoid cyclic deps; inject dependencies where practical.
- Tools: ESLint + Prettier (run before commit/PR).

## Testing Guidelines

- Framework: Jest (+ jest-extended). Prefer colocated tests in `src/__tests__/`.
- Naming: `*.test.ts` or `*.test.tsx`; mirror source path.
- Coverage: target ≥ 80% on changed code. Check with `npm run test:coverage`.
- Practices: mock external I/O; use integration tests under `tests/` for end-to-end flows.

## Commit & Pull Request Guidelines

- Commits: Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`). Short imperative subject; add rationale in body.
- PRs: clear description, linked issues (`Closes #123`), CLI screenshots/logs for behavior changes, and test notes. Keep scope small.

## Security & Configuration

- Never commit secrets. Use `.env` locally; reference keys in `.env.example` and docs.
- Audit deps with `npm audit`; pin versions via `package-lock.json` in CI.
