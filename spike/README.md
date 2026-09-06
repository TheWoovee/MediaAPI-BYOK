# Phase 0 feasibility spike

Throwaway proof that the risky parts of `docs/PLAN.md` work together on the Cloudflare runtime. Not the app.
Results are recorded in `docs/feasibility.md`. Run locally:

```bash
cd spike
npm install
cp .dev.vars.example .dev.vars            # put any base64 32-byte value as KEK
npx wrangler d1 migrations apply studio-spike --local
npm run build && npx vite preview --port 4173
# then: curl -s localhost:4173/studio/api/health ; open http://localhost:4173/studio/
npm test                                  # Access JWT + envelope-encryption unit tests
```

What it contains:
- `vite.config.ts` with `base: '/studio/'` and `@cloudflare/vite-plugin`; `postbuild.mjs` moves the client build under `dist/client/studio/` so the asset router serves `/studio/*` for free.
- `worker/index.ts`: Hono app under `/studio`, health, Access gate, `/me`, credential create + reveal through D1 with envelope encryption, an allowlisted streaming proxy skeleton, and the SPA fallback that avoids the trailing-slash 307.
- `worker/access.ts`, `worker/crypto.ts` and their tests.
