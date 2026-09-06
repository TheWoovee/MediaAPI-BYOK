# Stability AI (REST v2beta)

- Website / docs: https://platform.stability.ai/docs/api-reference (OpenAPI; also https://platform.stability.ai/docs/getting-started), pricing https://platform.stability.ai/pricing, account https://platform.stability.ai/account/keys
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter)
- Adapter id: `stability`  ·  Transport: `proxy`  ·  Priority wave: 1

> **Provenance note.** The sandbox used for this research could not reach `platform.stability.ai` or `api.stability.ai` (egress-blocked). Everything below was taken from (a) `src/stabilityAi/types.ts` in github.com/tadasant/mcp-server-stability-ai, which is `openapi-typescript` output generated verbatim from the official `platform.stability.ai/docs/api-reference` OpenAPI (repo snapshot 2025-06-24 — the official prose such as "Flat rate of N credits per successful generation" is preserved), (b) the api-evangelist/stability-ai OpenAPI mirror (2026-09-04, reconstructed, used only for cross-checking), and (c) search-result snippets. Anything only in (b) or (c) is marked. Items marked **unverified** were not present in any reachable source.

## Account and authentication
- Sign up at https://platform.stability.ai → API keys at https://platform.stability.ai/account/keys. New accounts get 25 free credits (search snippet: developer.puter.com pricing breakdown); 1 credit = US$0.01, pay-as-you-go top-ups.
- Auth header: `Authorization: Bearer sk-...` (official spec: `bearerAuth`, "Pass your Stability AI API key as a Bearer token in the Authorization header"). Header name is documented lowercase `authorization` in the spec.
- Optional telemetry headers on every endpoint: `stability-client-id`, `stability-client-user-id`, `stability-client-version` (official spec).
- Base URL: `https://api.stability.ai` (single region; no regional hosts documented).
- Balance: `GET /v1/user/balance` → `{"credits": 0.079...}` (official spec, "Get the credit balance of the account/organization associated with the API key").

## Browser (CORS) behaviour
- **Unknown / not testable from this environment.** The curl preflight `OPTIONS https://api.stability.ai/v2beta/stable-image/generate/core` with `Origin: https://www.thewoovee.com` was answered `403 Forbidden` by the sandbox egress proxy (CONNECT rejected; `curl -sS $HTTPS_PROXY/__agentproxy/status` lists `api.stability.ai:443 connect_rejected`), so no `Access-Control-Allow-Origin` observation was possible. No official doc statement about CORS was found in the mirrored spec. Plan for `proxy` transport and re-run the preflight from a real browser/network before deciding otherwise.

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | yes | `/v2beta/stable-image/generate/ultra`, `/generate/core`, `/generate/sd3` |
| image→image / edit / inpaint | yes | `/generate/ultra` (image+strength), `/generate/sd3` (mode=image-to-image), `/edit/erase`, `/edit/inpaint`, `/edit/outpaint`, `/edit/search-and-replace`, `/edit/search-and-recolor`, `/edit/remove-background`, `/edit/replace-background-and-relight` (async), `/control/sketch`, `/control/structure`, `/control/style`, `/control/style-transfer` (unverified) |
| upscale | yes | `/v2beta/stable-image/upscale/fast` (sync), `/upscale/conservative` (sync), `/upscale/creative` (async) |
| text→video | no | — |
| image→video | yes | `POST /v2beta/image-to-video` (async, Stable Video Diffusion) + `GET /v2beta/image-to-video/result/{id}` |
| video→video / extend | no | — |
| audio in video | no | silent MP4 only |
| image→3D (list only) | yes | `POST /v2beta/3d/stable-fast-3d` (official spec 2025-06); `POST /v2beta/3d/stable-point-aware-3d` (**unverified** — not in the mirrored spec) |

