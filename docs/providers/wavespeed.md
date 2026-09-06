# WaveSpeedAI

- Website / docs: https://wavespeed.ai · Docs home: https://wavespeed.ai/docs · Get started: https://wavespeed.ai/docs/get-started-api · Quick start: https://wavespeed.ai/docs/docs-quick-start · Auth: https://wavespeed.ai/docs/api-authentication and https://wavespeed.ai/docs/docs-authentication · REST API: https://wavespeed.ai/docs/rest-api · Predictions: https://wavespeed.ai/docs/docs-common-api/predictions and https://wavespeed.ai/docs/what-are-predictions · Get result: https://wavespeed.ai/docs/get-result · Sync mode: https://wavespeed.ai/docs/sync-mode · Webhooks: https://wavespeed.ai/docs/docs-api/webhooks · Media upload: https://wavespeed.ai/docs/docs-common-api/media-upload · Error codes: https://wavespeed.ai/docs/error-codes · Per-model API pages: `https://wavespeed.ai/docs/docs-api/<vendor>/<vendor>-<model-slug>` (e.g. https://wavespeed.ai/docs/docs-api/bytedance/bytedance-seedance-v1-pro-t2v-720p) · Model pages: `https://wavespeed.ai/models/<model_id>` · Official SDK sources used for cross-checking: https://github.com/WaveSpeedAI/wavespeed-python (`src/wavespeed/api/client.py`, `config.py`), https://github.com/WaveSpeedAI/wavespeed-javascript (`src/api/client.ts`, `src/config.ts`), https://github.com/WaveSpeedAI/wavespeed-cli, https://github.com/WaveSpeedAI/mcp-server
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter). NOTE: wavespeed.ai and api.wavespeed.ai were **blocked by the research sandbox's egress proxy**, so facts below come from search-engine snippets of the official docs plus the official Python/JS SDK sources on GitHub (which encode the exact URLs, headers and status handling). Items marked "unverified" could not be confirmed against the page itself.
- Adapter id: `wavespeed`  ·  Transport: `proxy` (CORS unknown)  ·  Priority wave: 3

## Account and authentication
- Get a key: sign up at https://wavespeed.ai, create a key at https://wavespeed.ai/accesskey (docs also link "API Keys → Generate"; keys look like `wsk_…`). The key is shown once. **Keys only work after a top-up**: "API keys require a top-up to activate. Keys generated without a top-up will not work" (https://wavespeed.ai/docs/api-authentication) — i.e. **no free tier**.
- Auth header (exact): `Authorization: Bearer <WAVESPEED_API_KEY>` (SDKs: `"Authorization": f"Bearer {self.api_key}"`). SDKs also send `X-Client-Name`, `X-Client-Version`, `X-Client-OS` for attribution (optional).
- Base URL: `https://api.wavespeed.ai` (SDK `base_url`), API prefix `/api/v3`. Single global endpoint; no regions documented.

