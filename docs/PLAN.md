# MediaAPI-BYOK — Requirements Analysis, Architecture and Implementation Plan

Status: proposal v1 (2026-09-06). Nothing here is built yet. Read "Open questions" (section 2) first;
every question has a default assumption, and the plan below is written against those defaults.

---

## 1. What is being asked for

A browser-based "media studio" reachable from `https://www.thewoovee.com` that:

| # | Requirement | Interpretation used in this plan |
|---|-------------|----------------------------------|
| R1 | Runs from the existing site (Cloudflare free plan, domain registered at Hostinger) | Deployed as a Cloudflare Worker with static assets, on a hostname of the `thewoovee.com` zone. GitHub is the source of truth; every push to `main` deploys. |
| R2 | Bring Your Own Keys (BYOK) | The user pastes their own provider API keys. Keys are stored **only in the user's browser**, encrypted. The server never persists them. |
| R3 | "Most providers": xAI Grok, Seedance, Hugging Face free pages, RunPod public APIs, serverless APIs ("sleeveless" read as *serverless*: fal.ai, Replicate, etc.) | A provider-adapter architecture with a fixed interface. First wave: xAI, fal.ai, Replicate, Hugging Face Inference + Spaces, RunPod Serverless, BytePlus ModelArk (Seedance direct), OpenAI-compatible endpoints. |
| R4 | Generate **and edit** images and videos | Capabilities modelled explicitly: text→image, image→image (edit/inpaint/variation), upscale, text→video, image→video, video→video/extend. Each model declares which it supports. |
| R5 | Locally hosted servers must be reachable | Two paths: (a) same-PC direct calls to `http://localhost:*` (ComfyUI, A1111/Forge, any OpenAI-compatible server); (b) from anywhere via a Cloudflare Tunnel that exposes the PC's server as `something.thewoovee.com`, protected by Cloudflare Access. |
| R6 | Usable "whenever, wherever", including from the PC when the server is running | Cloud providers work from any device. Local servers work from anywhere while the PC is on and the tunnel is up; the app shows them as online/offline. |
| R7 | Cloudflare + GitHub deploy combo | GitHub Actions runs lint/typecheck/tests and `wrangler deploy`. PR builds get preview URLs. |

### Things the request does not say, that matter a lot

1. **Who uses it.** A private tool for one person is a very different security posture from a public page where strangers paste their own keys. Default: private (owner + invited emails), designed so it can be opened up later.
2. **Where it mounts.** `www.thewoovee.com` presumably already serves a site. Default: `studio.thewoovee.com`. Alternative: `www.thewoovee.com/studio/*` via a Worker route (works, slightly more setup).
3. **Where outputs live.** Default: in the browser (IndexedDB/OPFS) with download; optional cloud gallery on R2 later.
4. **Budget.** Default: Cloudflare stays on free tiers; the only spend is the user's own provider usage.

---

## 2. Open questions (answer these; defaults in bold)

1. **Mount point:** `studio.thewoovee.com` (**default**) or `www.thewoovee.com/studio`? Is there an existing site on `www` and what is it built with (Pages, Hostinger builder, WordPress)?
2. **DNS:** Are `thewoovee.com` nameservers already pointed at Cloudflare (**assumed yes**, since the site is "hosted in Cloudflare")? If DNS is still at Hostinger, Workers custom domains will not work until the zone is moved to Cloudflare (registration can stay at Hostinger).
3. **Audience:** Just you (**default: you + optional invited emails via Cloudflare Access**), or public visitors each using their own keys?
4. **Provider priority:** proposed order is xAI → fal.ai → Hugging Face → Replicate → RunPod → Seedance direct (BytePlus) → OpenAI/Google/Stability. Reorder?
5. **Local stack:** ComfyUI? Automatic1111/Forge? Anything else? Windows or Linux? (**default: ComfyUI first, A1111 second, Windows**).
6. **Seedance access:** via fal.ai/Replicate (**default, no new account**) or a direct BytePlus ModelArk account too?
7. **Output persistence:** browser only (**default**) or also a cloud gallery on R2 (free 10 GB)?
8. **Phone use:** should it install as a PWA (**default yes**, cheap to add)?
9. **Multiple devices:** should encrypted key bundles sync between devices (**default no**; export/import file instead)?

---

## 3. Key constraints that shape the design