## Models
| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| Stable Image Ultra (`/generate/ultra`) | t2i / i2i | `aspect_ratio` 16:9, 1:1, 21:9, 2:3, 3:2, 4:5, 5:4, 9:16, 9:21 (default 1:1); output 1 MP; optional `image` + `strength` 0–1 | prompt ≤10 000 chars; request ≤10 MiB | 8 credits ($0.08) per successful result |
| Stable Image Core (`/generate/core`) | t2i | same `aspect_ratio` set; `style_preset` enum (below); output 1.5 MP class | prompt ≤10 000 chars | 3 credits ($0.03) |
| `sd3.5-large` (default for `/generate/sd3`) | t2i / i2i | `aspect_ratio` (t2i only), `cfg_scale`, `negative_prompt`, `mode`, `image`+`strength` | output 1 MP | 6.5 credits |
| `sd3.5-large-turbo` | t2i / i2i | as above; `negative_prompt` NOT supported on turbo models | | 4 credits |
| `sd3.5-medium` | t2i / i2i | as above | | 3.5 credits |
| `sd3-large`, `sd3-large-turbo`, `sd3-medium` | t2i / i2i | legacy SD3 variants still accepted by `model` | | 6.5 / 4 / 3.5 credits |
| Fast Upscale (`/upscale/fast`) | upscale 4× | none besides `output_format` | input width & height 32–1 536 px | 1 credit |
| Conservative Upscale (`/upscale/conservative`) | upscale to ~4 MP | `prompt` (required), `negative_prompt`, `creativity` (official docs: 0.2–0.5, default 0.35 — range not re-verified), `seed` | input every side ≥64 px, total 4 096–9 437 184 px | 25 credits |
| Creative Upscale (`/upscale/creative`) | upscale to ~4 MP (async) | `prompt` (required), `creativity` default 0.3, `negative_prompt`, `seed`, `output_format` | same input rules | 25 credits |
| Stable Video Diffusion (`/image-to-video`) | i2v | input image must be exactly 1024×576, 576×1024 or 768×768; `cfg_scale` 0–10 (default 1.8); `motion_bucket_id` 1–255 (default 127); `seed` | ~4 s MP4 (duration/fps not exposed as params) | 20 credits ($0.20) |
| Stable Fast 3D (`/3d/stable-fast-3d`) | image→GLB | `texture_resolution` 512/1024/2048, `foreground_ratio` 0.1–1 (0.85), `remesh` none/triangle/quad, `vertex_count` (-1) | | 2 credits |

`style_preset` enum (Core; official spec): `enhance, anime, photographic, digital-art, comic-book, fantasy-art, line-art, analog-film, neon-punk, isometric, low-poly, origami, modeling-compound, cinematic, 3d-model, pixel-art, tile-texture`.

## Endpoints (exact)
All endpoints are `POST` with **`Content-Type: multipart/form-data`** (JSON bodies are rejected). The **`accept` header selects the response encoding**:
- `accept: image/*` → raw bytes in the format given by `output_format`; metadata comes back as response headers `finish-reason` (`SUCCESS` | `CONTENT_FILTERED`), `seed`, `x-request-id`, `content-type`.
- `accept: application/json` → `{"image": "<base64>", "finish_reason": "SUCCESS"|"CONTENT_FILTERED", "seed": 343940597}` with `content-type: application/json; type=image/png` (or jpeg/webp). Video endpoints use `accept: video/*` and JSON key `video`; 3D uses `model/gltf-binary` and JSON key `model`.
Common optional fields on generation/edit endpoints: `negative_prompt`, `seed` (0–4294967294; 0/omitted = random), `output_format` (`png` default | `jpeg` | `webp`).
Error body (all 4xx/5xx): `{"id": "...", "name": "...", "errors": ["field: message"]}`. Codes: 400 invalid, 403 content-moderation flag (`ContentModerationResponse`, not charged), 413 request >10 MiB, 422 well-formed but rejected, 429 ">150 requests in 10 seconds", 500.

**Generate**
- `POST https://api.stability.ai/v2beta/stable-image/generate/ultra` — fields: `prompt`*, `negative_prompt`, `aspect_ratio`, `seed`, `output_format`, `image` (binary; then `strength` becomes required), `strength` 0–1. Sync. 8 credits.
- `POST .../v2beta/stable-image/generate/core` — `prompt`*, `negative_prompt`, `aspect_ratio`, `seed`, `output_format`, `style_preset`. Sync. 3 credits.
- `POST .../v2beta/stable-image/generate/sd3` — `prompt`*, `mode` (`text-to-image` default | `image-to-image`), `image` + `strength` (required in i2i), `aspect_ratio` (t2i only), `model`, `seed`, `output_format` (`png`|`jpeg` only), `negative_prompt` (not on turbo), `cfg_scale`. Sync.

