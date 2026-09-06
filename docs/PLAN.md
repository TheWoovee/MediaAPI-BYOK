# MediaAPI-BYOK — Architecture and Implementation Plan (v2)

Status: v2.1, 2026-09-06. Supersedes v1. Feasibility of the risky parts has been verified by a running spike, see `docs/feasibility.md`; account-side setup steps are in `docs/setup-cloudflare.md`. Built on the decisions below and on the provider research in
`docs/providers/*.md` and `docs/cloudflare-platform.md` (each file lists its sources and marks anything
unverified). Nothing is implemented yet; Phase 0 starts on approval of this document.

---

## 1. Decisions taken

| Topic | Decision |
|-------|----------|
| Mount point | `https://www.thewoovee.com/studio` (Worker route on the existing `www` host, which is a **Cloudflare Pages project deployed from GitHub**; Pages keeps serving every other path and is not modified). |
| DNS | Zone `thewoovee.com` is already on Cloudflare; registration stays at Hostinger. No DNS move needed. |
| Audience | Closed group: you plus invited emails. Login is Cloudflare Access with **email one-time PIN from day one and Google login added** (10-minute OAuth client setup, see `docs/setup-cloudflare.md`). No passwords, no signup UI. |
| Keys | Stored **server-side, encrypted** (D1 + envelope encryption with a master key held only as a Worker secret). Users log in and see and manage only their own keys. |
| Providers | Selectable per user. The registry ships with every provider researched (23 cloud + 4 local); a user enables the ones they have keys for and the model picker shows only those. **First to be smoke-tested with real keys: xAI, Hugging Face, RunPod, plus Cloudflare Workers AI which is free inside the same account.** |
| Local stack | ComfyUI first (covers images and video), A1111/Forge second. SwarmUI optional in a later wave; InvokeAI skipped (graph API churns too much). |
| Outputs | Download only. Media is never stored on the server; job metadata (prompt, params, provider job id) is stored per user so history follows you across devices. |
| Video via | fal.ai and BytePlus ModelArk direct for Seedance, plus Venice, xAI, Kling, MiniMax, Runway, Luma, Google Veo, Replicate, WaveSpeed. |
| PWA | Yes; it is cheap and makes phone use pleasant. |

Confirmed: `www` is Cloudflare Pages linked to GitHub, Hostinger holds only the domain registration. The one remaining account-side unknown is whether a Worker route intercepts `/studio` on a Pages custom domain; Cloudflare's routing doc says routes take precedence on a shared hostname, and Phase 0 starts with a probe route with `studio.thewoovee.com` as the fallback.

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
- **ComfyUI's CORS is single-origin and only allows the `Content-Type` and `Authorization` request headers**, and Cloudflare Access answers browser preflights with 403 unless the app is configured for it. Sending Access service-token headers from the browser to a tunnelled ComfyUI therefore fails. Tunnel-hosted servers are relayed through the Worker instead, which also keeps service tokens off the browser entirely.
- **Chrome 142+ shows a Local Network Access permission prompt** when a public HTTPS page calls `http://localhost`; Firefox allows it silently; **Safari still blocks it**. Same-PC mode explains the prompt and Safari users use the tunnel.
- **Cloudflare's proxy read timeout is 125 s** for any single response through a tunnel. ComfyUI is async (submit then poll) so it is unaffected; A1111's synchronous `txt2img` is, so long A1111 jobs are for `localhost` only.
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
- **No secret ever needs to reach the browser.** Kling's HS256 JWT is minted by the Worker at proxy time from the stored access key and secret. Tunnel service tokens are injected by the Worker on the local-server relay. The only credentials the browser handles are the ones the user is typing in, and the Google API key for the direct Google transport, which the user can opt to route through the proxy instead.