| Constraint | Consequence |
|-----------|-------------|
| Many provider APIs block browser calls (no CORS): Replicate, RunPod, BytePlus Ark, most video APIs. | A same-origin **proxy** on the Worker is required. It forwards to an allowlist of provider hosts only. |
| Browser pages served over HTTPS may not call plain `http://` LAN addresses (mixed content), **except loopback** (`http://localhost`, `http://127.0.0.1`) which Chrome and Firefox allow. Safari is inconsistent. | Same-PC local servers are called directly on `localhost`. Other machines on the LAN go through a Cloudflare Tunnel (HTTPS) instead. |
| Local servers need CORS enabled for the app origin. | Setup guide: ComfyUI `--enable-cors-header https://studio.thewoovee.com`, A1111 `--cors-allow-origins=https://studio.thewoovee.com`. |
| Cloudflare Workers free plan: 100k requests/day, 10 ms CPU per request, no wall-clock cap on I/O, streaming bodies. Static asset requests are free and unlimited. | The proxy is pure I/O (fine). Long jobs are **never** awaited server-side: providers are used in async submit/poll mode and the browser polls. No Durable Objects or Queues needed. |
| Video generations take minutes and can return files of 10–100+ MB. | Results are fetched through the proxy as a stream and stored in the browser. Nothing is buffered on the server. |
| An open proxy on a public URL will be abused. | Provider allowlist + Cloudflare Access on the whole hostname (private mode) or Turnstile + rate limits (public mode). Header passthrough limited to auth/content headers. |
| BYOK keys are the crown jewels. | Keys never leave the browser except inside the request to the proxy, which forwards them and forgets them. Encrypted at rest with a user passphrase. `Cache-Control: no-store`, no logging of auth headers. |

---

## 4. Architecture

```
                         Browser (PC / phone / anywhere)
   ┌───────────────────────────────────────────────────────────────────┐
   │  React SPA (Vite)                                                 │
   │  ├─ Key Vault ── WebCrypto AES-GCM, passphrase-unlocked, in-mem   │
   │  ├─ Provider Adapters (xai, fal, replicate, hf, runpod, ark, ...) │
   │  ├─ Job Runner ── submit → poll → fetch outputs → store           │
   │  ├─ Gallery / History ── IndexedDB (Dexie) + OPFS blobs           │
   │  └─ Transport ─┬─ direct fetch  → http://localhost:8188 (ComfyUI) │
   │                ├─ direct fetch  → https://comfy.thewoovee.com     │
   │                └─ /api/proxy/*  → Cloudflare Worker (below)       │
   └───────────────────────────────────────────────────────────────────┘
                 │ HTTPS (same origin: studio.thewoovee.com)
                 ▼
   ┌───────────────────────────────────────────────────────────────────┐
   │  Cloudflare Worker  (Hono)                                        │
   │  ├─ static assets: the SPA                                        │
   │  ├─ GET  /api/health, /api/providers (public metadata)            │
   │  ├─ ANY  /api/proxy/:provider/*  ── host allowlist per provider,  │
   │  │        header allowlist, streams request+response, no state    │
   │  ├─ GET  /api/fetch?url=…  ── output download via allowlisted CDNs│
   │  └─ (optional) Access JWT check, Turnstile, KV rate-limit         │
   └───────────────────────────────────────────────────────────────────┘
        │              │               │              │
        ▼              ▼               ▼              ▼
     api.x.ai    queue.fal.run   api.replicate.com  router.huggingface.co
                 api.runpod.ai   ark.*.bytepluses.com  *.hf.space …

   ┌──────────── user's PC ─────────────┐
   │ ComfyUI :8188 / A1111 :7860        │◄── cloudflared tunnel ──► comfy.thewoovee.com
   │ (CORS enabled for the app origin)  │        (Cloudflare Access: email OTP or service token)
   └────────────────────────────────────┘
```

### 4.1 Frontend

- **Stack:** TypeScript, React 18, Vite, Tailwind, Zustand (state), Dexie (IndexedDB), `@cloudflare/vite-plugin` (builds SPA + Worker as one project, local dev via `wrangler dev` semantics).
- **Screens:** Generate (image / video tabs), Edit (upload → mask/inpaint/variation/upscale), Gallery/History, Providers & Keys, Local servers, Settings.
- **Key Vault:** keys encrypted with AES-GCM; key derived from passphrase with PBKDF2 (600k iterations) or Argon2id via WASM. Unlocked into memory per session; "remember on this device" keeps the wrapped key in IndexedDB. Export/import as an encrypted JSON bundle for moving between devices.
- **Job Runner:** one state machine per job (`queued → submitted → running → succeeded|failed|cancelled`), persistent in IndexedDB so a page reload or phone lock does not lose a 5-minute video job. Polling with backoff; jobs are resumable because the provider job id is stored.
- **Media store:** outputs saved as blobs (OPFS where available, IndexedDB fallback) with thumbnails; metadata (prompt, model, params, seed, provider, cost estimate) stored alongside so any output can be re-run or used as an edit input.
- **PWA:** manifest + service worker for install-to-home-screen and offline gallery.

