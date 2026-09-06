# MediaAPI-BYOK — Architecture and Implementation Plan (v2)

Status: v2, 2026-09-06. Supersedes v1. Built on the decisions below and on the provider research in
`docs/providers/*.md` and `docs/cloudflare-platform.md` (each file lists its sources and marks anything
unverified). Nothing is implemented yet; Phase 0 starts on approval of this document.

---

## 1. Decisions taken

| Topic | Decision |
|-------|----------|
| Mount point | `https://www.thewoovee.com/studio` (Worker route on the existing `www` host; the rest of `www` keeps serving whatever it serves today). |
| DNS | Zone `thewoovee.com` is already on Cloudflare; registration stays at Hostinger. No DNS move needed. |
| Audience | Closed group: you plus invited emails. Login is Cloudflare Access (email one-time PIN, optional Google). No passwords, no signup UI. |
| Keys | Stored **server-side, encrypted** (D1 + envelope encryption with a master key held only as a Worker secret). Users log in and see and manage only their own keys. |
| Providers | Selectable per user. The registry ships with every provider researched (22 cloud + 4 local); a user enables the ones they have keys for and the model picker shows only those. |
| Local stack | ComfyUI first (covers images and video), A1111/Forge second. SwarmUI and InvokeAI in a later wave. |
| Outputs | Download only. Media is never stored on the server; job metadata (prompt, params, provider job id) is stored per user so history follows you across devices. |
| Video via | fal.ai and BytePlus ModelArk direct for Seedance, plus Venice, xAI, Kling, MiniMax, Runway, Luma, Google Veo, Replicate, WaveSpeed. |
| PWA | Yes; it is cheap and makes phone use pleasant. |

Still to confirm (does not block Phase 0): **what serves `www.thewoovee.com` today** (Cloudflare Pages, an external host behind proxied DNS, or a Hostinger builder). The sandbox could not reach the site. The routing step in Phase 0 handles both cases and has a fallback.

---

## 2. What the research changed

The provider landscape moved a lot since the v1 draft. Facts that changed the design:

- **OpenAI's video API (Sora) is deprecated and shuts down 2026-09-24.** OpenAI is images only (`gpt-image-2`, `gpt-image-1.5`, `gpt-image-1`).
- **Google retired Imagen 4 and Veo 3.0.** What remains on the Gemini API is the native image models (`gemini-3.1-flash-image`, `gemini-3-pro-image-preview`, `gemini-2.5-flash-image`) and Veo 3.1. Google's API **allows browser calls** (verified CORS), so it can bypass the proxy.
- **xAI now has a full Grok Imagine API**: image 2.0 with edits, video 1.5 with text/image/audio input, video edit and video extension. Inputs accept base64. The old `grok-2-image` is retired.
- **Hugging Face Spaces must be called from the browser, not the Worker**: ZeroGPU's quota is per IP, so proxying would pool every user into one quota. Gradio's CORS is permissive by code, so direct calls work.
- **Several providers need public URLs for inputs** (Luma always; Runway above 5 MB; Leonardo has its own presigned upload flow). A small temporary-upload path on R2 is therefore in scope earlier than planned.
- **Output URLs expire fast**: BFL 10 minutes, Replicate 1 hour, xAI 1 to 24 hours, BytePlus about 24 hours. The job runner downloads the moment a job succeeds.
- **Many endpoints return raw bytes or multipart, not JSON**: Stability (multipart in, bytes out), Venice edit/upscale (bytes), Fireworks (bytes), Ideogram (multipart). The proxy must stream bodies untouched in both directions.
- **Some providers have non-standard verbs or auth**: Replicate's model search uses the `QUERY` verb; fal's header is `Authorization: Key id:secret`; Kling needs an HS256 JWT minted from an access key and secret; Runway requires an `X-Runway-Version` header.
- **Cloudflare specifics**: a path-scoped Access app on `www.thewoovee.com/studio` is supported; Worker routes on `www.thewoovee.com/studio*` are valid and most-specific wins; static asset requests are free and unlimited; D1 free tier (5M reads, 100k writes per day) is the right store for keys; the SPA fallback for assets always serves the root `index.html`, so the Worker serves `/studio/index.html` itself.

---

## 3. Architecture

