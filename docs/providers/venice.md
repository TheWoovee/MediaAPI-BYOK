# Venice.ai API

- Website / docs: https://docs.venice.ai (API reference: https://docs.venice.ai/api-reference/api-spec) · Image generate https://docs.venice.ai/api-reference/endpoint/image/generate · Upscale https://docs.venice.ai/api-reference/endpoint/image/upscale · Edit https://docs.venice.ai/api-reference/endpoint/image/edit · Multi-edit https://docs.venice.ai/api-reference/endpoint/image/multi-edit · OpenAI-compatible https://docs.venice.ai/api-reference/endpoint/image/generations · Models https://docs.venice.ai/api-reference/endpoint/models/list · Video https://docs.venice.ai/guides/media/video-generation, /api-reference/endpoint/video/queue, /video/retrieve, /video/quote · Image guide https://docs.venice.ai/guides/media/image-generation · Model tables https://docs.venice.ai/models/image, https://docs.venice.ai/models/video · Pricing https://docs.venice.ai/overview/pricing · Rate limits https://docs.venice.ai/api-reference/rate-limiting · Keys https://docs.venice.ai/guides/getting-started/generating-api-key · Machine-readable source of truth: OpenAPI spec `https://api.venice.ai/doc/api/swagger.yaml`, mirrored at https://github.com/veniceai/api-docs (`swagger.yaml`, version `20260904.095608`, fetched 2026-09-06).
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter). docs.venice.ai / venice.ai / api.venice.ai were blocked by the sandbox egress proxy; everything below is taken from the official OpenAPI spec and the docs' MDX sources in the `veniceai/api-docs` GitHub repo, plus search snippets.
- Adapter id: `venice`  ·  Transport: `proxy` (CORS unknown; several responses are raw binary)  ·  Priority wave: 2

## Account and authentication
- Get a key: https://venice.ai/settings/api (Venice app → Settings → API). Key types: **Inference Only** (all inference endpoints; use this) and **Admin** (also manages keys). Keys can carry an expiry and a per-24 h USD/DIEM spend cap. Funding: prepaid USD credits (card or crypto; "credits never expire"), or staked DIEM tokens ("Each Diem = $1/day of credits that refresh daily"). No free API credits documented; "Pro subscribers receive a one-time $10 credit"; "You can create a key before funding the account, but model requests will not succeed until the account can consume" a balance. Some image models return 401 "This model is only available to Pro users".
- Auth header: `Authorization: Bearer <VENICE_API_KEY>` (spec `securitySchemes.BearerAuth`, http bearer). Alternative wallet auth `SIGN-IN-WITH-X: <base64 JSON>` (x402/USDC, no account) — out of scope.
- Base URL: `https://api.venice.ai/api/v1` (single region). Some video models are geo-restricted (403 "unavailable in your region"; `model_spec.regionRestrictions`).

## Browser (CORS) behaviour
- Result: **unknown**. `OPTIONS https://api.venice.ai/api/v1/image/generate` and `/models` with `Origin: https://www.thewoovee.com` were refused by the sandbox egress proxy (`403 Forbidden` from the proxy). The spec and the image-generation guide contain no CORS statement ("No browser/CORS restrictions documented"). Re-test live; assume `proxy`.

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | yes | ~37 generation models (`GET /models?type=image`), e.g. `venice-sd35`, `qwen-image`, `qwen-image-2`, `nano-banana-pro`, `gpt-image-2`, `seedream-v5-pro`, `flux-2-max`, `lustify-*`, `z-image-turbo` — `POST /image/generate` (native) or `POST /images/generations` (OpenAI-compatible subset) |
| image→image / edit / inpaint | yes (prompt edit; legacy `inpaint` param disabled 2025-05-19) | 21 edit models, enum in spec: `firered-image-edit` (default), `qwen-edit-uncensored`, `grok-imagine-edit`, `grok-imagine-quality-edit`, `grok-imagine-image-2-0-edit`, `qwen-image-2-edit`, `qwen-image-2-pro-edit`, `wan-2-7-pro-edit`, `flux-2-max-edit`, `gpt-image-2-edit`, `gpt-image-1-5-edit`, `nano-banana-2-edit`, `nano-banana-pro-edit`, `nano-banana-2-lite-edit`, `luma-uni-1-edit`, `luma-uni-1-max-edit`, `muse-image-edit`, `seedream-v5-lite-edit`, `seedream-v5-pro-edit`, `seedream-v4-edit`, `qwen-image-3-edit`, `qwen-image-3-pro-edit` — `POST /image/edit` (1 image) and `POST /image/multi-edit` (N images, first = base, rest = layers/masks) |
| upscale | yes | `POST /image/upscale` (`scale` 2 or 4; one upscaler model, type `upscale`); also `POST /image/background-remove` |
| text→video | yes | 127 video models (`GET /models?type=video`): Wan 2.5/2.7/3.0, Seedance 2.0/2.5, Kling, Veo, Grok Imagine, MiniMax, PixVerse, Runway, LTX, Vidu… — `POST /video/queue` |
| image→video | yes | same, `image_url` (+ `end_image_url`, `reference_image_urls` ≤30, `keyframes`) |
| video→video / extend | yes (model-specific) | `video_url` (video-to-video, upscale/enhance via Topaz-style params), `reference_video_urls` ≤10 (Seedance R2V edit/extend, `omni_reference_task_type`) |
| audio in video | yes (model-specific) | `audio` bool (default true) when `constraints.audio_configurable`; `audio_url` background music (WAV/MP3 ≤30 s, ≤15 MB); `reference_audio_urls` ≤10 |