### 4.2 Provider adapter interface (the core abstraction)

```ts
type Capability =
  | 'text2image' | 'image2image' | 'inpaint' | 'upscale'
  | 'text2video' | 'image2video' | 'video2video';

interface ModelSpec {
  id: string;                 // provider-native id
  label: string;
  capabilities: Capability[];
  params: ParamSchema;        // JSON-schema-ish, drives the UI form
  pricingHint?: string;
}

interface ProviderAdapter {
  id: string;                 // 'xai' | 'fal' | 'replicate' | 'hf' | 'runpod' | 'ark' | 'comfyui' | 'a1111' | 'openai-compat'
  label: string;
  auth: { kind: 'bearer' | 'header' | 'none'; header?: string; help: string };
  transport: 'proxy' | 'direct';                // cloud → proxy, local/tunnel → direct
  listModels(ctx: Ctx): Promise<ModelSpec[]>;    // static list, or fetched (RunPod endpoints, ComfyUI workflows)
  submit(req: GenerateRequest, ctx: Ctx): Promise<JobHandle>;   // returns outputs immediately OR a poll reference
  poll(handle: JobHandle, ctx: Ctx): Promise<JobStatus>;
  cancel?(handle: JobHandle, ctx: Ctx): Promise<void>;
}
```

- `Ctx` carries an authenticated `fetch` that routes through the proxy or directly, injects the right auth header, and enforces timeouts.
- Adding a provider = one folder with `adapter.ts`, `models.ts`, `README.md` and a contract test. No UI changes.
- Input images/videos are handed to adapters as blobs; each adapter decides: inline base64 (xAI, Ark, HF, ComfyUI upload endpoint), the provider's own upload API (fal storage, Replicate files), or a temporary signed R2 URL (phase 3, only if a provider needs a public URL).

### 4.3 Provider matrix (first two waves)

Verify each endpoint against current docs at implementation time; these move quickly.

| Provider | Transport | Image gen | Image edit | Video | Notes |
|----------|-----------|-----------|------------|-------|-------|
| **xAI Grok** | proxy → `api.x.ai/v1` | `POST /images/generations` (OpenAI-compatible, `grok-2-image` family, `n`, `response_format`) | check current docs for edit endpoint | check current docs for Grok Imagine video API | Reuse the OpenAI-compatible adapter with an xAI preset. |
| **fal.ai** (serverless) | proxy → `queue.fal.run`, `rest.alpha.fal.ai` | Flux, SDXL, Recraft, Ideogram… | Flux Fill/Kontext, inpaint, upscalers | **Seedance 1.x**, Kling, Veo, MiniMax, Wan, LTX… | Best single aggregator: one key covers most of the video request. Queue API is natively submit/poll. |
| **Replicate** (serverless) | proxy → `api.replicate.com/v1` | thousands of models | yes | yes incl. Seedance | `POST /models/{owner}/{name}/predictions`, poll `GET /predictions/{id}`. No CORS → proxy required. |
| **Hugging Face Inference** | proxy → `router.huggingface.co` | text-to-image via Inference Providers | image-to-image for supported models | limited | Free tier credits with an HF token. |
| **Hugging Face Spaces** ("free pages") | direct or proxy → `*.hf.space` | Gradio apps | Gradio apps | Gradio apps | Use `@gradio/client` (`/gradio_api/call/{fn}` + SSE). Each Space is added by URL; the app introspects its API and renders a generic form. Cold starts and queues are normal. |
| **RunPod Serverless** | proxy → `api.runpod.ai/v2/{endpoint}` | `/run` + `/status/{id}` | depends on worker | depends on worker | Payload is worker-specific; ship presets for the official ComfyUI and A1111 workers, plus a raw-JSON mode. |
| **RunPod Pods / any rented GPU box** | direct → `https://{pod}-{port}.proxy.runpod.net` | via ComfyUI/A1111 adapters | yes | yes | Behaves exactly like a "local server" with a different base URL. |
| **Seedance direct** (BytePlus ModelArk) | proxy → `ark.ap-southeast.bytepluses.com/api/v3` | Seedream | Seedream edit | `POST /contents/generations/tasks` + `GET /tasks/{id}` | Wave 2. Needs a BytePlus account. |
| **OpenAI-compatible** (generic) | proxy or direct | `/v1/images/generations` | `/v1/images/edits` | – | Covers OpenAI, xAI, LocalAI, many gateways. User supplies base URL + key. |
| **ComfyUI** (local/tunnel/pod) | direct | workflow JSON → `POST /prompt`, `GET /history/{id}`, `GET /view` | any workflow | any workflow (Wan, LTX, Hunyuan…) | Ship a few API-format workflow templates with exposed parameters; users can import their own and map fields. |
| **A1111 / Forge** (local/tunnel/pod) | direct | `/sdapi/v1/txt2img` | `/sdapi/v1/img2img`, inpaint, `extra-single-image` upscale | – | Progress via `/sdapi/v1/progress`. |
| Wave 3 candidates | proxy | OpenAI gpt-image, Google Imagen/Veo, Stability, Ideogram, Recraft, Luma, Runway, Kling, MiniMax, Together | | | Each is one adapter folder. |