```
 Browser (PC, phone)  ── https://www.thewoovee.com/studio ──►  Cloudflare Access (path-scoped, email OTP)
   │                                                                     │ Cf-Access-Jwt-Assertion
   │  React SPA (Vite, base /studio/)                                    ▼
   │  ├─ Provider registry + adapters (26)               ┌──────────────────────────────────────────┐
   │  ├─ Job runner (submit → poll → download)           │ Worker (Hono)  route www.thewoovee.com/studio* │
   │  ├─ Gallery of this session's downloads             │  static assets  /studio/*                 │
   │  └─ Transports:                                     │  /studio/api/health        (Access bypass)│
   │      • proxy  ──────────────────────────────────►   │  /studio/api/proxy/:provider/*  ─────────►│──► allowlisted provider hosts
   │      • direct ──► generativelanguage.googleapis.com │  /studio/api/fetch?url=         ─────────►│──► allowlisted output hosts
   │      • direct ──► *.hf.space (Gradio)               │  /studio/api/credentials, /local-servers, │
   │      • direct ──► http://localhost:8188 (ComfyUI)   │              /jobs, /me, /providers       │
   │      • direct ──► https://comfy.thewoovee.com       │  /studio/api/tmp/:id       (Access bypass)│──► R2 temp uploads (1 h TTL)
   │                    (cloudflared tunnel + Access)    │  D1: users, credentials, local_servers,   │
   │                                                     │      jobs, settings   ·  secret: KEK      │
   │                                                     └──────────────────────────────────────────┘
   └──► user's PC: ComfyUI :8188 / A1111 :7860  ◄── cloudflared ── comfy.thewoovee.com (Access service token)
```

### 3.1 Identity and login
- One Cloudflare Access self-hosted application scoped to `www.thewoovee.com/studio`. Policy: Allow → list of emails. Identity: One-time PIN (zero setup), optionally Google.
- Two tiny extra Access applications with a **Bypass** policy on `www.thewoovee.com/studio/api/health` and `www.thewoovee.com/studio/api/tmp` (more specific paths override the parent, no inheritance).
- The Worker verifies `Cf-Access-Jwt-Assertion` on every `/studio/api/*` request except the bypassed ones: signature against `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, `iss`, `aud` (the application AUD tag), `exp`. The `email` claim is the user id. Library: `jose`.
- Adding a friend is adding an email in Zero Trust. Removing them revokes access instantly.

### 3.2 Key storage (server-side, encrypted)
- D1 holds one row per credential. Envelope encryption:
  - `KEK` (256-bit) exists only as a Worker secret (`wrangler secret put KEK`), never in the repo or D1.
  - On a user's first save the Worker generates a per-user `DEK`, wraps it with the KEK (AES-GCM, random IV, AAD = email), stores the wrapped DEK with a `kek_version`.
  - Each credential is AES-GCM encrypted with the user's DEK, random 12-byte IV, AAD = `email|credential_id|provider_id`.
  - Rotation: introduce `KEK_V2`, rewrap DEKs lazily on next use, then retire `KEK_V1`. Credentials are untouched.
- A D1 dump alone is useless without the KEK; the KEK alone is useless without D1.
- **Reveal**: the owner can click "show" on their own credential; the Worker decrypts and returns it once. Other users only ever see label and last four characters. Reveal events are counted per user (visible in settings) as a light audit trail.
- **Inline keys**: "try without saving" sends `X-Credential-Inline` for that request only. Never persisted.
- **Secrets that must live in the browser**: Kling's JWT is minted client-side with WebCrypto from the stored access key and secret (fetched decrypted once per session over the Access-protected connection) so only the 30-minute JWT crosses the wire; tunnel service tokens are likewise fetched once per session because the browser talks to tunnel hosts directly.

### 3.3 Request flow
1. Browser → `POST /studio/api/proxy/fal/queue/fal-ai/...` with `X-Credential: <id>` (omit to use the user's default for that provider).
2. Worker: verify JWT → load credential → unwrap DEK → decrypt key → inject the provider's auth header (`Authorization: Bearer`, `Authorization: Key`, `x-key`, `Api-Key`, `x-goog-api-key`, ...) plus any fixed headers the provider needs (`X-Runway-Version`) → stream the request to the allowlisted host → stream the response back. `Cache-Control: no-store`. Nothing is buffered or logged beyond status code and byte counts.
3. Browser polls the provider's status endpoint the same way until done, then downloads outputs via `/studio/api/fetch?url=` (allowlisted output hosts; direct where CORS allows) and offers them for download. Job metadata is written to `/studio/api/jobs` at each state change.
4. Direct-transport providers (Google, HF Spaces, local, tunnel) skip step 2; the browser injects the header itself from the per-session decrypted copy.

### 3.4 Temporary uploads (for URL-only providers)
- `POST /studio/api/uploads` (Access-protected) stores the file in R2 under a 256-bit random id and returns `https://www.thewoovee.com/studio/api/tmp/<id>`.
- `GET /studio/api/tmp/<id>` is Access-bypassed, serves the object, and is the URL handed to Luma, Runway, Kling, etc. Objects are deleted by a Cron Trigger after 60 minutes (and on job completion). R2 free tier: 10 GB, plenty for transient inputs.
- Used only when the chosen provider cannot take base64 or has its own upload API. Providers with their own upload API (fal storage, Replicate files, Leonardo init-image, WaveSpeed tickets, Runway uploads, HF Spaces upload) use that instead.

