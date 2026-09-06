# Feasibility verification

Date: 2026-09-06. Two kinds of evidence: **spike** = executed in this session on the real Workers runtime
(workerd via `@cloudflare/vite-plugin` 1.54.4, wrangler 4.129.0, Vite 8.2.2, Node 22) using the code in
`spike/`; **docs** = confirmed from official documentation or source (see `docs/cloudflare-platform.md` and
`docs/providers/`). Items marked **account** need your Cloudflare account and are the first thing Phase 0 does.

## Verified by running the spike

| Question | Result | Evidence |
|----------|--------|----------|
| Does `@cloudflare/vite-plugin` build a React SPA with `base: '/studio/'` plus a Worker in one project? | **Yes.** Client build lands flat in `dist/client` with asset URLs rewritten to `/studio/assets/…`; the generated `wrangler.json` points `assets.directory` at it. | `npm run build` output |
| Can the asset router serve the SPA under `/studio/` without running the Worker for every asset? | **Yes**, after a 6-line post-build step that moves the client build into `dist/client/studio/`. `/studio/assets/<hash>.js` is served as a static asset (free, unlimited). | `GET /studio/assets/index-*.js → 200 text/javascript` |
| Does the SPA fallback work for deep links under `/studio`? | **Yes.** `/studio`, `/studio/`, `/studio/generate/video`, `/studio/providers?tab=keys` all return the studio `index.html` with the correct asset references. The naive approach (fetching `/studio/index.html` from the asset binding) produced a 307 redirect loop; fetching `/studio/` instead is the fix and is in the spike. | preview curl table |
| Does anything outside `/studio` get touched? | **No.** `/` returns 404 from this Worker, and in production the route never matches it, so Pages keeps serving it. | `GET / → 404` |
| Does Hono route correctly under a base path with `run_worker_first` limited to `/studio/api/*`, `/studio`, `/studio/`? | **Yes.** Health, `/me`, credentials and proxy routes all answered by the Worker; static assets bypass it. | preview log |
| Does the Access gate behave? | **Yes.** No token on the production hostname → 403. Dev trust only applies on `localhost`. Unit tests cover valid token, wrong audience, wrong issuer, expired token, token signed by a foreign key, and missing token. | `worker/access.test.ts`, 4 tests passing |
| Does envelope encryption (KEK secret → per-user DEK → per-credential AES-GCM) run inside workerd with WebCrypto and D1? | **Yes.** Save then reveal round-trips a key through the local D1; wrong AAD, wrong user, or wrong KEK all fail to decrypt. | `POST /credentials` → `POST /credentials/:id/reveal` returned the original secret; `worker/crypto.test.ts` |
| Do D1 migrations apply from the repo folder? | **Yes.** `wrangler d1 migrations apply --local` applied `0001_init.sql`; the same command with `--remote` runs in CI. | migration table output |
| Does the streaming proxy skeleton enforce the allowlist? | **Yes** for the rejection path (`/proxy/nope/… → 404`). The forwarding path could not be exercised because this sandbox blocks outbound connections; it is standard `fetch` with a streamed body and will be smoke-tested on the first deploy. | preview log |

## Verified from documentation

| Question | Result | Where |
|----------|--------|-------|
| Can a Worker route run on `www.thewoovee.com/studio*` while Pages serves the rest of `www`? | Routes are matched before the request reaches the origin, and Cloudflare's routing doc states routes "take precedence if configured on the same hostname" as a Worker custom domain. The Pages known-issues page only forbids the reverse (adding a Pages custom domain where a route already exists). Treated as **likely yes; confirm with the probe route in Phase 0** (`docs/setup-cloudflare.md` §7), with `studio.thewoovee.com` as the fallback. | `cloudflare-platform.md` §2 |
| Can Access be scoped to the `/studio` path only? | **Yes.** Applications are hostname + optional path; the more specific path wins; Bypass apps for `/studio/api/health` and `/studio/api/tmp`. | `cloudflare-platform.md` §5 |
| Google login on the free Zero Trust plan? | **Yes**, plain OAuth client, no Google Workspace needed. One-time PIN needs no setup at all. | `setup-cloudflare.md` §3 |
| Free-tier headroom? | Workers 100k requests/day, static assets unlimited; D1 5M reads / 100k writes per day; R2 10 GB; Access 50 seats; Tunnel free; Workers AI 10,000 neurons/day. | `cloudflare-platform.md` §3–4 |
| Provider feasibility for your current keys? | **xAI**: images sync, video async, base64 inputs; proxy required. **Hugging Face**: Inference Providers via proxy with your free credits; Spaces called directly from the browser with your token (ZeroGPU quota is per IP). **RunPod**: public endpoints (flux-dev, schnell, kontext, WAN i2v) are the simplest test; serverless endpoints need a worker template and cost per second. | `providers/xai.md`, `huggingface-*.md`, `runpod.md` |
| Free options for testing beyond your keys? | **Cloudflare Workers AI** (flux-1-schnell, Leonardo Lucid Origin and Phoenix, SDXL) inside the same account, 10k neurons/day free. **Together** `FLUX.1-schnell-Free`. **Fireworks** $1 signup credit. **Google Gemini** image free tier is inconsistent in third-party reports and unverified officially; try with a key. **HF Spaces** ZeroGPU 5 GPU-min/day with a free token. | search results 2026-09-06, `providers/*.md` |

## Not verifiable from this sandbox (first hour of Phase 0 on your account)

1. The `/studio` route intercepting on the Pages custom domain (probe).
2. Live CORS preflights for fal, xAI and Hugging Face router (a 20-line script; decides `direct` vs `proxy` for fal).
3. Proxy forwarding and streaming against a real provider (xAI image generation with your key).
4. Chrome 142+ local-network permission prompt behaviour with ComfyUI on `localhost` (needs your PC).
