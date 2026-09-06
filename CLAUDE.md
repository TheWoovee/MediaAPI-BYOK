# MediaAPI-BYOK

## Commands
- `npm run dev` — local dev server (Vite + workerd)
- `npm run build` — production build (vite build + postbuild asset move)
- `npm run test` — Vitest
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript strict check
- `npm run check` — typecheck + lint + test + build (CI gate)
- `npm run migrate:local` — apply D1 migrations locally
- `npm run migrate:remote` — apply D1 migrations to production

## Layout
- `shared/` — types and provider registry, imported by both SPA and Worker
- `worker/` — Hono API (Cloudflare Worker)
- `src/` — React SPA (Vite, Tailwind v4)
- `docs/` — architecture plan, provider research, platform docs

## Key constant
`shared/config.ts` exports `BASE_PATH` (default `'/studio'`). Hono `basePath`, React Router `basename`, Vite `base`, and the postbuild asset move all derive from it. To switch the mount point (e.g. probe route), change this one value plus the `routes` in `wrangler.jsonc`.

## Conventions
- Never log auth headers or request/response bodies
- Adapters live in `src/providers/<id>/` and register in `src/providers/index.ts`
- Envelope encryption: KEK (Worker secret) wraps per-user DEKs; DEKs encrypt credentials
- Proxy allowlist is driven by `shared/providers/registry.ts` host lists
- CSP connect-src allows `'self'`, Google API, HF Spaces, and localhost