### 3.5 Provider adapter interface

```ts
type Capability = 'text2image' | 'image2image' | 'inpaint' | 'upscale' | 'remove_bg'
                | 'text2video' | 'image2video' | 'video2video' | 'video_extend';

interface ProviderSpec {                    // static, shipped in the registry (shared by SPA and Worker)
  id: string; label: string; wave: 1 | 2 | 3;
  transport: 'proxy' | 'direct';
  hosts: string[];                          // allowlist, exact or '*.hf.space'
  auth: { header: string; scheme?: 'Bearer' | 'Key' | 'raw' | 'jwt-hs256'; extraHeaders?: Record<string,string>; help: string };
  outputHosts: string[];                    // allowlist for /api/fetch
  inputMode: ('base64' | 'url' | 'multipart' | 'own-upload')[];
  outputExpiry?: string;                    // '10m' | '1h' | '24h' ...
}

interface ProviderAdapter {
  spec: ProviderSpec;
  listModels(ctx: Ctx): Promise<ModelSpec[]>;                 // static list, or live catalogue
  submit(req: GenerateRequest, ctx: Ctx): Promise<JobHandle>; // outputs immediately, or a poll reference
  poll(h: JobHandle, ctx: Ctx): Promise<JobStatus>;
  cancel?(h: JobHandle, ctx: Ctx): Promise<void>;
}

interface ModelSpec { id: string; label: string; capabilities: Capability[]; params: ParamSchema; priceHint?: string; }
```

- `ParamSchema` is a small JSON-schema subset that renders the form; per-model constraints (allowed sizes, durations, resolutions, aspect ratios) come from the research docs and, where a catalogue API exists, from the provider at runtime: fal (`api.fal.ai/v1/models?expand=openapi-3.0`), Replicate (`/v1/search`, model schemas), Leonardo (`/platformModels`), Venice (`/models?type=image` with constraints), Google (`/v1beta/models`), Hugging Face Hub API, ComfyUI (`/object_info`), A1111 (`/sdapi/v1/sd-models`, samplers, upscalers).
- Adapters are thin: translate `GenerateRequest` into the provider's request, know the polling shape and status vocabulary, and normalise outputs to `{ kind: 'image' | 'video', source: 'url' | 'base64' | 'bytes', mime, data }`.
- Contract tests per adapter run against recorded fixtures in CI; live smoke tests are a manual script that uses your keys.

### 3.6 Provider matrix (from research; details and sources in `docs/providers/<id>.md`)