## Browser (CORS) behaviour
- Result: **unknown**. `OPTIONS https://api.wavespeed.ai/api/v3/wavespeed-ai/flux-dev` and `.../api/v3/predictions/x/result` with `Origin: https://www.thewoovee.com` could not be executed: the sandbox egress proxy refused the CONNECT (`403` from the proxy, not from WaveSpeed). No CORS statement was found in docs snippets; the JS SDK's `config.ts` has a `getEnv()` that "works in both Node.js and browser", which hints the SDK is meant to run in browsers, but that is not proof of CORS headers. Plan for `proxy` and re-test:
  `curl -s -o /dev/null -D - -X OPTIONS -H "Origin: https://www.thewoovee.com" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type" https://api.wavespeed.ai/api/v3/wavespeed-ai/flux-dev`

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | yes | `wavespeed-ai/flux-dev`, `wavespeed-ai/flux-1.1-pro-ultra`, `wavespeed-ai/flux-1-srpo`, FLUX.2 (Klein/Pro/Dev/Max — ids unverified), `bytedance/seedream-v4`, `alibaba/wan-2.5/text-to-image`, `wavespeed-ai/z-image/turbo`, `minimax/image-01` — `POST /api/v3/{model_id}` |
| image→image / edit / inpaint | yes | `wavespeed-ai/flux-kontext-pro`, `wavespeed-ai/flux-kontext-max`, `wavespeed-ai/flux-srpo-image-to-image`, `minimax/image-01/image-to-image`, Seedream V4 edit (id unverified) |
| upscale | yes (catalog) | ids unverified — search the live catalog |
| text→video | yes | `bytedance/seedance-v1-pro-t2v-{480p,720p,1080p}`, `bytedance/seedance-v1-lite-t2v-480p` (+720p/1080p), `kwaivgi/kling-v2.5-turbo-pro/text-to-video`, `kwaivgi/kling-v3.0-std/text-to-video`, `wavespeed-ai/wan-2.2/t2v-720p`, `wavespeed-ai/wan-2.2/t2v-5b-720p`, `alibaba/wan-2.5/text-to-video`, `google/veo3`, MiniMax Hailuo 2.3 collection |
| image→video | yes | `bytedance/seedance-v1-pro-i2v-{480p,720p,1080p}`, `bytedance/seedance-v1-lite-i2v-1080p`, `kwaivgi/kling-v2.5-turbo-{std,pro}/image-to-video`, `kwaivgi/kling-v2.6-pro/image-to-video`, `kwaivgi/kling-v3.0-{std,pro}/image-to-video`, `wavespeed-ai/wan-2.2/i2v-720p`, `alibaba/wan-2.5/image-to-video`, `alibaba/wan-2.5/image-to-video-fast` |
| video→video / extend | yes | `kwaivgi/kling-v2.6-{std,pro}/motion-control`, `kwaivgi/kling-v3.0-pro/motion-control`, `alibaba/wan-2.7/reference-to-video`, Wan 2.2 animate/fun-control (collection) |
| audio in video | yes | Wan 2.5 (synchronized audio), Wan 2.7, Kling 2.6/3.0 native audio, Veo 3 |

## Models
Model ids are the path after `/api/v3/`. Prices are WaveSpeed's "starts at $X per run" base prices (the final charge scales with resolution/duration/count). Docs page slug = `docs/docs-api/<vendor>/<vendor>-<id-with-slashes-as-dashes>`.

| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| `wavespeed-ai/flux-dev` | t2i | `prompt`, `size` (`"1024*1024"` style string — unverified format), `num_inference_steps`, `guidance_scale`, `num_images`, `seed`, `enable_base64_output`, `enable_sync_mode` | — | from $0.012/run (https://wavespeed.ai/models/wavespeed-ai/flux-dev) |
| `wavespeed-ai/flux-kontext-pro` · `wavespeed-ai/flux-kontext-max` | edit (single `image`) | `prompt`, `image`, `aspect_ratio`, `guidance_scale`, `safety_tolerance`, `output_format` | 1 input | pro: unverified; max from $0.080/run (https://wavespeed.ai/models/wavespeed-ai/flux-kontext-max) |
| `wavespeed-ai/flux-1.1-pro-ultra` · `wavespeed-ai/flux-1-srpo` · `wavespeed-ai/flux-srpo-image-to-image` | t2i / i2i | — | — | unverified |
| FLUX.2 Klein / Pro / Dev / Max (collection https://wavespeed.ai/collections/flux; ids unverified) | t2i / edit | — | — | unverified |
| `bytedance/seedream-v4` (+ edit/sequential variants, ids unverified) | t2i / edit | `prompt`, `size` up to 4K, `images[]` | — | unverified (https://wavespeed.ai/models/bytedance/seedream-v4) |
| `wavespeed-ai/z-image/turbo` | t2i (fast) | `prompt` (SDK README example) | — | unverified |
| `bytedance/seedance-v1-pro-t2v-480p` · `-720p` · `-1080p` | t2v | `prompt`, `aspect_ratio`, `duration` (5 s default; 720p "up to 12 s"), `seed`, `camera_fixed` | 5–12 s | unverified per tier |
| `bytedance/seedance-v1-pro-i2v-480p` · `-720p` · `-1080p` | i2v | `image`, `prompt`, `duration`, `seed` | — | unverified |
| `bytedance/seedance-v1-lite-t2v-480p` (+ other lite resolutions) · `bytedance/seedance-v1-lite-i2v-1080p` | t2v / i2v | as above | — | unverified |
| `seedance-v1-pro-fast` (collection https://wavespeed.ai/collections/bytedance; full id unverified) | t2v / i2v | — | — | unverified |
| `kwaivgi/kling-v2.5-turbo-pro/text-to-video` · `kwaivgi/kling-v2.5-turbo-pro/image-to-video` | t2v / i2v | `prompt`, `image`, `duration` 5/10, `aspect_ratio`, `negative_prompt`, `guidance_scale` | 5/10 s | i2v from $0.35/run (https://wavespeed.ai/models/kwaivgi/kling-v2.5-turbo-pro/image-to-video); t2v "per-second billing" |
| `kwaivgi/kling-v2.5-turbo-std/image-to-video` | i2v | as above | — | from $0.21/run |
| `kwaivgi/kling-v2.6-pro/image-to-video` | i2v, audio | + `generate_audio`, `end_image` (unverified) | — | from $0.35/run |
| `kwaivgi/kling-v2.6-std/motion-control` · `kwaivgi/kling-v2.6-pro/motion-control` | v2v (motion transfer) | `image`, `video`, `prompt` | — | from $0.21 / $0.34 per run |
| `kwaivgi/kling-v3.0-std/text-to-video` · `kwaivgi/kling-v3.0-std/image-to-video` · `kwaivgi/kling-v3.0-pro/image-to-video` · `kwaivgi/kling-v3.0-pro/motion-control` | t2v / i2v / v2v, audio | — | — | std i2v from $0.42/run, pro i2v from $0.56/run, pro motion-control from $0.84/run |
| `wavespeed-ai/wan-2.2/t2v-720p` · `wavespeed-ai/wan-2.2/i2v-720p` (docs slugs `wan-2.2-t2v-720p`, `wan-2.2-image-to-video`) · `wavespeed-ai/wan-2.2/t2v-5b-720p` · `wavespeed-ai/wan-2.2-spicy-image-to-video` | t2v / i2v, LoRA | `prompt`, `image`, `size`, `duration`, `loras[]`, `seed` | up to 120 s (collection page) | 5B 720p: $0.05/video; A14B: $0.20 per 5 s at 480p, $0.40 per 5 s at 720p (collection snippet; attribution to exact ids unverified) |
| `alibaba/wan-2.5/text-to-video` · `alibaba/wan-2.5/image-to-video` · `alibaba/wan-2.5/image-to-video-fast` · `alibaba/wan-2.5/text-to-image` | t2v / i2v / t2i, audio | `resolution` 480p/720p/1080p, `duration`, `audio` (sync audio) | — | unverified |
| `alibaba/wan-2.7/reference-to-video` (+ Wan 2.7 t2v/i2v, ids unverified) | ref2v, audio | — | — | unverified |
| `google/veo3` (docs https://wavespeed.ai/docs/docs-api/google/google-veo3) and Veo 3.1 (ids unverified) | t2v / i2v, audio | `prompt`, `aspect_ratio`, `duration`, `generate_audio` | 8 s | unverified |
| MiniMax Hailuo 2.3 (collection https://wavespeed.ai/collections/minimax; ids unverified, likely `minimax/hailuo-2.3/...`) | t2v / i2v | — | — | unverified |

## Endpoints (exact)
All JSON, `Content-Type: application/json`, `Authorization: Bearer <key>`. Every response is wrapped in `{"code": <int>, "message": "<string>", "data": {...}}`; `code` 200 = OK even for `data.status = "failed"` (HTTP status is separately 200).

### POST https://api.wavespeed.ai/api/v3/{model_id} — submit (async by default)
Example: `POST https://api.wavespeed.ai/api/v3/bytedance/seedance-v1-pro-i2v-720p` (SDK: `url = f"{self.base_url}/api/v3/{model}"`). Body = model input JSON plus optional common flags:
- `"enable_sync_mode": true` — hold the connection and return the finished prediction in this response ("not all models support sync mode"; https://wavespeed.ai/docs/sync-mode). If the server-side wait times out, the response has `data.status: "processing"` and `data.error` containing `"Sync mode timed out"`; the task keeps running — poll `data.urls.get` (SDK `_isSyncTimeoutData`).
- `"enable_base64_output": true` — return outputs as base64 strings instead of URLs.
- Webhook: pass the callback URL as a **query parameter** on the submit request (docs: "specify a webhook endpoint in your API request using the query parameter"; the parameter name is most likely `webhook`, unverified). The webhook receives both success and failure notifications.
Response `200`: `{"code":200,"message":"success","data":{"id":"<prediction id>","model":"bytedance/seedance-v1-pro-i2v-720p","status":"created","outputs":[],"urls":{"get":"https://api.wavespeed.ai/api/v3/predictions/<id>/result"},"has_nsfw_contents":[],"created_at":"...","error":"","timings":{}}}` (fields from docs snippets: `code`, `message`, `data{id, model, status, outputs, urls.get, error, timings}`; `has_nsfw_contents`/`created_at` unverified). SDKs read `result["data"]["id"]`. Submission POSTs are non-idempotent: the SDKs never retry them.

### GET https://api.wavespeed.ai/api/v3/predictions/{id}/result — poll
Same envelope. `data.status` lifecycle: `created` → `processing` → `completed` | `failed`. SDKs additionally treat `cancelled`, `timeout`, `deleted` as terminal failures (`TERMINAL_FAILURE_STATUSES`). On `completed`, `data.outputs` is an array of URL strings (or base64 strings with `enable_base64_output`); on `failed`, `data.error` has the message. Docs recommend polling **every ~2 s for image tasks and ~5 s for video**, backing off for long tasks; SDK default `poll_interval = 1.0` s, overall `timeout = 36000` s. Retry the GET on `429/500/502/503/504` (SDK `_RETRYABLE_STATUS_CODES`, up to 5 times with linear backoff). Predictions are retrievable for **7 days**.

### Cancel
No cancel endpoint is exposed by the official SDKs/CLI (only `get_prediction`); unverified whether the REST API has one. Treat jobs as non-cancellable (they still bill).

### Upload — POST https://api.wavespeed.ai/api/v3/media/uploads (ticket flow, current SDKs)
1. `POST /api/v3/media/uploads` with JSON `{"filename":"photo.png","size":123456,"content_type":"image/png"}` → `{"code":200,"message":"...","data":{"type":"...","download_url":"https://…","filename":"photo.png","size":123456,"upload":{"method":"PUT","url":"https://…signed…","headers":{...},"expires_at":"..."}}}`.
2. `PUT data.upload.url` with the raw bytes and exactly `data.upload.headers` (no Authorization).
3. Use `data.download_url` as the `image`/`video`/`audio` input value.
   SDK caps streamed reads at 200 MB; documented size limits unverified. The CLI/MCP dedupe uploads by content hash for 24 h (suggests uploads are retained ≥24 h; retention unverified).
- Legacy/simple form: `POST https://api.wavespeed.ai/api/v3/media/upload/binary` (multipart, images/videos/audio) → returns a URL (https://wavespeed.ai/docs/docs-common-api/media-upload); field name unverified.

### Catalog, schema, price, balance (from the CLI/MCP feature set; REST paths unverified)
The official CLI/MCP offer "live catalog search by text or modality", "per-model input schema (required, properties, defaults)", "price quote before you spend", and "account credit balance" — all backed by REST endpoints under `api.wavespeed.ai` whose paths were not visible in the sources fetched. Read `WaveSpeedAI/wavespeed-cli/src` (TypeScript) for the exact routes before building a live model picker.

## Input media
- Public **HTTPS URL** (including WaveSpeed's own `download_url`) or the upload ticket flow above. Base64 data URIs in input fields: unverified (docs example for a model with `enable_base64_output` shows an image *input* by URL). Prefer upload for anything not already hosted.
- Field names vary by model: `image` (single), `images[]` (Seedream multi-ref), `video`, `audio`, `end_image` on some Kling models, `loras[]` for Wan 2.2.

## Output media
- `data.outputs[]` = HTTPS URLs to generated files (host unverified — likely a WaveSpeed CDN domain; add it to the `/api/fetch` allowlist once observed) or base64 strings when `enable_base64_output: true`. Predictions (and presumably their files) are available for 7 days; exact file retention unverified. `has_nsfw_contents[]` parallels `outputs`.
- CORS on the output host: unverified → fetch via the Worker `/api/fetch?url=`; `enable_base64_output` avoids the second fetch entirely for images.

## Rate limits, quotas, free tier
- No free tier: keys are inert until the first top-up. Billing is prepaid credit; `402`/insufficient-balance error code documented at https://wavespeed.ai/docs/error-codes (exact codes unverified). `429` is retryable per SDK. Concurrency/RPM limits: unverified (a blog post on 401/429/5xx handling exists: https://wavespeed.ai/blog/posts/wavespeed-api-auth-errors/).

## Gotchas
- Every response is an envelope; check `code` and `data.status`, not just the HTTP status (`failed` predictions still come back HTTP 200 / `code` 200).
- Sync mode is best-effort: a `processing` + "Sync mode timed out" response is not an error — switch to polling `data.urls.get`.
- Never retry the submit POST blindly (double billing); retry only the result GET.
- Model ids mix three vendor namespaces (`wavespeed-ai/...`, `bytedance/...`, `kwaivgi/...`, `alibaba/...`, `google/...`) and two styles: Seedance uses dashes with resolution baked in (`seedance-v1-pro-i2v-720p`), Kling/Wan use `/text-to-video` sub-paths. Docs URLs flatten slashes to dashes.
- Base prices are floors ("starts at"); the real charge depends on resolution/duration/count — use the price-quote endpoint (CLI `wavespeed price <model>`) for estimates.
- No documented cancel; long video jobs bill to completion.

## Adapter mapping notes
- Transport: `/api/proxy/wavespeed/*` → `https://api.wavespeed.ai/*`; forward `authorization`, `content-type`, `accept`; allow `GET`, `POST`, `PUT` (PUT to the signed upload URL goes to a different host — either allowlist it once observed or do the PUT directly from the browser if that host sends CORS).
- Job model: `POST /api/v3/{model}` → `data.id` + `data.urls.get` → poll `GET .../predictions/{id}/result` every 2 s (images) / 5 s (video) until `completed`/`failed`/other terminal → `data.outputs[]`. For fast image models optionally `enable_sync_mode: true` and handle the timeout fallback. No cancel.
- Capability → model: t2i `wavespeed-ai/flux-dev`, `bytedance/seedream-v4`; edit `wavespeed-ai/flux-kontext-pro|max`; t2v/i2v Seedance (`bytedance/seedance-v1-pro-{t2v,i2v}-{480p,720p,1080p}` — resolution is part of the id, so our `resolution` param selects the model id), Kling (`kwaivgi/kling-v3.0-{std,pro}/{text,image}-to-video`), Wan (`wavespeed-ai/wan-2.2/{t2v,i2v}-720p`, `alibaba/wan-2.5/...`); v2v Kling motion-control.
- Param translation: our `size` → model-specific `size` string / `aspect_ratio`; `duration` → `duration` (seconds; Kling 5|10); `seed`, `negative_prompt`, `guidance_scale` pass through; our "return base64" preference → `enable_base64_output`.
- Input blobs: always upload via the ticket flow (small images may also work as data URIs — unverified) and pass `download_url`.
- Special UI: "prepaid key must be topped up" hint on 401/402; per-run base price with "final price varies" note; resolution-specific model ids for Seedance.