### 4.4 Worker (API) design

- **Framework:** Hono on Workers. Routes:
  - `GET /api/health` — version, build sha.
  - `GET /api/providers` — static registry (ids, labels, allowlisted hosts) so the SPA and Worker cannot drift.
  - `ALL /api/proxy/:provider/*` — rewrites to the provider's base URL; only allowlisted hostnames (exact or `*.hf.space` pattern); forwards method, body (streamed), and an allowlist of headers (`authorization`, `x-api-key`, `content-type`, `accept`, provider-specific like `prefer`); strips cookies; adds nothing identifying; returns provider status codes verbatim; `Cache-Control: no-store`.
  - `GET /api/fetch?url=` — streams an output file from allowlisted CDN hosts (`replicate.delivery`, `*.fal.media`, `*.hf.space`, provider signed-URL hosts) so the browser can save blobs cross-origin.
- **No state, no secrets** in the Worker in phase 1. No KV/D1/R2 bindings until phase 3.
- **Auth (private mode, default):** Cloudflare Access sits in front of the hostname. The Worker additionally verifies the `Cf-Access-Jwt-Assertion` header on `/api/*` against the team's JWKS and the app AUD, so the proxy cannot be reached by bypassing Access. Zero login code in the app.
- **Auth (public mode, if chosen later):** drop Access; add Turnstile on first use, a per-IP KV token bucket, and a daily request cap so the free 100k budget cannot be drained by one visitor.
- **Security headers:** strict CSP (`connect-src` lists the origin, `http://localhost:*`, `http://127.0.0.1:*`, and the user's configured tunnel hosts via a runtime meta tag), `Referrer-Policy: no-referrer`, `Permissions-Policy`, HSTS.

### 4.5 Local servers: same PC and from anywhere

**Same PC (no setup beyond CORS):** the SPA calls `http://localhost:8188` directly. Health check every 15 s shows a green/grey badge.

**From anywhere (Cloudflare Tunnel, free):**

1. On the PC: install `cloudflared`, `cloudflared tunnel login`, `cloudflared tunnel create studio-local`.
2. Config routes `comfy.thewoovee.com → http://localhost:8188`, `sd.thewoovee.com → http://localhost:7860`. `cloudflared tunnel route dns` creates the CNAMEs. Install as a Windows service so it starts with the PC.
3. Cloudflare Zero Trust → Access → add a self-hosted app per hostname. Policy: allow owner's email (one-time PIN) **and** a **service token**. The service token id/secret are stored in the app's Key Vault like any other key and sent as `CF-Access-Client-Id/Secret` headers.
4. Start ComfyUI with `--listen 127.0.0.1 --enable-cors-header https://studio.thewoovee.com`. Only cloudflared can reach it; the internet only sees Cloudflare.
5. In the app, add a Local Server with base URL `https://comfy.thewoovee.com`. Offline PC = grey badge, jobs stay queued until it is back.

Fallback if the user prefers not to touch DNS: Tailscale Funnel works the same way with a `*.ts.net` hostname.

### 4.6 Data and privacy summary

| Data | Where | Encryption | Leaves the browser? |
|------|-------|------------|---------------------|
| Provider API keys | IndexedDB (wrapped) + memory (unlocked) | AES-GCM, passphrase-derived key | Only inside the proxied request to the provider. Never stored server-side, never logged. |
| Prompts, params, job records | IndexedDB | none (device-local) | No (phase 3 opt-in R2 sync would be encrypted client-side). |
| Generated media | OPFS / IndexedDB | none | No, unless the user opts into the R2 gallery. |
| Access session | Cloudflare cookie | Cloudflare-managed | Cloudflare only. |

---

## 5. Repository layout

```
MediaAPI-BYOK/
├─ package.json                # pnpm, scripts: dev, build, test, lint, typecheck, deploy
├─ wrangler.jsonc              # name, assets: { directory: dist/client, not_found_handling: spa }, routes
├─ vite.config.ts              # react + @cloudflare/vite-plugin
├─ tsconfig*.json, eslint, prettier, vitest.config.ts
├─ src/                        # SPA
│  ├─ app/                     # routes, layout, screens
│  ├─ components/              # UI kit
│  ├─ vault/                   # key storage + crypto
│  ├─ jobs/                    # runner, persistence, polling
│  ├─ media/                   # blob store, thumbnails, export
│  ├─ providers/
│  │  ├─ core/                 # interfaces, Ctx, registry, param-schema → form
│  │  ├─ xai/  fal/  replicate/  hf-inference/  hf-space/  runpod/  ark/  openai-compat/
│  │  └─ comfyui/  a1111/
│  └─ transport/               # proxy fetch, direct fetch, health checks
├─ worker/
│  ├─ index.ts                 # Hono app
│  ├─ proxy.ts                 # allowlist + streaming forward
│  ├─ access.ts                # Cf-Access JWT verification
│  └─ registry.ts              # provider → hosts (shared type with src/providers/core)
├─ shared/                     # types shared by SPA and Worker
├─ docs/                       # this plan, provider guides, local-server setup, ADRs
├─ .github/workflows/
│  ├─ ci.yml                   # lint, typecheck, unit + adapter contract tests (mocked HTTP)
│  └─ deploy.yml               # wrangler deploy on main; preview upload on PRs
└─ README.md
```

---

## 6. Implementation phases

Each phase ends with something deployed and usable.

### Phase 0 — Skeleton and pipeline (1–2 days)
- Scaffold Vite + React + Worker with `@cloudflare/vite-plugin`; Hono `/api/health`.
- GitHub Actions: CI on PRs; `wrangler deploy` on `main`; `wrangler versions upload` on PRs for preview URLs.
- Custom domain `studio.thewoovee.com` (or path route) live with a placeholder page.
- Cloudflare Access application in front of it (owner email).
- **Exit:** visiting the URL prompts for email OTP, then shows the app shell; PR previews work.

### Phase 1 — MVP: keys, proxy, first images (1 week)
- Key Vault (passphrase, encrypt/decrypt, export/import).
- Proxy with allowlist, header filtering, streaming; Access JWT check.
- Adapters: **OpenAI-compatible (with xAI preset)**, **fal.ai**, **HF Inference**.
- Generate screen: text→image, param form generated from `ParamSchema`, batch `n`, seed.
- Job runner with persistence; Gallery with download and "reuse as input".
- **Exit:** generate images with xAI, fal and HF from phone and PC; reload mid-job and see it finish.

### Phase 2 — Editing, video, serverless and local (2 weeks)
- Edit screen: upload, mask painting canvas, inpaint / img2img / upscale via fal + OpenAI-compatible `/images/edits`.
- Video: text→video and image→video via fal (Seedance, Kling, Wan…), Replicate; long-job UX (progress, cancel, ETA, notifications via the PWA).
- Adapters: **Replicate**, **RunPod Serverless** (ComfyUI/A1111 worker presets + raw mode), **HF Spaces** (Gradio introspection).
- Local: **ComfyUI** adapter with workflow templates + import/mapping UI, **A1111/Forge** adapter; localhost direct calls; health badges.
- `docs/local-servers.md`: CORS flags, cloudflared tunnel + Access service token, Windows service.
- **Exit:** edit an image, produce a Seedance video, run a ComfyUI workflow on the PC from a phone through the tunnel.

### Phase 3 — Polish and options (ongoing)
- Seedance/Seedream direct via BytePlus Ark; OpenAI gpt-image; Google Imagen/Veo; Stability; others by demand.
- Optional R2 gallery (10 GB free) with client-side encryption; temporary signed upload URLs for providers that require public input URLs.
- Prompt library, presets, side-by-side compare, cost estimates per provider, usage log.
- Public mode toggle (Turnstile + rate limits) if the audience question is answered "public".

---

## 7. Deployment plan (Cloudflare + GitHub)

### 7.1 One-time Cloudflare setup
1. Confirm `thewoovee.com` is an active zone in the Cloudflare dashboard (`dig NS thewoovee.com` should return Cloudflare nameservers). If not: add the site to Cloudflare, copy the two nameservers into Hostinger's domain panel, wait for activation. Registration stays at Hostinger.
2. Create an API token: template **Edit Cloudflare Workers** plus `Zone → DNS → Edit` and `Zone → Workers Routes → Edit` for the zone (needed for the custom domain). Note the Account ID.
3. Zero Trust (free, up to 50 users): create the team domain; add Access application for `studio.thewoovee.com` with an Allow policy on the owner's email; copy the application AUD.
4. (Phase 2) Tunnel and Access apps for `comfy.thewoovee.com` / `sd.thewoovee.com` with a service token.

### 7.2 GitHub repository setup
- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Variables: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` (these are not secrets; they go into `wrangler.jsonc` `vars`).
- Branch protection on `main`: CI must pass; deploy runs only from `main`.
- `deploy.yml`: `pnpm install --frozen-lockfile` → `pnpm build` → `cloudflare/wrangler-action` `deploy` (main) or `versions upload` (PRs, comment the preview URL on the PR).
- Rollback: `wrangler rollback` or redeploy a previous commit; Workers keep version history.

### 7.3 wrangler.jsonc essentials
```jsonc
{
  "name": "mediaapi-byok",
  "main": "worker/index.ts",
  "compatibility_date": "2026-09-01",
  "assets": { "directory": "dist/client", "not_found_handling": "single-page-application", "run_worker_first": ["/api/*"] },
  "routes": [{ "pattern": "studio.thewoovee.com", "custom_domain": true }],
  "vars": { "ACCESS_TEAM_DOMAIN": "…", "ACCESS_AUD": "…" },
  "observability": { "enabled": true }
}
```
If the path option is chosen instead: `"routes": [{ "pattern": "www.thewoovee.com/studio*", "zone_name": "thewoovee.com" }]` and the SPA is built with `base: '/studio/'`.

### 7.4 Local development
- `pnpm dev` runs Vite with the Cloudflare plugin: SPA + Worker on `http://localhost:5173`, proxy included, no Access (a dev flag bypasses the JWT check on localhost only).
- A `.dev.vars` file is never needed for provider keys, because keys live in the browser even in dev.

### 7.5 Free-tier budget check

| Resource | Free limit | Expected use |
|----------|-----------|--------------|
| Worker requests | 100k / day | A busy day of generating is hundreds to low thousands (polls included). |
| Worker CPU | 10 ms / request | Proxying is I/O; header rewriting is microseconds. |
| Static assets | unlimited | – |
| Access | 50 users | 1–few |
| Tunnel | free | – |
| R2 (phase 3) | 10 GB storage, 10M reads / month | Optional gallery. |

---

## 8. Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Provider APIs change (xAI video/edit endpoints, HF router paths, fal model ids). | Adapter per provider with contract tests against recorded fixtures; model lists partly fetched live; provider README with "last verified" date. |
| A provider returns outputs only as expiring URLs. | Job runner downloads outputs to the browser as soon as the job succeeds. |
| Some providers require a **public URL** for input images/videos (no base64). | Prefer providers' own upload APIs; phase 3 adds short-lived signed R2 URLs. |
| Safari blocks `http://localhost` calls from an HTTPS page. | Document; recommend Chrome/Firefox on the PC or use the tunnel hostname even locally. |
| Open-proxy abuse or free-tier exhaustion. | Access in front (private mode); strict host allowlist; rate limits in public mode. |
| Keys lost if the browser profile is wiped. | Encrypted export/import bundle; reminder on first save. |
| Chrome Private Network Access rules for LAN IPs. | Only loopback direct calls are supported; everything else goes through the tunnel. |

---

## 9. Decisions requested before Phase 0 starts

Only two answers block anything: **mount point (Q1)** and **DNS location (Q2)**. Everything else can start under the defaults and be adjusted later without rework.