| Adapter | Transport | Image gen | Image edit | Video | Job model | Notable constraints | Wave |
|---------|-----------|-----------|------------|-------|-----------|---------------------|------|
| `xai` | proxy | grok-imagine-image-2.0 | edits (≤5 source images, no mask) | grok-imagine-video-1.5: t2v, i2v, audio, edit, extend; 1–15 s, up to 1080p | images sync; video async (`GET /v1/videos/{id}`) | video URLs expire 1–24 h; rate limits unpublished | 1 |
| `fal` | proxy (direct possible after preflight test) | Flux 1/2, Seedream 4/5, Nano Banana, Ideogram, Recraft, Qwen | Kontext, fill, upscalers | Seedance 1.x/2.x, Kling 2.x/3, Veo 3.1, Wan, LTX, Hailuo, Grok Imagine | queue API with returned status/result URLs | `Authorization: Key id:secret`; use returned URLs (paths are rewritten); live catalogue API | 1 |
| `google` | **direct** (CORS verified) | gemini-3.1-flash-image, gemini-3-pro-image-preview | multi-image edit via generateContent, no mask | Veo 3.1 / fast / lite: t2v, i2v, first+last frame, refs, extend | images sync; Veo long-running operation polling | download of video needs the API key header; retained 2 days | 1 |
| `openai` | proxy | gpt-image-2 (arbitrary WxH), 1.5, 1, mini | `/images/edits` with mask, ≤16 images, input_fidelity | none (Sora shut down 2026-09-24) | sync, base64 output | always send `model`; per-token pricing | 1 |
| `hf-inference` | proxy | via router: hf-inference (CPU-class), fal-ai, replicate, together, nscale, wavespeed | image-to-image where provider supports | text-to-video via fal-ai/replicate/etc. | provider-dependent; fal via router is a queue | model must be the provider's `providerId` from the Hub mapping; free credit $0.10/month | 2 |
| `hf-space` | **direct** (per-IP ZeroGPU quota) | any Gradio Space | any | any | `/gradio_api/call` + SSE events | introspect `/gradio_api/info`; map params by name; cold starts; PAUSED spaces cannot be woken | 2 |
| `replicate` | proxy (no CORS) | flux family, seedream, many | yes | seedance, kling, veo, wan, minimax | `Prefer: wait` then poll `urls.get` | outputs expire in 1 h; `QUERY` verb for search; data URLs < 1 MB | 1 |
| `runpod` | proxy | Public Endpoints (flux-dev, schnell, kontext) and your own serverless endpoints (worker-comfyui) | via ComfyUI workflows | WAN 2.2 public endpoint, ComfyUI video workflows | `/run` + `/status/{id}` | 10 MB payload on `/run`, 20 MB on `/runsync` (counts outputs) → S3 output for video; idle endpoints scale to 0 after 7 days | 2 |
| `byteplus-ark` | proxy | Seedream 4.0/4.5/5.0 | Seedream image-to-image, sequential sets | Seedance 1.0/1.5 pro, 2.0/2.5; first/last frame, refs, audio | video tasks with `GET /tasks/{id}` | Seedance 1.x params are appended to the prompt text, 2.x are JSON fields; send `watermark:false`; models may need console activation | 2 |
| `venice` | proxy | many models incl. Flux 2, Nano Banana, GPT-image, Seedream | edit, multi-edit, upscale (raw bytes) | async queue (`/video/queue`, poll via POST `/video/retrieve`) | mixed JSON / bytes | no free tier; `safe_mode` and watermark default on; `/models` exposes constraints | 2 |
| `kling` | proxy (JWT minted in browser) | kling image models | expand, omni-image, try-on | t2v, i2v, multi-image, extend, lip-sync, effects; v2.1–v3 | poll create path + task id; status `succeed` | HS256 JWT auth; Kling 3.0 Turbo has a different schema; base64 without `data:` prefix | 2 |
| `minimax` | proxy | image-01 | – | Hailuo 2.3 / 02, Director, S2V; v2 API for H3 | task id → query → file retrieve | keys are host-bound (global vs mainland); `base_resp.status_code` must be 0 | 3 |
| `runway` | proxy | gen4_image(_turbo) with reference tags | – | gen4.5 t2v, gen4_turbo i2v, aleph2 v2v, character performance, upscales; also hosts Veo, Hailuo, Seedance, Wan | `GET /v1/tasks/{id}`; `DELETE` cancels | `X-Runway-Version: 2024-11-06` required; data URI ≤5 MB else URL or `/v1/uploads` | 3 |
| `luma` | proxy | photon-1, photon-flash-1 with image/style/character refs | modify_image_ref, reframe | ray-2, ray-flash-2: keyframes, loop, extend, modify, upscale, audio | `GET /generations/{id}` | **inputs must be public URLs** → temp uploads | 3 |
| `stability` | proxy | ultra, core, sd3.5 | erase, inpaint, outpaint, search-replace, recolor, remove-bg, relight, control | image-to-video (1024×576 / 576×1024 / 768×768 only) | mostly sync; 3 async endpoints (`202` until done) | everything is multipart; bytes or base64 output; failures not charged | 2 |
| `bfl` | proxy | flux-pro-1.1, ultra, kontext-pro/max, flux-2 family, klein | fill, expand, canny, depth; flux-2 edits via `input_image` | flux-3-video (t2v, i2v, v2v, audio) | `{id, polling_url}` → poll verbatim | **result URL expires in 10 min**; moderation is a poll status; regional bases | 2 |
| `ideogram` | proxy | v3 generate (rendering speeds) | inpaint (black = edit area), remix, reframe, replace-bg, upscale, describe | – | sync multipart | unsafe images come back as `url: null` inside 200 | 3 |
| `recraft` | proxy | v4/v3 raster and vector, custom styles, brand controls | image-to-image, inpaint, vectorize, remove-bg, upscales | – | sync | vector output selected by style; URLs live ~24 h; `b64_json` avoids refetch | 3 |
| `leonardo` | proxy | Phoenix, Lucid Origin, Flux (UUID ids from `/platformModels`) | init-image flows, upscalers, unzoom, nobg | Motion 2, Veo 3, Kling 2.1/2.5 via Leonardo | `GET /generations/{id}` PENDING/COMPLETE/FAILED | no inline images: presigned S3 upload flow; `alchemy` and `num_images:4` default on | 3 |
| `wavespeed` | proxy | flux, seedream | yes | Seedance, Kling 3, Wan | `POST /api/v3/{model}` → `/predictions/{id}/result` | keys dead until first top-up; failed jobs return HTTP 200; no cancel | 3 |
| `together` | proxy | FLUX incl. free schnell | Kontext | `/v2/videos`: Sora 2, Veo, Seedance 2.5, Wan | sync images; video poll | `response_format: base64` not `b64_json` | 3 |
| `fireworks` | proxy | flux dev/schnell (bytes), Kontext async | Kontext | – | sync bytes / `get_result` | per-step pricing | 3 |
| `openai-compat` | proxy or direct | any `/v1/images/generations` server | `/v1/images/edits` | – | sync | covers LocalAI, gateways, RunPod vllm-omni | 2 |
| `comfyui` | **direct** | any workflow | any workflow | Wan, LTX, Hunyuan workflows | `POST /prompt` → poll `/history/{id}` | needs `--enable-cors-header`; upload via `/upload/image`; outputs via `/view` | 1 |
| `a1111` | **direct** | txt2img | img2img, inpaint, extras upscale | – | sync + `/progress` | needs `--api --cors-allow-origins`; base64 in and out | 2 |
| `swarmui`, `invokeai` | direct | yes | yes | yes | session / queue APIs | assess after wave 2 | 3 |

