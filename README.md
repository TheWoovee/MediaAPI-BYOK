# MediaAPI-BYOK

A bring-your-own-keys media generation studio deployed as one Cloudflare Worker (Hono API + React SPA)
mounted at `https://www.thewoovee.com/studio`. Generate and edit images and videos through 27 cloud
and local providers using your own API keys, stored encrypted server-side.

## Architecture

- [docs/PLAN.md](docs/PLAN.md) — full architecture, data model, API surface, security, phases
- [docs/feasibility.md](docs/feasibility.md) — verified spike results
- [docs/providers/](docs/providers/) — per-provider research (auth, endpoints, constraints)

## Local development

```bash
# Install dependencies
npm install

# Copy dev vars (set your own KEK and email)
cp .dev.vars.example .dev.vars

# Apply D1 migrations locally
npm run migrate:local

# Start dev server (Vite + workerd, auto-reloads)
npm run dev
```

The dev server runs at `http://localhost:5173/studio/`. `DEV_TRUST_EMAIL` in `.dev.vars`
bypasses Access JWT verification on localhost (only when `ENVIRONMENT=development`).

See `.dev.vars.example` for the required variables including KEK rotation support
(`KEK` is the current key; set `KEK_VERSION` and `KEK_V<n>` for rotation).

## Commands

| Command | Purpose |
|---------|---------|
| `npm run dev` | Local dev server |
| `npm run build` | Production build |
| `npm run test` | Run Vitest |
| `npm run lint` | ESLint |
| `npm run typecheck` | TypeScript strict check |
| `npm run check` | All gates: typecheck + lint + test + build |
| `npm run migrate:local` | Apply D1 migrations locally |
| `npm run migrate:remote` | Apply D1 migrations to production |
| `npm run deploy` | Migrate + deploy to Cloudflare |

## Probe route

The app currently deploys behind probe routes (`/__studio-probe`) to verify that Worker routes
intercept on the Pages custom domain. Once confirmed, update `wrangler.jsonc`: comment out the
probe routes and uncomment the `/studio` routes, then change `BASE_PATH` in `shared/config.ts`.

## Project structure

```
shared/          Types and provider registry (shared by SPA and Worker)
  config.ts      BASE_PATH constant — one place to change the mount point
  types.ts       ProviderSpec, Credential, JobRecord, NormalizedOutput, etc.
  providers/     Registry of all 27 providers
worker/          Hono API (Cloudflare Worker)
  index.ts       Main app, SPA fallback, scheduled handler
  access.ts      Access JWT verification (jose)
  crypto.ts      Envelope encryption (WebCrypto)
  proxy.ts       Allowlisted streaming proxy + /fetch
  routes/        credentials, local-servers, jobs, uploads
  migrations/    D1 SQL migrations
src/             React SPA (Vite, Tailwind v4)
  app/           Router, layout, pages
  providers/     Adapter registration point
```
