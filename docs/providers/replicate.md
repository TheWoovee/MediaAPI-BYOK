# Replicate

- Website / docs: https://replicate.com · HTTP API reference: https://replicate.com/docs/reference/http · OpenAPI: https://replicate.com/docs/reference/openapi · Create a prediction (sync mode / `Prefer: wait`): https://replicate.com/docs/topics/predictions/create-a-prediction · Input files: https://replicate.com/docs/topics/predictions/input-files · Output files: https://replicate.com/docs/topics/predictions/output-files · Rate limits: https://replicate.com/docs/topics/predictions/rate-limits · Webhooks: https://replicate.com/docs/topics/webhooks and https://replicate.com/docs/topics/webhooks/verify-webhook · Official models: https://replicate.com/docs/topics/models/official-models and https://replicate.com/collections/official · Search API: https://replicate.com/blog/new-search-api and https://replicate.com/changelog/2024-07-24-api-for-searching-public-models · Pricing: https://replicate.com/pricing · Collections: https://replicate.com/collections/flux, /collections/text-to-video, /collections/image-to-video, /collections/wan-video · SDK sources used for cross-checking: https://github.com/replicate/replicate-javascript (README, `index.d.ts`), https://github.com/replicate/replicate-python
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter). NOTE: replicate.com and api.replicate.com were **blocked by the research sandbox's egress proxy**, so facts below come from search-engine snippets of the official docs plus the official JS/Python client sources on GitHub. Items marked "unverified" could not be confirmed against the page itself.
- Adapter id: `replicate`  ·  Transport: `proxy` (no CORS, see below)  ·  Priority wave: 2

## Account and authentication
- Get a key: sign up at https://replicate.com, create a token at https://replicate.com/account/api-tokens (JS README). A payment method is required for sustained use; free trial allowance is unverified (Replicate historically allows a small number of free runs before billing setup).
- Auth header (exact): `Authorization: Bearer <REPLICATE_API_TOKEN>` (also accepts the legacy `Authorization: Token <token>`; unverified this session — use `Bearer`).
- Base URL: `https://api.replicate.com/v1`. Single global region. Output files are served from `https://replicate.delivery` and `*.replicate.delivery`.

## Browser (CORS) behaviour
- Result: **blocked** (documented, not tested here). `OPTIONS https://api.replicate.com/v1/predictions` from `Origin: https://www.thewoovee.com` could not be executed (sandbox egress proxy returned `403` on CONNECT). Evidence: the official JS client README states *"This library can't interact with Replicate's API directly from a browser"* and GitHub issue replicate/replicate-javascript#164 ("No 'Access-Control-Allow-Origin' header is present on the requested resource") confirms `api.replicate.com` sends no `Access-Control-Allow-Origin`. Replicate's guidance is a server route (their Next.js guide). → **proxy transport is mandatory.** Re-test occasionally:
  `curl -s -o /dev/null -D - -X OPTIONS -H "Origin: https://www.thewoovee.com" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type,prefer" https://api.replicate.com/v1/predictions`

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | yes | official: `black-forest-labs/flux-schnell`, `flux-dev`, `flux-1.1-pro`, `flux-1.1-pro-ultra`, `flux-2-pro`, `flux-2-dev`, `bytedance/seedream-4`, `bytedance/seedream-5-lite`, `recraft-ai/recraft-v3`, `ideogram-ai/ideogram-v3-*`, `google/nano-banana` … via `POST /v1/models/{owner}/{name}/predictions` |
| image→image / edit / inpaint | yes | `black-forest-labs/flux-kontext-pro`, `flux-kontext-max`, `flux-kontext-dev`, `flux-fill-pro`/`flux-fill-dev` (mask inpainting), `flux-2-*` (up to 8 reference images `input_image`…`input_image_8`), Seedream edit, Nano Banana edit |
| upscale | yes | community models (e.g. `nightmareai/real-esrgan`, `philz1337x/clarity-upscaler`, `recraft-ai/recraft-crisp-upscale`) via `POST /v1/predictions` with `version` — ids unverified this session |
| text→video | yes | `bytedance/seedance-1-pro`, `seedance-1-lite`, Seedance 2.x, `kwaivgi/kling-v2.5-turbo-pro`, `kling-v2.6`, Kling 3, `google/veo-3.1`, `veo-3.1-fast`, `wan-video/wan-2.7-t2v`, `wan-2.5-t2v`, `minimax/hailuo-2.3`, `hailuo-02`, `video-01` |
| image→video | yes | same families (`image` / `start_image` / `first_frame_image` input), `wan-video/wan-2.5-i2v`, `wan-2.7-i2v` (unverified id) |
| video→video / extend | limited | Kling `end_image`/`last_image` keyframes; Veo 3.1 `last_frame`; dedicated extend endpoints: unverified |
| audio in video | yes | Veo 3/3.1 (audio on by default), Seedance 2.x, Wan 2.5/2.7, Kling 2.6+/3 |

