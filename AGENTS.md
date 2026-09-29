# Nexora — notes for contributors and agents

Monorepo (npm workspaces): `apps/api` (Fastify + Prisma/PostgreSQL), `apps/web` (React 19 + Vite), `packages/contracts` (shared DTOs).

## Dev
- `npm run dev` — API on :3000, web on :5173 (needs PostgreSQL at `DATABASE_URL`, see `.env.example`)
- After changing `packages/contracts`: `npm run build -w @nexora/contracts`
- New migrations must be added to both `apps/api/prisma/migrations` and `apps/api/prisma/migrations-sqlite`

## Verification (run before committing)
- `npm run typecheck`
- `npm run lint` (0 errors expected; warnings are pre-existing)
- `npm test -w @nexora/api` — uses the `nexora_test` database; new test files must be added to the explicit list in `apps/api/package.json`
- `npm test -w @nexora/web`
- `npm run build`
- `npm audit` — keep at 0 vulnerabilities

## Conventions
- i18n: 5 locales in `apps/web/src/i18n/locales` (pt-PT is the reference). `pt-PT.ts` uses unquoted keys; `en/fr/es/de` use quoted keys.
- Platform-level (cross-tenant) endpoints live under `/platform/*` and require `requireSuperAdmin`.
- Shell on the dev machine is PowerShell: no `&&`, use separate commands.

## Known commercial/legal items
- Sheets formulas use the in-house engine `apps/web/src/lib/sheet-formula.ts` (replaced GPL-3.0 HyperFormula). Do not add copyleft (GPL/AGPL) runtime dependencies; check licenses before adding packages. Engine tests: `apps/web/test/sheet-formula.test.ts`.
- `docs/legal/DPA-modelo-pt.md` is a template pending legal review.
