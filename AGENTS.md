# Repository Guidelines

## Project Structure & Module Organization

PayPal Rec is a Next.js App Router application for assembling cited evidence packets. `app/` contains pages, Server Actions and API routes. Shared logic lives in `lib/evidence/` (intake, matching, review and export) and `lib/paypal/` (replay and Sandbox adapters). Keep business rules in these modules so browser flows and CLI scripts reuse them.

- `scripts/`: import commands and demo rehearsal.
- `tests/`: Node unit, route and integration tests.
- `db/migrations/` and `db/tests/`: ordered SQL migrations and database smoke tests.
- `fixtures/restriction-agency-v1/`: synthetic inputs and a separate evaluation key.
- `docs/`: workflows and acceptance records; `output/pdf/`: retained packet artifacts.

## Build, Test, and Development Commands

Use Node.js 26 from `.nvmrc`.

- `npm ci`: install lockfile dependencies.
- `npm run dev`: start local development.
- `npm run lint`: run ESLint with zero warnings allowed.
- `npm run typecheck`: generate Next.js route types and check TypeScript.
- `npm test`: run `tests/*.test.mjs`.
- `npm run build` / `npm start`: build and serve production.
- `npm run demo:rehearse`: check native review forms and exports against a running local server.

## Coding Style & Naming Conventions

Follow existing two-space indentation, double quotes and semicolons. Use strict TypeScript, named exports, PascalCase components and camelCase functions. Module filenames use kebab-case; Next.js entry points retain names such as `page.tsx` and `route.ts`. Use Tailwind utilities and existing components. ESLint applies Next.js core-web-vitals and TypeScript rules; no separate formatter is configured.

## Testing Guidelines

Tests use `node:test`, strict assertions and disposable PGlite databases; PayPal calls are stubbed. Name files `<feature>.test.mjs`. Run focused checks with `node --test tests/evidence-packet.test.mjs`. Cover relevant reconciliation, citation, stale-review, rollback and case-isolation behavior. No numeric coverage threshold is configured. Follow `db/README.md` for standalone PostgreSQL checks.

## Commit & Pull Request Guidelines

Follow `CONTRIBUTING.md`. Use branches such as `feat/14-slug`, `fix/14-slug` or `docs/14-slug`. Write short imperative commit subjects; history includes plain imperatives and prefixes such as `docs:`. Target `main`; include `Closes #N`, behavior changes, reproducible validation and limitations. Keep main runnable, pass relevant checks, self-review the diff and squash merge after review when available.

## Security & Evidence Boundaries

Keep secrets in ignored `.env.local`; use `.env.example` for configuration names. Use synthetic or authorized Sandbox data. Preserve immutable snapshots, exact same-currency reconciliation and resolvable citations. Keep the evaluation key out of application inputs. The shared workspace key grants access but does not establish reviewer identity. Never silently replace failed Sandbox imports with replay data.