Wave 1 gives image generation and editing on four cloud providers plus ComfyUI, and video on xAI, fal, Google and Replicate. That already covers Seedance (via fal and Replicate), Kling, Veo, Wan and Grok Imagine.

### 3.7 Local servers
- **Same PC**: the SPA calls `http://localhost:8188` / `http://127.0.0.1:7860` directly. Chrome and Firefox exempt loopback from mixed-content blocking; Safari is the exception and gets a warning in the UI. LAN IPs (`192.168.x.x`) are not supported directly; use the tunnel.
- **From anywhere**: a named Cloudflare Tunnel on the PC maps `comfy.thewoovee.com → http://localhost:8188` and `sd.thewoovee.com → http://localhost:7860`, runs as a Windows service, and sits behind an Access application with an Allow-by-email policy plus a **service token**. The app stores the tunnel URL and service token (encrypted) and sends `CF-Access-Client-Id/Secret` headers.
- ComfyUI launch flags: `--listen 127.0.0.1 --enable-cors-header https://www.thewoovee.com`. A1111/Forge: `--api --listen --cors-allow-origins=https://www.thewoovee.com`.
- Health pings every 15 s drive an online/offline badge; jobs targeting an offline server stay queued locally until it is back.
- Exact flag semantics, Access CORS settings for preflight, and the Chrome local-network permission model are documented in `docs/providers/local-access.md`.

### 3.8 Data model (D1)

```sql
CREATE TABLE users (
  email TEXT PRIMARY KEY, wrapped_dek BLOB NOT NULL, dek_iv BLOB NOT NULL, kek_version INTEGER NOT NULL,
  created_at INTEGER NOT NULL, last_seen_at INTEGER, reveal_count INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE credentials (
  id TEXT PRIMARY KEY, email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  provider_id TEXT NOT NULL, label TEXT NOT NULL, last4 TEXT NOT NULL,
  ciphertext BLOB NOT NULL, iv BLOB NOT NULL, is_default INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX credentials_by_user ON credentials(email, provider_id);
CREATE TABLE local_servers (
  id TEXT PRIMARY KEY, email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  kind TEXT NOT NULL,                -- comfyui | a1111 | openai-compat | swarmui | invokeai
  label TEXT NOT NULL, base_url TEXT NOT NULL,
  auth_ciphertext BLOB, auth_iv BLOB, -- service token / basic auth / api key, encrypted with the user's DEK
  created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE TABLE user_settings (email TEXT PRIMARY KEY REFERENCES users(email) ON DELETE CASCADE, json TEXT NOT NULL, updated_at INTEGER NOT NULL);
CREATE TABLE jobs (                    -- metadata only; media never touches the server
  id TEXT PRIMARY KEY, email TEXT NOT NULL REFERENCES users(email) ON DELETE CASCADE,
  provider_id TEXT NOT NULL, model_id TEXT NOT NULL, capability TEXT NOT NULL,
  request_json TEXT NOT NULL, provider_ref_json TEXT, status TEXT NOT NULL,
  outputs_json TEXT, error TEXT, cost_hint TEXT, created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX jobs_by_user_time ON jobs(email, created_at DESC);
CREATE TABLE temp_uploads (id TEXT PRIMARY KEY, email TEXT NOT NULL, r2_key TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL, expires_at INTEGER NOT NULL);
```