### 3.3 Request flow
1. Browser → `POST /studio/api/proxy/fal/queue/fal-ai/...` with `X-Credential: <id>` (omit to use the user's default for that provider).
2. Worker: verify JWT → load credential → unwrap DEK → decrypt key → inject the provider's auth header (`Authorization: Bearer`, `Authorization: Key`, `x-key`, `Api-Key`, `x-goog-api-key`, ...) plus any fixed headers the provider needs (`X-Runway-Version`) → stream the request to the allowlisted host → stream the response back. `Cache-Control: no-store`. Nothing is buffered or logged beyond status code and byte counts.
3. Browser polls the provider's status endpoint the same way until done, then downloads outputs via `/studio/api/fetch?url=` (allowlisted output hosts; direct where CORS allows) and offers them for download. Job metadata is written to `/studio/api/jobs` at each state change.
4. Direct-transport providers (Google, HF Spaces, same-PC local servers) skip step 2; the browser adds the header itself. Google's key is fetched decrypted once per session for this purpose only if the user enables direct mode; the default routes Google through the proxy like everyone else.
5. Tunnel-hosted local servers go through `/studio/api/local/:serverId/*`: the Worker looks up the server, injects `CF-Access-Client-Id/Secret`, and streams to the user's `https://` base URL. ComfyUI sees a plain server-to-server request with no `Origin` header, so no CORS setup is needed on the tunnel path at all.

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
| `cf-workers-ai` | Worker binding (owner) or proxy (REST with a Cloudflare API token) | flux-1-schnell, flux-2-klein-4b/9b, flux-2-dev, Leonardo lucid-origin and phoenix-1.0, SDXL | flux-2 models accept input images; SD 1.5 img2img and inpainting | – | sync, base64 JSON output | **10,000 neurons/day free** (roughly 100+ schnell images); no key needed for you, others use a Cloudflare API token | 1 |
| `openai` | proxy | gpt-image-2 (arbitrary WxH), 1.5, 1, mini | `/images/edits` with mask, ≤16 images, input_fidelity | none (Sora shut down 2026-09-24) | sync, base64 output | always send `model`; per-token pricing | 1 |
| `hf-inference` | proxy | via router: hf-inference (CPU-class), fal-ai, replicate, together, nscale, wavespeed | image-to-image where provider supports | text-to-video via fal-ai/replicate/etc. | provider-dependent; fal via router is a queue | model must be the provider's `providerId` from the Hub mapping; free credit $0.10/month | 2 |
| `hf-space` | **direct** (per-IP ZeroGPU quota) | any Gradio Space | any | any | `/gradio_api/call` + SSE events | introspect `/gradio_api/info`; map params by name; cold starts; PAUSED spaces cannot be woken | 2 |
| `replicate` | proxy (no CORS) | flux family, seedream, many | yes | seedance, kling, veo, wan, minimax | `Prefer: wait` then poll `urls.get` | outputs expire in 1 h; `QUERY` verb for search; data URLs < 1 MB | 1 |
| `runpod` | proxy | Public Endpoints (flux-dev, schnell, kontext) and your own serverless endpoints (worker-comfyui) | via ComfyUI workflows | WAN 2.2 public endpoint, ComfyUI video workflows | `/run` + `/status/{id}` | 10 MB payload on `/run`, 20 MB on `/runsync` (counts outputs) → S3 output for video; idle endpoints scale to 0 after 7 days | 2 |
| `byteplus-ark` | proxy | Seedream 4.0/4.5/5.0 | Seedream image-to-image, sequential sets | Seedance 1.0/1.5 pro, 2.0/2.5; first/last frame, refs, audio | video tasks with `GET /tasks/{id}` | Seedance 1.x params are appended to the prompt text, 2.x are JSON fields; send `watermark:false`; models may need console activation | 2 |
| `venice` | proxy | many models incl. Flux 2, Nano Banana, GPT-image, Seedream | edit, multi-edit, upscale (raw bytes) | async queue (`/video/queue`, poll via POST `/video/retrieve`) | mixed JSON / bytes | no free tier; `safe_mode` and watermark default on; `/models` exposes constraints | 2 |
| `kling` | proxy (JWT minted by the Worker) | kling image models | expand, omni-image, try-on | t2v, i2v, multi-image, extend, lip-sync, effects; v2.1–v3 | poll create path + task id; status `succeed` | HS256 JWT auth; Kling 3.0 Turbo has a different schema; base64 without `data:` prefix | 2 |
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
| `comfyui` | direct (localhost) or relay (tunnel) | any workflow | any workflow | Wan, LTX, Hunyuan workflows | `POST /prompt` → poll `/history/{id}` | localhost needs `--enable-cors-header <origin>` (single origin); relay needs nothing; upload via `/upload/image`; outputs via `/view` | 1 |
| `a1111` | direct or relay | txt2img | img2img, inpaint, extras upscale | – | sync + `/progress` | needs `--api --cors-allow-origins`; base64 in and out | 2 |
| `swarmui` | relay/direct | yes | yes | yes | session API, sync generate, no documented CORS | optional in wave 3; InvokeAI skipped (graph API churn) | 3 |

Wave 1 gives image generation and editing on five cloud providers plus ComfyUI, and video on xAI, fal, Google and Replicate. Cloudflare Workers AI is the zero-cost smoke-test target because it needs no external account. That already covers Seedance (via fal and Replicate), Kling, Veo, Wan and Grok Imagine.

### 3.7 Local servers
Two access modes, chosen per saved server:

**Same PC (direct, `http://localhost`)**
- The SPA calls `http://localhost:8188` (ComfyUI) or `http://127.0.0.1:7860` (A1111) directly. Chrome, Edge and Firefox allow loopback from an HTTPS page; Chrome 142+ asks once with a Local Network Access permission prompt, which the UI explains. **Safari blocks it**; Safari users get a message pointing to the tunnel mode.
- ComfyUI must run with `--enable-cors-header https://www.thewoovee.com` (exactly one origin; it answers OPTIONS itself and allows only `Content-Type` and `Authorization` headers, which is all the direct mode sends). A1111/Forge: `--api --cors-allow-origins=https://www.thewoovee.com` (lists and regex supported). The Local Servers screen shows the exact command line for each server kind.
- LAN addresses (`192.168.x.x`) are blocked by browsers everywhere; not supported.

**From anywhere (relay through the Worker)**
- On the PC a named Cloudflare Tunnel maps `comfy.thewoovee.com → http://localhost:8188` (and `sd.thewoovee.com → :7860`), runs as a Windows service, and sits behind an Access application with a **Service Auth** policy for a service token. ComfyUI binds to `127.0.0.1` only; the internet sees only Cloudflare.
- The browser never talks to the tunnel host. It calls `/studio/api/local/:serverId/*`; the Worker injects the service token and streams the request. No CORS flags are needed for this mode, Safari works, and the service token stays server-side. The relay only forwards to `https://` base URLs saved by that user.
- Because tunnel hostnames must live in the zone owner's Cloudflare account, invited users who want their own PC reachable enter any `https://` base URL of their own: their own domain and tunnel, a quick tunnel (`*.trycloudflare.com`, no auth), or a Tailscale Funnel (`*.ts.net`, no built-in auth). The relay accepts them; the guide recommends adding a ComfyUI login or keeping the exposure short-lived.
- Cloudflare's 125 s proxy timeout applies per response. ComfyUI is submit-then-poll and unaffected. A1111's synchronous generate is affected, so the UI warns when a remote A1111 job is likely to exceed two minutes.
- Health pings every 15 s drive an online/offline badge; jobs targeting an offline server stay queued locally until it is back.
- ComfyUI outputs are read from `GET /history/{prompt_id}` (`images[]`, with `animated: [true]` for core `SaveVideo`, and `gifs[]` for VHS `VideoCombine`) and fetched through `/view`. Polling is preferred over the WebSocket for a browser app.
- Full flag semantics, Access CORS settings, browser rules with versions, and the tunnel and Tailscale setup steps are in `docs/providers/local-access.md`, `comfyui.md` and `a1111-forge.md`.

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
  kind TEXT NOT NULL,                -- comfyui | a1111 | openai-compat | swarmui
  label TEXT NOT NULL, base_url TEXT NOT NULL,
  mode TEXT NOT NULL,                -- direct (localhost) | relay (https via Worker)
  auth_ciphertext BLOB, auth_iv BLOB, -- service token / basic auth / api key, encrypted with the user's DEK; used by the relay only
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
| ANY | `/local/:serverId/*` | JWT | relay to one of the user's saved `https://` local servers, injecting its stored auth (Access service token, basic auth or API key) |
| GET | `/fetch?url=` | JWT | stream an output file from an allowlisted output host |
| POST | `/uploads` | JWT | temp upload → R2, returns `/tmp/:id` URL |
| GET | `/tmp/:id` | bypass | serve temp upload to providers; unguessable id; 1 h TTL |
| GET, POST, PATCH | `/jobs[/:id]` | JWT | job metadata history |

Proxy header allowlist (request): `content-type`, `accept`, `prefer`, `x-runway-version`, `x-fal-*`, `content-length`, plus the injected auth header. Everything else (cookies, `cf-*`, `x-forwarded-*`) is stripped. Response headers pass through except `set-cookie`.

### 3.10 Security summary
- Access in front of everything; JWT verified in the Worker; API unreachable without both.
- Keys encrypted at rest with per-user DEKs under a KEK that lives only in Worker secrets. Reveal is owner-only and counted.
- Strict host allowlist on the proxy; no arbitrary URL fetch. `/fetch` and `/tmp` have their own allowlists and TTLs.
- CSP: `connect-src 'self' https://generativelanguage.googleapis.com https://*.hf.space http://localhost:* http://127.0.0.1:*` (tunnel hosts are never contacted by the browser, so the CSP is static); `default-src 'self'`; no third-party scripts except `@gradio/client` from jsdelivr if used.
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
1. Promote `spike/` to the real skeleton: Vite + React + Worker with `@cloudflare/vite-plugin`, `base: '/studio/'`, post-build move of the client bundle under `dist/client/studio/`, SPA fallback that fetches `/studio/` from the asset binding (all verified in `docs/feasibility.md`).
2. Hono app with `/studio/api/health` and SPA fallback to `/studio/index.html`.
3. **Routing probe**: deploy with routes `www.thewoovee.com/__studio-probe` and `/__studio-probe/*` first. If the route intercepts in front of Pages, switch to `/studio` + `/studio/*`; if not, use `studio.thewoovee.com` as a Worker custom domain and link it from the main site.
4. Access application on `www.thewoovee.com/studio` (one-time PIN and Google, your email), Bypass apps on `/studio/api/health` and `/studio/api/tmp`; steps in `docs/setup-cloudflare.md`, optionally scripted. Worker JWT verification wired (unit-tested in the spike); `/me` returns your email.
5. GitHub Actions: CI (lint, typecheck, vitest) on PRs; deploy on `main`; preview `versions upload` on PRs.
6. D1 database created, migrations applied in CI, `KEK` secret set.
**Exit:** email OTP login, app shell at `/studio`, `/me` shows your email, PR previews work.

### Phase 1 — Keys, proxy, first generations (1 week)
1. Credentials UI and API with envelope encryption; masked list, reveal, default per provider.
2. Proxy with per-provider allowlists, header injection, streaming, `QUERY` support; `/fetch` for outputs.
3. Adapters, in smoke-test order: `cf-workers-ai` (free, same account), `xai` (image + video, your key), `hf-inference` and `hf-space` (your free token), `runpod` (public endpoints, your key), then `openai-compat` (xAI/OpenAI presets), `fal`, `google`, `replicate`, `comfyui` (localhost; workflow templates for txt2img, img2img, Wan i2v).
4. Generate screen (image and video tabs) with schema-driven forms; job runner with persistence and download; History screen from `/jobs`.
5. PWA manifest and service worker.
**Exit:** generate images and videos from phone and PC on five cloud providers and on local ComfyUI; reload mid-job and see it finish; keys visible only after login.

### Phase 2 — Editing, more providers, tunnel (2 weeks)
1. Edit screen: upload, mask painting, inpaint / img2img / upscale / remove-bg across OpenAI, xAI, fal, Stability, BFL, Google.
2. Temp uploads on R2 with TTL cron, for URL-only providers.
3. Adapters: `byteplus-ark` (Seedream + Seedance with both parameter styles), `venice`, `kling` (Worker-minted JWT), `stability`, `bfl`, `runpod` serverless workers (worker-comfyui presets), `a1111`.
4. Local access guide and UI: tunnel setup wizard, relay mode with stored service tokens, health badges, Chrome permission-prompt and Safari messaging; `docs/local-servers.md`.
5. Job cancel where supported; cost hints per model from research tables.
**Exit:** edit images with masks; Seedance via BytePlus directly; ComfyUI reachable from the phone through the tunnel; Gradio Spaces usable by URL.

### Phase 3 — Long tail and polish (ongoing)
1. Adapters: `minimax`, `runway`, `luma`, `ideogram`, `recraft`, `leonardo`, `wavespeed`, `together`, `fireworks`, `swarmui` (optional).
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
| `@cloudflare/vite-plugin` with `base: '/studio/'`. | **Verified in the spike** (build, asset serving, SPA fallback, D1, WebCrypto, Access gate). |
| Provider APIs churn (they did between v1 and v2 of this plan). | Adapters are data-driven; live catalogues where offered; each spec doc has a "last verified" date; contract tests on fixtures. |
| Fast-expiring output URLs (BFL 10 min). | Download immediately on success, before notifying the UI. |
| Providers that need public input URLs. | Temp uploads on R2 with unguessable ids and 1 h TTL; own-upload APIs preferred where they exist. |
| Loss of the KEK. | Keep it in a password manager; document rotation; the app shows a warning if `kek_version` is unknown. |
| Safari blocks loopback calls from HTTPS; Chrome 142+ prompts for local network access. | Relay mode works in every browser; UI explains the Chrome prompt and points Safari users to relay mode. |
| A1111 synchronous calls exceed Cloudflare's 125 s proxy timeout through a tunnel. | Warn in the UI; recommend ComfyUI (async) for long or video jobs remotely; A1111 long jobs on localhost only. |
| Subrequest timeout on very slow sync providers (undocumented, roughly 100 s). | Prefer async modes everywhere they exist; sync-only endpoints (Stability, Ideogram, Recraft) return well under that. |
| ZeroGPU quotas on Spaces. | Direct browser calls with the user's HF token; fallback provider suggestion on quota errors. |

---

## 8. Open items for you

1. Approve this plan to start Phase 0 (skeleton promoted from the spike, CI/CD, probe route, Access, D1).
2. Do the account-side steps in `docs/setup-cloudflare.md` sections 1–3 and 5–6 when convenient (about 30 minutes); section 4 can be scripted once the API token exists.
3. Optional later: a BytePlus ModelArk account for Seedance direct, a fal.ai account for the widest video coverage. Both are pay-as-you-go; nothing in Phase 0 or 1 needs them.