## Models
Model ids, prices and constraints are data-driven — read them from `GET /models?type=image|inpaint|upscale|video` at start-up rather than hard-coding. Representative rows (prices from https://docs.venice.ai/models/image and the pricing page, USD per image; 100 credits = $1):

| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| `venice-sd35` | text→image (pixel-based) | `width`/`height` ≤1280 (must be divisible by `constraints.widthHeightDivisor`), `steps` ≤ `constraints.steps.max`, `cfg_scale` 0–20, `seed`, `negative_prompt`, `style_preset`, `format` jpeg/png/webp (default webp) | prompt ≤ `constraints.promptCharacterLimit` | $0.01 |
| `qwen-image` / `qwen-image-2` | text→image (aspect-ratio based) | `aspect_ratio` (e.g. `1:1`, `16:9`); **rejects `width`/`height` with 400** | — | $0.03 (Qwen Image, since 2026-06-18) / $0.10 (Qwen Image 2 Pro) |
| `nano-banana-pro`, `gpt-image-2`, `seedream-v5-pro` | text→image (resolution-tier) | `aspect_ratio` + `resolution` `1K`\|`2K`\|`4K`; `quality` `low`\|`medium`\|`high` (GPT Image 2 only) | — | Nano Banana Pro $0.18–$0.35 by tier; GPT Image 2 $0.27–$0.84 by tier; GPT Image 1.5 $0.26; Seedream V5 Pro $0.06 (1K)–$0.11 (2K) |
| `lustify-sdxl`, `lustify-v7`, `anime` (WAI), `chroma`, `z-image-turbo` | text→image | pixel-based | — | $0.01–$0.02 |
| upscaler (type `upscale`) | upscale/enhance | `scale` 2\|4, `creativity` 0–0.02 | input ≥65,536 px, output ≤16,777,216 px, file <25 MB | 2x $0.02, 4x $0.08 |
| edit models (type `inpaint`) | edit | `prompt`, `image`, `aspect_ratio` (`auto` default), `resolution` (default `1K`), `output_format` | image ≥65,536 px and ≤33,177,600 px, <25 MB; multi-edit up to `capabilities.maxInputImages` | $0.02–$0.34 per edit + $0.0023–$0.03 per extra input image (`pricing.inputImages.included/additional`) |
| e.g. `wan-2.5-preview-text-to-video`, `seedance-2-0-text-to-video-basic`, Grok Imagine private models | text/image→video | `duration` `"1s"…"30s"` (typ. `"5s"`/`"10s"`), `resolution` `480p`\|`720p`\|`1080p`… (default `720p`), `aspect_ratio` `1:1`,`16:9`,`9:16`,`4:3`,`3:4`,… (model-specific; see `constraints.aspect_ratios/resolutions/durations`), `audio` bool | prompt ≤2,500 chars default (≤20,000 some models) | "Variable" — use `POST /video/quote` |

Model list entry shape (`ModelResponse`): `{"id","type","object":"model","owned_by","created","model_spec":{"name","description","privacy":"private"|"anonymized","traits":[…],"offline":bool,"beta","regionRestrictions":[…],"deprecation":{"startsAt","removesAt","replacementModelId","autoRemap"},"constraints":{…},"pricing":{…},"capabilities":{…}}}`.
- Image constraints: `promptCharacterLimit`, `steps{default,max}`, `widthHeightDivisor`, optional `aspectRatios`, `defaultAspectRatio`, `resolutions`, `defaultResolution`, `qualities`, `defaultQuality`, `maxStyleReferences`.
- Video constraints: `aspect_ratios[]`, `resolutions[]`, `durations[]`, `model_type`, `audio`, `audio_configurable`, `prompt_character_limit`, `topaz`.
- Pricing: images `pricing.generation{usd,diem}` or `pricing.resolutions{"1K":{usd,diem},…}` or `pricing.quality{…}`; upscale `pricing.upscale{"2x":{usd,diem},"4x":…}`; edits `pricing.inpaint{usd,diem}` + `pricing.inputImages{included, additional{usd,diem}}`. Video pricing is not in `/models` — quote it.
- `traits` (e.g. `default`, `default_code`) can be used instead of ids to auto-select a model.

## Endpoints (exact)
All under `https://api.venice.ai/api/v1`, `Authorization: Bearer`, JSON unless noted. Common errors: 400 `DetailedError`, 401 auth/tier, 402 `INSUFFICIENT_BALANCE`, 415 wrong content-type, 422 content-policy (`ContentViolationError`, `credits_refunded`), 429 rate limit (check `Retry-After`), 500, 503 model at capacity.

### POST /image/generate — sync
Request (minimal): `{"model":"venice-sd35","prompt":"..."}` (`model`, `prompt` required; prompt ≤7,500 chars, model-specific limit).
Optional: `negative_prompt`, `width`/`height` (0–1280, default 1024; pixel models), `aspect_ratio` (aspect models), `resolution` `"1K"|"2K"|"4K"` (tier models), `quality` `low|medium|high` (GPT Image 2), `steps` (default 8), `cfg_scale` 0–20, `seed` (±999,999,999), `style_preset` (ids from `GET /image/styles`), `format` `jpeg|png|webp` (default webp), `return_binary` (default false), `variants` 1–4 (only when `return_binary` is false), `safe_mode` (default **true**: blurs adult content), `hide_watermark` (default false), `embed_exif_metadata`, `lora_strength` 0–100, `enable_web_search`, `enhance_prompt` (rewrites prompt, extra charge, +~30 s; final prompt in `x-venice-enhanced-prompt` header), `disable_prompt_optimization_thinking`, `style_references:[{"image":"<b64|data URI|https URL <8MB>","strength":0.1–1}]` (models with `supportsStyleReferences`). `inpaint` is deprecated/disabled.
Response 200 (`application/json`): `{"id":"generate-image-1234567890","images":["<base64>", …],"request":{…},"timing":{"inferenceDuration","inferencePreprocessingTime","inferenceQueueTime","total"}}`; with `return_binary:true` the body is the raw image (`image/jpeg|png|webp`). Moderation headers: `x-venice-is-blurred`, `x-venice-is-content-violation`.

### POST /images/generations — sync, OpenAI-compatible subset
`{"model":"<venice id or 'default'>","prompt":"…","n":1,"size":"1024x1024","response_format":"b64_json"|"url","output_format":"png","moderation":"auto"|"low"}` — `n` max 1; prompt ≤1,500; `size` enum `auto|256x256|512x512|1024x1024|1536x1024|1024x1536|1792x1024|1024x1792`; `moderation:"low"` disables Safe Venice mode; `quality`, `style`, `background`, `output_compression`, `user` accepted but ignored; unknown model → Venice default. Response `{"created":…,"data":[{"b64_json":"…"}]}` or `{"url":"data:image/png;base64,…"}` (the "url" is a data URL, never remote).

### POST /image/upscale — sync, JSON or multipart
`{"image":"<base64 or data URI>","scale":2|4,"creativity":0.01}` (`image` required; multipart accepts a file field). Response 200: raw `image/png` bytes (no JSON).

### POST /image/edit — sync, JSON or multipart
`{"model":"qwen-image-2-edit","prompt":"remove the tree","image":"<base64 | data URI | https URL>","aspect_ratio":"auto","resolution":"1K","output_format":"png","safe_mode":true}` (`image`, `prompt` required; `model` default `firered-image-edit`; `modelId` deprecated alias; `enhance_prompt`, `disable_prompt_optimization_thinking`). Prompt ≤32,768. Response 200: raw `image/png|jpeg|webp` (PNG for 1K, JPEG for 2K/4K when `output_format` omitted).

### POST /image/multi-edit — sync, JSON or multipart
`{"modelId":"nano-banana-pro-edit","prompt":"…","images":["<b64|data URI|https URL>", …],"aspect_ratio":"auto","resolution":"2K","quality":"high","output_format":"webp"}` (`prompt`, `images` required; multipart = files only; first image is the base, others layers/masks; max = `capabilities.maxInputImages`). Response: raw image bytes.

### GET /models?type=image|inpaint|upscale|video|all — sync
Response `{"object":"list","type":"image","data":[ModelResponse…]}`. Default (no `type`) returns text models only. Also `GET /models/traits`, `GET /models/compatibility_mapping`, `GET /image/styles`.

### POST /video/queue — async
Request (minimal): `{"model":"wan-2.5-preview-text-to-video","prompt":"A gondola gliding through Venice canals at sunset","duration":"5s"}` (`model`, `prompt`, `duration` required). Optional: `negative_prompt`, `resolution` (`"480p"|"720p"|"1080p"|"4k"|…`, default 720p), `aspect_ratio` (`"16:9"` etc. or `"adaptive"|"auto"`), `audio` (default true), `image_url` (image-to-video: https URL **or** `data:image/…;base64,…`), `end_image_url`, `video_url` (MP4/MOV/WebM URL or data URL), `audio_url`, `reference_image_urls` (≤30), `reference_video_urls` (≤10, 2–15 s each, ≤50 MB, aggregate ≤15 s), `reference_audio_urls` (≤10), `reference_document_urls` (≤1, Wan 3.0), `elements` (≤4, Kling O3), `scene_image_urls` (≤4), `keyframes` (≤10, `{image_url, frame_index}` at 24 fps), `omni_reference_task_type` (`auto|reference|edit|extend`, Seedance 2.5), `consents.seedance{…}` (after a 409 `needs_consent`), upscale/enhancement fields (`upscale_factor` 1|2|4, `enhancement_model`, `target_fps` 16–120, `slowdown_factor`, `softness`, `creativity`, `realism`, `sharp`, `compression`, `noise`, `halo`, `grain`, `recover_detail`, `h264_output`, `output_format` mp4|prores).
Response 200: `{"model":"…","queue_id":"123e4567-…","download_url":"https://…"}` — `download_url` only for "VPS-backed" (private, e.g. Grok Imagine Private) models: a pre-signed URL valid 24 h; when present the retrieve endpoint returns JSON status only. Extra errors: 403 region, 409 `needs_consent` (Seedance face media), 413 payload too large, 422 content policy.

### POST /video/retrieve — poll (POST, not GET)
Request: `{"model":"<same model>","queue_id":"…","delete_media_on_completion":false}`.
Response: `application/json` `{"status":"PROCESSING","average_execution_time":145000,"execution_duration":53200}` while running (ms; P80 estimate → use for progress); when done either the body is the **raw `video/mp4`** (public models) or JSON `{"status":"COMPLETED",…}` (private models → then `GET download_url`). 404 = expired/deleted; 422 = provider content policy. Docs recommend polling about every 5 s. Rate limit 120/min for retrieve.

### POST /video/quote — sync
`{"model":"…","duration":"5s","resolution":"720p","aspect_ratio":"16:9","audio":true}` (+ `upscale_factor`, `target_fps`, `video_url`, `reference_video_total_duration` for R2V) → `{"quote": 0.42}` USD. Quotes are point-in-time.

### POST /video/complete — cleanup
`{"model":"…","queue_id":"…"}` → `{"success":true}`; deletes stored media (or set `delete_media_on_completion:true` on retrieve). Webhooks: none. Cancel: none (only post-hoc delete).

## Input media
- Images (edit/multi-edit/style refs): base64 string (raw or `data:` URI) or `http(s)://` URL in JSON; file upload in multipart. Limits: ≥65,536 px, ≤33,177,600 px, <25 MB (style refs <8 MB). Upscale: base64/file only (no URL), <25 MB, output ≤16.78 MP.
- Video inputs: always URL or data URL strings (`image_url`, `video_url`, `audio_url`, `*_urls`); data URLs allowed but watch the 413 payload cap (size unspecified) — prefer https URLs for large clips.

## Output media
- `/image/generate`: base64 array in JSON (default) or raw bytes with `return_binary`; `/images/generations`: `b64_json` or data URL. No remote URLs for images → no CORS/expiry issues.
- `/image/upscale`, `/image/edit`, `/image/multi-edit`: raw image bytes only (read `Content-Type`).
- Video: raw MP4 from `/video/retrieve` (auth header needed → via proxy), or pre-signed `download_url` (24 h, plain GET, optional `DELETE` to revoke; 410 when revoked/expired; keep source IP consistent). Browser CORS on the download host: unknown.
- Watermark: Venice adds a watermark unless `hide_watermark:true` (may be ignored for some content).

## Rate limits, quotas, free tier
- Defaults (https://docs.venice.ai/api-reference/rate-limiting): Image 20 req/min; Audio 60; Embedding 500; Video queue 40/min; Video retrieve 120/min; text tiers XS–L 500/75/50/20 RPM. Partner tier: Image 60/min. Headers: `x-ratelimit-limit-requests`, `x-ratelimit-remaining-requests`, `x-ratelimit-reset-requests`, `x-ratelimit-limit-tokens`, `x-ratelimit-remaining-tokens`, `x-ratelimit-reset-tokens`; live values via `GET /api_keys/rate_limits`; 429 carries `Retry-After`.
- Quotas: prepaid balance (`GET /billing/balance` → `balances.usd/diem`, `consumptionCurrency` USD|DIEM|BUNDLED_CREDITS), optional per-key 24 h spend cap. No free tier for the API.

## Gotchas
- Sizing is model-specific: pixel models (`width`/`height`), aspect models (`aspect_ratio`, and they 400 on width/height), resolution-tier models (`aspect_ratio` + `resolution` [+ `quality`]). Drive the form from `/models` constraints.
- `safe_mode` defaults to **true** (blurs), and on the OpenAI-compatible route only `moderation:"low"` turns it off. `hide_watermark` defaults to false.
- Edit/upscale/multi-edit return binary bodies; `/image/generate` returns JSON by default; `/images/generations` returns data URLs. Three different response shapes for images.
- `/video/retrieve` is a POST and needs the `model` id again; the finished response may be binary (public models) or JSON+`download_url` (private models) — branch on `Content-Type`.
- Video pricing is only available through `/video/quote`; `/models` carries constraints but not video prices.
- 409 `needs_consent` on some Seedance models requires re-submitting with `consents.seedance{confirmed_terms_and_privacy, confirmed_legal_right, confirmed_screening_acknowledged}: true`.
- Region 403s and Pro-only 401s are per model; surface the error message.
- `enhance_prompt` adds cost and ~30 s latency; `enable_web_search` adds $10/1k requests.
- Deprecation info arrives both in `/models` (`model_spec.deprecation`) and in the `x-venice-model-deprecation-date` response header; `autoRemap` may silently swap models.
- Several "Venice" models are pass-throughs to third parties (`privacy: "anonymized"`, e.g. GPT Image 2, Nano Banana, Grok Imagine, Seedance); `private` models have zero data retention.

## Adapter mapping notes
- Discovery: on connect, call `GET /models?type=image`, `?type=inpaint`, `?type=upscale`, `?type=video`; cache `constraints`, `pricing`, `privacy`, `offline`, `deprecation` and build the parameter UI from them (which of width/height, aspect_ratio, resolution, quality, steps, cfg_scale apply).
- text→image → `POST /image/generate` (JSON base64, `variants` ≤4, `format:"webp"` or `"png"`); expose `safe_mode`, `hide_watermark`, `negative_prompt`, `seed`, `style_preset` (from `/image/styles`).
- image edit → `POST /image/edit` with data URI; multi-image → `/image/multi-edit`; both return bytes → proxy returns `Content-Type` through. No alpha-mask parameter: treat as prompt-based editing (layers via multi-edit).
- upscale → `POST /image/upscale` (2x/4x); price from `pricing.upscale`.
- text→video / image→video / references → `POST /video/queue`; job = `{model, queue_id, download_url?}`; poll `POST /video/retrieve` every 5 s through the proxy; progress = `execution_duration / average_execution_time`; on `video/mp4` store the blob, on `COMPLETED` fetch `download_url`; then `POST /video/complete`.
- Cost estimate: images from `/models` pricing (per resolution/quality tier + extra input images); video via `POST /video/quote` before submit (show the number, quotes are point-in-time).
- Transport: proxy (binary passthrough + unknown CORS); if the live preflight passes, only the binary handling still argues for the proxy.