## Models
Official models (https://replicate.com/collections/official) are "always on", maintained by Replicate, and **priced per output** (per image / per second of video) rather than per hardware-second. Call them with `POST /v1/models/{owner}/{name}/predictions` (no version needed). Prices below come from search snippets of replicate.com and comparison sites; anything not seen on a replicate.com snippet is marked *unverified*. Exact input schemas: `GET /v1/models/{owner}/{name}` → `latest_version.openapi_schema.components.schemas.Input`.

| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| `black-forest-labs/flux-schnell` | t2i | `prompt`, `aspect_ratio` (`1:1`,`16:9`,`21:9`,`3:2`,`2:3`,`4:5`,`5:4`,`3:4`,`4:3`,`9:16`,`9:21`), `num_outputs` 1–4, `num_inference_steps` ≤4, `seed`, `output_format` webp/jpg/png, `output_quality`, `disable_safety_checker`, `go_fast`, `megapixels` `"1"`/`"0.25"` | — | $3.00 per 1000 images ($0.003/image) (https://replicate.com/pricing snippet) |
| `black-forest-labs/flux-dev` | t2i / i2i | as above + `image` (img2img), `prompt_strength`, `guidance` (3.5), `num_inference_steps` (28) | — | $0.025/image |
| `black-forest-labs/flux-1.1-pro` | t2i | `prompt`, `aspect_ratio` (or `custom` with `width`/`height` multiples of 32, 256–1440), `image_prompt` (Redux-style), `safety_tolerance` 1–6, `prompt_upsampling`, `seed`, `output_format`, `output_quality` | 1 output | $0.04/image |
| `black-forest-labs/flux-1.1-pro-ultra` | t2i (4 MP) | `aspect_ratio` incl. `21:9`/`9:21`, `raw`, `image_prompt`, `image_prompt_strength` | — | $0.06/image (unverified) |
| `black-forest-labs/flux-kontext-pro` · `flux-kontext-max` · `flux-kontext-dev` | edit (single `input_image`) | `prompt`, `input_image`, `aspect_ratio` (`match_input_image` default), `safety_tolerance` (≤2 with input image), `prompt_upsampling`, `seed`, `output_format` | 1 input | $0.04 (pro) / $0.08 (max) per image; dev per output (unverified) |
| `black-forest-labs/flux-fill-pro` · `flux-fill-dev` | inpaint/outpaint | `prompt`, `image`, `mask` (white = edit), `outpaint`, `steps`, `guidance` | — | unverified |
| `black-forest-labs/flux-2-pro` · `flux-2-dev` (also `flux-2-flex`, `flux-2-max` — ids unverified) | t2i / multi-ref | `prompt`, `input_image` … `input_image_8` (≤8 refs), `aspect_ratio`, `resolution`, `output_format`; no mask (Vercel provider source) | ≤8 reference images | flux-2-pro: $0.015 + $0.015 per input+output megapixel (≈$0.055 for a 1024² image with no refs) |
| `bytedance/seedream-4` (also `seedream-4.5`, id unverified) | t2i / edit | `prompt`, `size` (`1K`/`2K`/`4K`/`custom`), `width`/`height`, `aspect_ratio`, `image_input[]` (≤10), `sequential_image_generation`, `max_images` ≤15 | — | ~$0.03/image (unverified) |
| `bytedance/seedream-5-lite` | t2i / edit | 2K/3K, `aspect_ratio` | — | $0.035/image (snippet, "on Replicate") |
| `bytedance/seedream-5-pro` (id unverified; Seedream 5.0 Pro released 2026-07-08) | t2i / edit | 1K/2K, aspect ratios 1:1,16:9,9:16,4:3,3:4,3:2,2:3,21:9 | — | $0.075/image ≤2.36 MP, $0.15 above, +$0.005 per extra input image (listed for the model generally — Replicate-specific price unverified) |
| `bytedance/seedance-1-pro` · `bytedance/seedance-1-lite` | t2v / i2v | `prompt`, `image` (first frame), `last_frame_image` (lite), `duration` 5/10 (2–12 on pro), `resolution` `480p`/`720p`/`1080p`, `aspect_ratio`, `fps` 24, `camera_fixed`, `seed` | 2–12 s | per second by resolution (unverified) |
| Seedance 2.0 / 2.5 (`bytedance/seedance-2.0`, `bytedance/seedance-2.5`? ids unverified) | t2v / i2v, audio | 480p/720p, 24 fps, 4–15 s (2.0) / 4–30 s (2.5) | — | $0.1028/s (480p), $0.2312/s (720p) on Replicate (cellcog.ai comparison; unverified) |
| `kwaivgi/kling-v2.5-turbo-pro` | t2v / i2v | `prompt`, `image` (start), `last_image`, `duration` 5/10, `aspect_ratio` (t2v), `guidance_scale`, `negative_prompt` | 5/10 s, 1080p | ≈$0.31–0.35 per 5 s (aggregators; Replicate page price unverified) |
| `kwaivgi/kling-v2.6` (pro/std variants unverified) | t2v / i2v, native audio | `prompt`, `image`, `end_image`, `duration`, `negative_prompt`, `cfg_scale`, `generate_audio` (unverified) | — | unverified |
| Kling 3 (`kwaivgi/kling-v3`, `kling-v3-turbo`? ids unverified) | t2v / i2v, audio | — | — | ≈$0.42 (std) / $0.56 (turbo, audio) per 5 s (aggregator; unverified) |
| `google/veo-3.1` · `google/veo-3.1-fast` (also `veo-3.1-lite`, `google/veo-3`) | t2v / i2v, audio | `prompt`, `image` (first frame), `last_frame`, `reference_images[]` ≤3, `duration` (4/6/8), `resolution` `720p`/`1080p`, `aspect_ratio` `16:9`/`9:16`, `generate_audio` (default true), `negative_prompt`, `seed` | 8 s max per generation, 24 fps | veo-3.1: $0.20/s (no audio) – $0.40/s (audio); fast: $0.10–$0.15/s; lite from $0.03/s 720p no audio (snippets; per-second billing confirmed, exact Replicate figures partly unverified) |
| `wan-video/wan-2.7-t2v` (+ `wan-2.7-i2v`, unverified) | t2v, audio | up to 1080p, ≤15 s | — | $0.10/s (https://replicate.com/wan-video/wan-2.7-t2v/api snippet: "10 seconds for $1") |
| `wan-video/wan-2.5-t2v` · `wan-video/wan-2.5-i2v` | t2v / i2v, audio | up to 1080p, 5/10 s | — | unverified |
| `minimax/hailuo-2.3` (+ `hailuo-2.3-fast`), `minimax/hailuo-02`, `minimax/video-01` | t2v / i2v | `prompt`, `first_frame_image`, `duration` 6/10, `resolution` `768p`/`1080p` (1080p only 6 s), `prompt_optimizer` | 6 s @1080p or 10 s @768p | ≈$0.25–0.50 per video depending on tier (snippets; unverified) |

Community (non-official) models: any `owner/name`, run by **64-hex version id** via `POST /v1/predictions` and billed per hardware-second (public price list: CPU $0.000025/s, Nvidia T4 $0.000225/s, … H100 $0.001525/s — https://replicate.com/pricing). They can cold-boot (minutes) and go idle; the `Prefer: wait` window will often expire on them.

## Endpoints (exact)
All JSON, `Content-Type: application/json`, `Authorization: Bearer <token>`.

### POST https://api.replicate.com/v1/models/{owner}/{name}/predictions — create (official / latest version)
Request: `{"input":{"prompt":"...", ...}, "webhook":"https://...", "webhook_events_filter":["start","output","logs","completed"]}`. Optional header **`Prefer: wait`** (= wait up to 60 s) or **`Prefer: wait=N`** (N = 1–60 s) to hold the connection until the prediction finishes ("sync mode", https://replicate.com/docs/topics/predictions/create-a-prediction). Without `Prefer`, returns `201` immediately with `status: "starting"`.
Response `201` (prediction object): `{"id":"<22-char id>","model":"black-forest-labs/flux-schnell","version":"hidden"|"<64-hex>","input":{...},"logs":"","output":null|["https://replicate.delivery/..."],"data_removed":false,"error":null,"status":"starting"|"processing"|"succeeded"|"failed"|"canceled","created_at":"...","started_at":"...","completed_at":"...","metrics":{"predict_time":1.23,"total_time":2.34},"urls":{"get":"https://api.replicate.com/v1/predictions/<id>","cancel":"https://api.replicate.com/v1/predictions/<id>/cancel","stream":"https://...","web":"https://replicate.com/p/<id>"}}` (fields from `index.d.ts`; the JS type also lists an `aborted` status). With `Prefer: wait`, if the model finished you get `status: "succeeded"` + `output`; if the wait timed out you get the current state (`starting`/`processing`) and must poll `urls.get`. Docs note: for file outputs in sync mode, `output` may be populated while `status` is still `processing` and `metrics`/`completed_at` are not yet set — treat "output present" as done for UX, but keep polling for the final status if you need `metrics`.

### POST https://api.replicate.com/v1/predictions — create by version (community models)
Request: `{"version":"<64-hex version id>","input":{...},"webhook":"...","webhook_events_filter":[...]}` (also accepts `"model":"owner/name"` in some SDK paths — the JS client routes `model` to the models endpoint instead; on the raw HTTP API use `version`). Same `Prefer: wait` semantics and response shape. `stream: true` is deprecated.

### GET https://api.replicate.com/v1/predictions/{id} — poll
Returns the prediction object above. Terminal statuses: `succeeded`, `failed` (`error` string set), `canceled`. Poll every ~1 s (JS client default 500 ms) with backoff toward 5 s for video; you have 3000 req/min on this endpoint. `output` is model-specific: usually a string URL or array of URLs; some models return objects. `logs` is a single string.

### POST https://api.replicate.com/v1/predictions/{id}/cancel
Body empty. Returns the prediction with `status: "canceled"` (billing stops). Use `urls.cancel` from the create response.

### GET https://api.replicate.com/v1/predictions — list (paginated `results[]`, `next`, `previous`); not needed by the app.

### Files API — POST https://api.replicate.com/v1/files
`Content-Type: multipart/form-data` with the file part (field name `content` per the JS client's `files.create`; unverified here), optional `filename`, `type`, and `metadata` (JSON). Response: file object `{"id":"...","name":"...","content_type":"image/png","size":123,"etag":"...","checksums":{"sha256":"...","md5":"..."},"metadata":{},"created_at":"...","expires_at":"...","urls":{"get":"https://api.replicate.com/v1/files/<id>/download?expiry=...&owner=...&signature=..."}}`. **Uploaded files expire after 24 hours.** Pass `urls.get` as the model input value. Also `GET /v1/files`, `GET /v1/files/{id}`, `DELETE /v1/files/{id}`. Max upload size: unverified (SDK types mention 100 MB — unverified).

### Search / catalog
- **New:** `GET https://api.replicate.com/v1/search?query=nano+banana` → results for models, collections and docs (https://replicate.com/blog/new-search-api). Response schema unverified (paginated objects with `models[]`, `collections[]`, `docs[]`).
- **Legacy:** `QUERY https://api.replicate.com/v1/models` with `Content-Type: text/plain` and the search text as the raw body (non-standard HTTP verb `QUERY`; the Worker proxy must forward it — Cloudflare Workers `fetch` supports arbitrary methods). Returns a paginated list of model objects (`results[]`, `next`).
- `GET /v1/models` (all public models, paginated), `GET /v1/models/{owner}/{name}` (model + `latest_version` incl. `openapi_schema` for form generation), `GET /v1/models/{owner}/{name}/versions`, `GET /v1/collections/{slug}` (`official`, `text-to-video`, `image-to-video`, `flux`, `wan-video`) → `models[]`.

### Webhooks (server-only)
`webhook` must be HTTPS; `webhook_events_filter` subset of `start`, `output`, `logs`, `completed` (default all; `output`/`logs` are throttled). Payload = the prediction object. Signed with Standard Webhooks headers `webhook-id`, `webhook-timestamp`, `webhook-signature` (`v1,<base64>` space-separated list); signature = base64(HMAC-SHA256(secret, `${webhook-id}.${webhook-timestamp}.${rawBody}`)); the secret (`whsec_…`) comes from `GET https://api.replicate.com/v1/webhooks/default/secret` → `{"key":"whsec_..."}`. Third-party guides describe a `{type,data}` envelope — verify against https://replicate.com/docs/topics/webhooks/verify-webhook before relying on it.

## Input media
- Any field typed as a file accepts an **HTTPS URL** or a **data URL** (`data:image/png;base64,…`). Docs: data URLs are recommended only for files **< 1 MB**; larger payloads fail with request-too-large errors → upload via `POST /v1/files` (24 h expiry) or host the file yourself (https://replicate.com/docs/topics/predictions/input-files). Older guidance quoted a 256 KB data-URL limit; the current page says 1 MB (unverified beyond the snippet).
- Field names are model-specific: `image` (flux-dev img2img, Kling start frame), `input_image` / `input_image_2…8` (Kontext, FLUX.2), `mask` (Fill), `image_input[]` (Seedream), `first_frame_image` (MiniMax), `last_frame` / `last_image` / `end_image` (end keyframes), `reference_images[]` (Veo 3.1).

## Output media
- `output` URLs are on `https://replicate.delivery/...` (and subdomains, e.g. `https://replicate.delivery/xezq/...`); **they expire after one hour** for API-created predictions and must be copied out (https://replicate.com/docs/topics/predictions/output-files). Add `replicate.delivery` and `*.replicate.delivery` to allowlists. Content type follows `output_format` (webp default on FLUX; mp4 for video). Some models can return data URLs (Python SDK docs mention `data:image/png;base64,...` outputs). `data_removed: true` on old predictions means the output was purged.
- CORS on `replicate.delivery` for browser `fetch()`: unverified (GitHub issues report CORS trouble with Replicate assets in browsers) → fetch through the Worker `/api/fetch?url=` (already allowlisted in PLAN.md).

## Rate limits, quotas, free tier
- Prediction creation: **600 requests/minute**; all other endpoints **3000 requests/minute**; short bursts above are tolerated; stronger limits apply as credit runs out (https://replicate.com/docs/topics/predictions/rate-limits). `429` with a JSON error; `Retry-After` header presence unverified.
- Billing: prepaid/postpaid credit; official models per output, others per hardware-second (billed only while the prediction runs on public models; setup time on private deployments billed).
- Free tier: unverified (small free trial before adding a payment method historically).

## Gotchas
- **No CORS** on `api.replicate.com` → everything through the Worker proxy, including the odd `QUERY` verb for legacy search and the `Prefer` header (add `prefer` to the forwarded-header allowlist — PLAN.md already does).
- `Prefer: wait` maxes at 60 s; video and cold community models will exceed it. Always be ready to fall back to polling `urls.get`.
- `version: "hidden"` for official models — never store/require a version for them; build the URL from `owner/name`.
- Output URLs die after 1 hour and uploaded inputs after 24 hours — download outputs to the media store immediately.
- Model input schemas differ wildly (`aspect_ratio` vs `width`/`height` vs `size`; `duration` as int vs string); pull `openapi_schema` from `GET /v1/models/{owner}/{name}` to build forms instead of hard-coding.
- Official model pricing is per output but some (flux-2-pro, Seedream 5 Pro) add per-megapixel or per-input-image surcharges; per-second video prices vary by resolution and audio.
- Community models can cold-start for minutes; surface `status: starting` + `logs` in the UI.
- `webhook_events_filter` with only `completed` avoids throttled `output`/`logs` events if the Worker ever handles webhooks.

## Adapter mapping notes
- Transport: `/api/proxy/replicate/*` → `https://api.replicate.com/v1/*`; forward `authorization`, `content-type`, `accept`, `prefer`; allow methods `GET`, `POST`, `DELETE`, `QUERY`. Output fetches via `/api/fetch?url=` for `*.replicate.delivery` and `api.replicate.com/v1/files/*/download`.
- Job model: `POST /models/{owner}/{name}/predictions` with `Prefer: wait=55` (images) or no `Prefer` (video) → if `status` terminal, done; else store `id` + `urls.get`/`urls.cancel` and poll (1 s → 5 s). Cancel = `POST urls.cancel`. Persist `id` so a reload can resume polling.
- Model addressing: official models by `owner/name`; user-added community models by `owner/name:version` (split on `:` → `/v1/predictions` with `version`, exactly as the Vercel/JS clients do).
- Capability → model: t2i/edit/inpaint/upscale via image models with the field names above; t2v/i2v via video models (`image`/`first_frame_image`/`start_image` for the first frame). Our `size` → `width`/`height` or `aspect_ratio` (+ `megapixels`) depending on schema; our `duration` → int seconds (Seedance/Veo/Wan) or `5|10` (Kling/MiniMax); our `resolution` → `resolution` string; `n` → `num_outputs` (images) where supported; `seed`, `negative_prompt`, `output_format` pass through.
- Input blobs: < 1 MB → data URL; otherwise `POST /v1/files` (multipart through the proxy) and pass `urls.get`.
- Catalog: seed with the curated list; let users search via `GET /v1/search?query=` (new) and render forms from `openapi_schema`; show official-model prices from the model page (no pricing API field is documented — unverified).
- Special UI: "official (fixed price) vs community (per hardware-second, may cold-start)" badge; mask editor for `flux-fill-*`; up to 8 reference images for FLUX.2; end-frame inputs for Kling/Seedance/Veo.