### 3.9 API surface (all under `/studio/api`)

| Method | Path | Access | Purpose |
|--------|------|--------|---------|
| GET | `/health` | bypass | build sha, D1 ping |
| GET | `/me` | JWT | email, enabled providers, kek version |
| GET | `/providers` | JWT | registry: ids, labels, capabilities, auth hints, allowlisted hosts |
| GET, POST | `/credentials` | JWT | list (masked), create |
| PATCH, DELETE | `/credentials/:id` | JWT | rename, set default, delete |
| POST | `/credentials/:id/reveal` | JWT | plaintext once; counted |
| GET, POST, PATCH, DELETE | `/local-servers[/:id]` | JWT | manage local/tunnel servers; GET returns decrypted auth to the owner |
| ANY | `/proxy/:provider/*` | JWT | authenticated pass-through to allowlisted hosts; forwards method (incl. `QUERY`), streamed body, allowlisted headers |
| GET | `/fetch?url=` | JWT | stream an output file from an allowlisted output host |
| POST | `/uploads` | JWT | temp upload → R2, returns `/tmp/:id` URL |
| GET | `/tmp/:id` | bypass | serve temp upload to providers; unguessable id; 1 h TTL |
| GET, POST, PATCH | `/jobs[/:id]` | JWT | job metadata history |

Proxy header allowlist (request): `content-type`, `accept`, `prefer`, `x-runway-version`, `x-fal-*`, `content-length`, plus the injected auth header. Everything else (cookies, `cf-*`, `x-forwarded-*`) is stripped. Response headers pass through except `set-cookie`.

### 3.10 Security summary
- Access in front of everything; JWT verified in the Worker; API unreachable without both.
- Keys encrypted at rest with per-user DEKs under a KEK that lives only in Worker secrets. Reveal is owner-only and counted.
- Strict host allowlist on the proxy; no arbitrary URL fetch. `/fetch` and `/tmp` have their own allowlists and TTLs.
- CSP: `connect-src 'self' https://generativelanguage.googleapis.com https://*.hf.space http://localhost:* http://127.0.0.1:*` plus the user's configured tunnel hosts injected at runtime from settings; `default-src 'self'`; no third-party scripts except `@gradio/client` from jsdelivr if used.
- `Cache-Control: no-store` on all API responses; no logging of headers or bodies; Workers observability logs status and latency only.
- Dependency audit in CI; Dependabot on.

---

## 4. Repository layout

```
MediaAPI-BYOK/
├─ package.json                 # pnpm; scripts: dev, build, test, lint, typecheck, migrate, deploy
├─ wrangler.jsonc               # main, assets, routes, d1, r2, vars, triggers
├─ vite.config.ts               # react + @cloudflare/vite-plugin, base '/studio/'
├─ src/                         # SPA
│  ├─ app/                      # router (basename /studio), layout, screens: Generate, Edit, Video, History, Providers, Local, Settings
│  ├─ components/
│  ├─ providers/                # registry.ts + one folder per adapter (26)
│  ├─ jobs/                     # runner, polling, persistence, download
│  ├─ transport/                # proxyFetch, directFetch, health
│  └─ pwa/
├─ worker/
│  ├─ index.ts                  # Hono app, SPA fallback for /studio/*
│  ├─ access.ts                 # JWT verification (jose)
│  ├─ crypto.ts                 # envelope encryption (WebCrypto)
│  ├─ proxy.ts                  # allowlist + streaming forward + header injection
│  ├─ routes/                   # credentials, local-servers, jobs, uploads, tmp, fetch
│  └─ migrations/               # D1 SQL migrations
├─ shared/                      # ProviderSpec registry, types shared by SPA and Worker
├─ docs/                        # PLAN.md, cloudflare-platform.md, providers/*.md, local-servers guide
├─ scripts/                     # live smoke tests (use your keys locally), preflight-cors.sh
└─ .github/workflows/           # ci.yml, deploy.yml
```