**Edit** (all sync except relight)
- `POST .../v2beta/stable-image/edit/erase` — `image`*, `mask` (binary; if omitted the image's alpha channel is used), `grow_mask` (px, default 5), `seed`, `output_format`. 3 credits.
- `POST .../v2beta/stable-image/edit/inpaint` — `image`*, `prompt`*, `mask`, `grow_mask` (5), `negative_prompt`, `seed`, `output_format`. 3 credits.
- `POST .../v2beta/stable-image/edit/outpaint` — `image`*, `left`/`right`/`up`/`down` (px, default 0; at least one non-zero), `creativity`, `prompt`, `seed`, `output_format`. 4 credits.
- `POST .../v2beta/stable-image/edit/search-and-replace` — `image`*, `prompt`*, `search_prompt`*, `negative_prompt`, `grow_mask` (3), `seed`, `output_format`. 4 credits.
- `POST .../v2beta/stable-image/edit/search-and-recolor` — `image`*, `prompt`*, `select_prompt`*, `negative_prompt`, `grow_mask` (3), `seed`, `output_format`. 5 credits.
- `POST .../v2beta/stable-image/edit/remove-background` — `image`*, `output_format` (`png` default | `webp`; no jpeg). 2 credits.
- `POST .../v2beta/stable-image/edit/replace-background-and-relight` — **async**. Fields: `subject_image`* (note: not `image`), `background_reference` (binary), `background_prompt`, `foreground_prompt`, `negative_prompt`, `preserve_original_subject` 0–1 (0.6), `original_background_depth` 0–1 (0.5), `keep_original_background` (`true`|`false`), `light_source_direction` (`left`|`right`|`above`|`below`), `light_reference` (binary), `light_source_strength` 0–1 (0.3), `seed`, `output_format`. Returns 200 `{"id": "<64-hex>"}`; poll `GET /v2beta/results/{id}`. 8 credits.

**Upscale**
- `POST .../v2beta/stable-image/upscale/fast` — `image`*, `output_format`. Sync. 1 credit.
- `POST .../v2beta/stable-image/upscale/conservative` — `image`*, `prompt`*, `negative_prompt`, `seed`, `output_format`, `creativity`. **Sync** (the api-evangelist mirror wrongly marks it async; the official spec returns the image directly). 25 credits.
- `POST .../v2beta/stable-image/upscale/creative` — `image`*, `prompt`*, `negative_prompt`, `output_format`, `seed`, `creativity` (0.3). **Async**: 200 `{"id": "..."}`; poll `GET /v2beta/stable-image/upscale/creative/result/{id}` (or the generic `GET /v2beta/results/{id}`). 25 credits.

**Control**
- `POST .../v2beta/stable-image/control/sketch` — `prompt`*, `image`*, `control_strength` 0–1 (0.7), `negative_prompt`, `seed`, `output_format`. 3 credits.
- `POST .../v2beta/stable-image/control/structure` — same fields as sketch. 3 credits.
- `POST .../v2beta/stable-image/control/style` — `prompt`*, `image`* (style reference), `negative_prompt`, `aspect_ratio`, `fidelity` 0–1 (0.5), `seed`, `output_format`. 4 credits.
- `POST .../v2beta/stable-image/control/style-transfer` — **unverified**: not present in the 2025-06 official-spec snapshot nor the 2026-09 mirror; a 2026 search snippet describes "Stable Image Style Transfer" as a live service. Expected fields (from memory, verify): `init_image`, `style_image`, `prompt`, `negative_prompt`, `style_strength`, `composition_fidelity`, `change_strength`, `seed`, `output_format`.

**Image-to-video**
- `POST https://api.stability.ai/v2beta/image-to-video` — multipart `image`* (1024×576 | 576×1024 | 768×768), `seed`, `cfg_scale`, `motion_bucket_id`. Response 200 `{"id": "a6dc6c6e..."}` (the mirror also shows `status`). 20 credits.
- `GET https://api.stability.ai/v2beta/image-to-video/result/{id}` with `accept: video/*` (raw `video/mp4`) or `application/json` (`{"video": "<base64>", "finish_reason": "SUCCESS", "seed": 123}`). **202** = still in progress (`{"id": "...", "status": "in-progress"}`), **200** = done, 404 = unknown id or different API key. Official docs recommend polling ~every 10 s; results are stored 24 h.

**Generic async result**
- `GET https://api.stability.ai/v2beta/results/{id}` — `accept: */*` or `application/json`; 202 in-progress / 200 finished (same body shapes as image endpoints); 404 if the id was created with another key. "Results are stored for 24 hours after generation."

**3D (list only)**
- `POST /v2beta/3d/stable-fast-3d` (2 credits, sync, returns GLB) — verified in spec. `POST /v2beta/3d/stable-point-aware-3d` — unverified.

No webhooks and no cancel endpoint exist in the spec.

## Input media
- Every image input is a **binary multipart part** (no URLs, no data-URIs). Formats jpeg/png/webp. Generic validation (official spec text): every side ≥64 px, total pixel count between 4 096 and 9 437 184 px (control endpoints state the 9 437 184 cap explicitly), width/height ≤16 384 (ultra), total request ≤10 MiB. Official docs also constrain aspect ratio to between 1:2.5 and 2.5:1 (not re-verified here).
- Masks: separate grayscale image part (`mask`) — white = edit, black = keep — or the alpha channel of `image` when `mask` is omitted (erase/inpaint). `grow_mask` dilates it.
- Image-to-video: input must be exactly one of the three SVD resolutions; the SPA must resize/crop client-side before upload.

## Output media
- Sync endpoints return the bytes (`image/*`) or base64 JSON (`application/json`) — **no hosted URL is ever returned**, so nothing to expire and no CORS concern on the output side; the proxy must stream/return the body (up to several MB for 4 MP PNG; MP4 for video).
- Content types: `image/png` (default), `image/jpeg`, `image/webp`, `video/mp4`, `model/gltf-binary`.
- `finish_reason: CONTENT_FILTERED` means a **blurred** image was returned and still charged; 403 moderation errors are not charged.

## Rate limits, quotas, free tier
- 429 when "more than 150 requests in 10 seconds" (official spec text). No published per-key concurrency limit.
- Failed generations are not charged; 25 free signup credits; PAYG credits at $0.01 each (search snippets; developer platform pricing page).

## Gotchas
- **multipart everywhere**, even for text-only generation — a Worker proxy must forward `multipart/form-data` bodies untouched (do not re-serialize as JSON).
- Choose `accept` deliberately: `image/*` gives smaller responses but metadata only in headers (the proxy must forward `finish-reason`/`seed` headers); `application/json` is simpler for the SPA but ~33 % larger.
- Three different async flavours share one pattern (200 `{id}` → GET result, 202 while pending): creative upscale, relight, image-to-video. The generic `/v2beta/results/{id}` works for image jobs; video has its own `/v2beta/image-to-video/result/{id}`.
- `replace-background-and-relight` uses `subject_image`, not `image`.
- `sd3` turbo models ignore/reject `negative_prompt`; `aspect_ratio` is ignored in i2i mode (output follows input image).
- Result retention is 24 h; async ids are bound to the API key that created them (404 otherwise).
- The 2025-06 spec lists only `stable-fast-3d`; other 3D/audio endpoints must be verified on the live reference.

## Adapter mapping notes
- text→image → `core` (cheap default), `ultra` (quality), `sd3` (model picker: sd3.5-large / large-turbo / medium). Expose `aspect_ratio` from the shared 9-value enum, `negative_prompt`, `seed`, `style_preset` (core only), `output_format`.
- image→image → `ultra` with `image`+`strength`, or `sd3` `mode=image-to-image`; inpaint → `edit/inpaint` (mask upload UI, `grow_mask`); erase → `edit/erase`; outpaint → `edit/outpaint` (four px inputs); object replace/recolor → `search-and-replace` / `search-and-recolor` (two prompts each); background removal → `remove-background`; relight → async job UI.
- upscale → tiered picker: fast (1 cr, 4×, ≤1536 px input), conservative (25 cr, sync but slow), creative (25 cr, async).
- image→video → `image-to-video` with a mandatory client-side resize to 1024×576 / 576×1024 / 768×768; poll every 10 s; surface `cfg_scale` and `motion_bucket_id` as advanced sliders.
- Cost display: static credit table above × $0.01; balance from `GET /v1/user/balance`.
- Proxy: forward `authorization`, `accept`, `content-type` (with boundary) as-is; pass through binary responses and the `finish-reason`/`seed` headers.