---

## 5. Phases

### Phase 0 — Skeleton, routing, login (2–3 days)
1. Scaffold Vite + React + Worker with `@cloudflare/vite-plugin`; verify `base: '/studio/'` works with the plugin (flagged unverified in research). Fallback: Worker strips the prefix before `env.ASSETS.fetch`.
2. Hono app with `/studio/api/health` and SPA fallback to `/studio/index.html`.
3. **Routing probe**: deploy with route `www.thewoovee.com/studio-probe*` first. If `www` is a Pages custom domain and the route does not intercept, switch to `studio.thewoovee.com` as a Worker custom domain and link it from the main site. Then move to `/studio` + `/studio/*`.
4. Access application on `www.thewoovee.com/studio` (OTP, your email), Bypass apps on `/studio/api/health` and `/studio/api/tmp`. Worker JWT verification wired; `/me` returns your email.
5. GitHub Actions: CI (lint, typecheck, vitest) on PRs; deploy on `main`; preview `versions upload` on PRs.
6. D1 database created, migrations applied in CI, `KEK` secret set.
**Exit:** email OTP login, app shell at `/studio`, `/me` shows your email, PR previews work.

### Phase 1 — Keys, proxy, first generations (1 week)
1. Credentials UI and API with envelope encryption; masked list, reveal, default per provider.
2. Proxy with per-provider allowlists, header injection, streaming, `QUERY` support; `/fetch` for outputs.
3. Adapters: `openai-compat` (with xAI and OpenAI presets), `xai` (image + video), `fal` (queue, storage upload, live catalogue), `google` (direct; image + Veo 3.1), `replicate`, `comfyui` (localhost; workflow templates for txt2img, img2img, Wan i2v).
4. Generate screen (image and video tabs) with schema-driven forms; job runner with persistence and download; History screen from `/jobs`.
5. PWA manifest and service worker.
**Exit:** generate images and videos from phone and PC on five cloud providers and on local ComfyUI; reload mid-job and see it finish; keys visible only after login.

### Phase 2 — Editing, more providers, tunnel (2 weeks)
1. Edit screen: upload, mask painting, inpaint / img2img / upscale / remove-bg across OpenAI, xAI, fal, Stability, BFL, Google.
2. Temp uploads on R2 with TTL cron, for URL-only providers.
3. Adapters: `byteplus-ark` (Seedream + Seedance with both parameter styles), `venice`, `kling` (browser-minted JWT), `stability`, `bfl`, `hf-inference`, `hf-space` (introspection + presets), `runpod` (public endpoints + worker-comfyui), `a1111`.
4. Local access guide and UI: tunnel setup wizard, service token storage, health badges; `docs/local-servers.md`.
5. Job cancel where supported; cost hints per model from research tables.
**Exit:** edit images with masks; Seedance via BytePlus directly; ComfyUI reachable from the phone through the tunnel; Gradio Spaces usable by URL.

### Phase 3 — Long tail and polish (ongoing)
1. Adapters: `minimax`, `runway`, `luma`, `ideogram`, `recraft`, `leonardo`, `wavespeed`, `together`, `fireworks`, `swarmui`, `invokeai`.
2. Prompt library, presets, batch runs, side-by-side compare, per-provider spend estimate.
3. KEK rotation runbook; export of job history; optional public mode design (Turnstile + rate limits) if ever wanted.

---

## 6. Deployment plan (Cloudflare + GitHub)

### 6.1 One-time Cloudflare setup
1. Confirm the zone is active and note which product serves `www` today (Pages custom domain, external origin, other).
2. API token from the **Edit Cloudflare Workers** template (includes Workers Scripts and Zone → Workers Routes edit). Add **D1 → Edit** and **R2 → Edit** at account scope. Note the Account ID.
3. Zero Trust: create the team domain; add the three Access applications from section 3.1; copy the main application's AUD tag.
4. `wrangler d1 create mediaapi-byok`, `wrangler r2 bucket create mediaapi-byok-tmp`; put ids in `wrangler.jsonc`.
5. `wrangler secret put KEK` with 32 random bytes base64 (generate locally with `openssl rand -base64 32`). Keep a copy in your password manager; losing it makes stored keys unrecoverable.

### 6.2 GitHub setup
- Repository secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`. Variables: `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`.
- Branch protection on `main`: CI required. Deploy job runs `wrangler d1 migrations apply --remote` then `wrangler deploy` using `cloudflare/wrangler-action`.
- PRs: `wrangler versions upload` posts a preview URL (`<alias>-mediaapi-byok.<subdomain>.workers.dev`). Previews do not exercise the zone route; they can be placed behind Access too.
- Rollback: `wrangler rollback` or redeploy an earlier commit.

### 6.3 wrangler.jsonc essentials
```jsonc
{
  "name": "mediaapi-byok",
  "main": "worker/index.ts",
  "compatibility_date": "2026-09-01",
  "compatibility_flags": ["nodejs_compat"],
  "assets": { "directory": "dist/client", "binding": "ASSETS", "run_worker_first": ["/studio/api/*", "/studio", "/studio/"] },
  "routes": [
    { "pattern": "www.thewoovee.com/studio",   "zone_name": "thewoovee.com" },
    { "pattern": "www.thewoovee.com/studio/*", "zone_name": "thewoovee.com" }
  ],
  "d1_databases": [{ "binding": "DB", "database_name": "mediaapi-byok", "database_id": "<id>", "migrations_dir": "worker/migrations" }],
  "r2_buckets": [{ "binding": "TMP", "bucket_name": "mediaapi-byok-tmp" }],
  "triggers": { "crons": ["*/15 * * * *"] },
  "vars": { "ACCESS_TEAM_DOMAIN": "<team>.cloudflareaccess.com", "ACCESS_AUD": "<aud>" },
  "observability": { "enabled": true }
}
```
Two route patterns are used instead of `/studio*` so that `/studio-something` on the main site is not captured.

### 6.4 Local development
- `pnpm dev`: Vite serves the SPA and runs the Worker in workerd, with `/studio/api/*` live, a local D1, a local R2 and a dev flag that trusts a fixed email instead of an Access JWT (localhost only, refused in production builds).
- Provider keys are entered through the UI in dev too; nothing goes in `.dev.vars` except a dev `KEK`.

### 6.5 Free-tier budget

| Resource | Free limit | Expected |
|----------|-----------|----------|
| Worker requests (non-asset) | 100k / day | hundreds to low thousands on a busy day, polls included |
| Worker CPU | 10 ms / request | proxying is I/O; JWT verify and AES-GCM are well under 1 ms |
| Subrequests / concurrent connections | 50 / 6 per request | one per proxied call |
| Static assets | unlimited, free | – |
| D1 | 5M reads, 100k writes / day, 5 GB | job metadata is the only steady writer |
| R2 | 10 GB, 10M reads / month | transient inputs, deleted hourly |
| Access | 50 seats | your group |
| Tunnel, Cron (5) | free | – |

If usage ever exceeds free, Workers Paid is $5/month and lifts every limit above.

---

## 7. Risks and mitigations

| Risk | Mitigation |
|------|-----------|
| Worker route does not intercept `/studio` on an existing Pages custom domain (undocumented case). | Phase 0 probe; fallback to `studio.thewoovee.com` with a link from the main site. |
| `@cloudflare/vite-plugin` `base` support (unverified). | Test in the first hour of Phase 0; fallback is prefix stripping in the Worker. |
| Provider APIs churn (they did between v1 and v2 of this plan). | Adapters are data-driven; live catalogues where offered; each spec doc has a "last verified" date; contract tests on fixtures. |
| Fast-expiring output URLs (BFL 10 min). | Download immediately on success, before notifying the UI. |
| Providers that need public input URLs. | Temp uploads on R2 with unguessable ids and 1 h TTL; own-upload APIs preferred where they exist. |
| Loss of the KEK. | Keep it in a password manager; document rotation; the app shows a warning if `kek_version` is unknown. |
| Safari blocks loopback calls from HTTPS. | UI warning; use the tunnel hostname even on the same machine, or Chrome/Firefox. |
| Subrequest timeout on very slow sync providers (undocumented, roughly 100 s). | Prefer async modes everywhere they exist; sync-only endpoints (Stability, Ideogram, Recraft) return well under that. |
| ZeroGPU quotas on Spaces. | Direct browser calls with the user's HF token; fallback provider suggestion on quota errors. |

---

## 8. Open items for you

1. What serves `www.thewoovee.com` today (Pages, external origin, Hostinger builder)?
2. Do you want Google login in addition to email one-time PIN?
3. Which providers do you personally hold keys for right now? Those get smoke-tested first.
4. Approve this plan to start Phase 0.
