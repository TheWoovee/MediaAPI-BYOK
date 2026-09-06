# Runway API (developer portal)

- Website / docs: https://docs.dev.runwayml.com/api/ (API reference), https://docs.dev.runwayml.com/guides/using-the-api/ , https://docs.dev.runwayml.com/guides/models/ , https://docs.dev.runwayml.com/assets/inputs/ , https://docs.dev.runwayml.com/guides/pricing/ , https://docs.dev.runwayml.com/usage/tiers/ , https://docs.dev.runwayml.com/api-details/versions/2024-11-06/ , https://docs.dev.runwayml.com/errors/troubleshooting/ . Console: https://dev.runwayml.com . Ground truth for shapes: official `@runwayml/sdk` 4.20.0 (npm, published 2026-09-04, Stainless-generated from Runway's OpenAPI spec) — `src/resources/*.ts`, `src/client.ts`.
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter). docs.dev.runwayml.com and api.dev.runwayml.com were blocked by the sandbox egress proxy; doc pages were read via search snippets only.
- Adapter id: `runway`  ·  Transport: `proxy` (CORS unverified; docs say the API is server-side and keys must not ship to browsers)  ·  Priority wave: 1

## Account and authentication
- How to get a key: sign in at https://dev.runwayml.com , create an Organization, buy credits (credits cost $0.01 each; a minimum $10 top-up is required before the first call — third-party summaries of the pricing page), then Settings → API Keys. API credits are a separate pool from runway.com subscription credits.
- Auth header exact format: `Authorization: Bearer <RUNWAYML_API_SECRET>` **and** `X-Runway-Version: 2024-11-06` (required on every request; SDK `client.ts` sets `runwayVersion = '2024-11-06'`). `Content-Type: application/json`.
- Base URL(s) and regions: `https://api.dev.runwayml.com` (single global endpoint).

## Browser (CORS) behaviour
- Result of preflight test from origin https://www.thewoovee.com: **unknown**. `curl -X OPTIONS https://api.dev.runwayml.com/v1/image_to_video` returned `403 Forbidden` from the sandbox's egress proxy (CONNECT denied by policy), so Runway was never reached. Runway documents the API as server-to-server; assume no CORS and use the Worker.

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | yes | `POST /v1/text_to_image` — gen4_image, gen4_image_turbo (needs 1–3 reference images), plus hosted third-party: gpt_image_2, gemini_image3_pro, gemini_image3.1_flash, gemini_2.5_flash, muse_image, seedream5_pro, seedream5_lite, grok_imagine_image_2 |
| image→image / edit / inpaint | via `referenceImages` (+ `@tag` in prompt); `edit:true` on grok_imagine_image_2; no mask inpaint | `POST /v1/text_to_image` |
| upscale | yes | `POST /v1/image_upscale` (magnific_precision_upscaler_v2, scaleFactor 2/4/8/16), `POST /v1/video_upscale` (magnific_video_upscaler_creative, 720p/1k/2k/4k). Legacy `upscale_v1`: not in current SDK (removed — unverified) |
| text→video | yes | `POST /v1/text_to_video` — gen4.5 (ratio 1280:720 \| 720:1280, duration 2–10), veo3.1, veo3.1_fast, hailuo3, happyhorse1.0, seedance2, seedance2_fast, seedance2_mini, seedance2.5, gemini_omni_flash(1.1), grok_imagine1.5, wan3, wan3_prime, h3_max |
| image→video | yes | `POST /v1/image_to_video` — gen4.5, gen4_turbo, veo3.1(_fast) (first+last), hailuo3, happyhorse1.0, seedance2*, seedance2.5, gemini_omni_flash*, grok_imagine1.5, wan3(_prime), h3_max. `gen3a_turbo` and `gen4_aleph` are gone from the SDK (deprecated, sunset 2026-07-30 per third-party reports) |
| video→video / extend | yes | `POST /v1/video_to_video` — aleph2 (replaces gen4_aleph), hailuo3, seedance2*, seedance2.5, gemini_omni_flash*. `POST /v1/character_performance` — act_two |
| audio in video | model-dependent | `audio: true` on veo3.1/veo3.1_fast/seedance2* (SDK); gen4.5 / gen4_turbo have no audio flag |

## Models
| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| `gen4.5` | i2v, t2v | `duration` integer 2–10 (required), `ratio` 1280:720 \| 720:1280 \| 1104:832 \| 960:960 \| 832:1104 \| 1584:672 (t2v: 1280:720 \| 720:1280 only), `promptText` required ≤1000 chars, `promptImage` string or `[{position:"first",uri}]`, `seed`, `outputFormat` mp4 (default) \| prores \| png_sequence \| hdr10 \| hlg \| … , `contentModeration.publicFigureThreshold` auto \| low | | 12 credits/s ($0.12/s → $0.60 per 5 s) per third-party summaries of the rate card; non-mp4 formats +5 credits/s (prores/png) or +20–40 credits/s (10-bit+/HDR) per SDK docstring |
| `gen4_turbo` | i2v (image required) | `duration` 5 \| 10 (SDK: number; ComfyUI enum 5,10), `ratio` as gen4.5, `promptText` optional | | 5 credits/s ($0.05/s → $0.25 per 5 s) |
| `veo3.1`, `veo3.1_fast` | t2v, i2v (first + optional last) | `ratio` 1280:720 \| 720:1280 \| 1920:1080 \| 1080:1920; `duration` 4 \| 6 \| 8; `audio` bool; `negativePrompt` | | unverified |
| `aleph2` | v2v edit | `videoUri`, `promptText`, optional `keyframes` (≤5, `{seconds\|at, uri, range?}`), `promptImage` (≤5, position `{type:"timestamp",timestampSeconds}` or `{type:"position",positionPercentage}`), `ratio`, `targetAspectRatio`, `outputFormat` | input video 2–30 s (ComfyUI validation) | 28 credits/s, 56-credit minimum (third-party summary); ComfyUI badge $0.40/s |
| `act_two` | character performance | `character: {type:"image"\|"video", uri}`, `reference: {type:"video", uri}`, `bodyControl` bool, `expressionIntensity` int, `ratio` 1280:720 \| 720:1280 \| 960:960 \| 1104:832 \| 832:1104 \| 1584:672, `seed` | | unverified (commonly 5 credits/s) |
| `gen4_image` | t2i (+ up to 3 refs) | `ratio` 1024:1024 \| 1080:1080 \| 1168:880 \| 1360:768 \| 1440:1080 \| 1080:1440 \| 1808:768 \| 1920:1080 \| 1080:1920 \| 2112:912 \| 1280:720 \| 720:1280 \| 720:720 \| 960:720 \| 720:960 \| 1680:720; `promptText` ≤1000; `referenceImages[{uri, tag?}]` (tag 3–16 chars, letters/digits/_ , referenced as `@tag` in prompt) | | ≈ 5 credits (720p) / 8 credits (1080p) per image — unverified; ComfyUI badge $0.11 |
| `gen4_image_turbo` | t2i with refs | same ratios; `referenceImages` **required** (1–3) | | ≈ 2 credits per image — unverified |
| `magnific_precision_upscaler_v2` | image upscale | `imageUri`, `scaleFactor` 2 \| 4 \| 8 \| 16, `flavor` sublime \| photo \| photo_denoiser | | unverified |
| `magnific_video_upscaler_creative` | video upscale | `videoUri`, `resolution` 720p \| 1k \| 2k \| 4k, `fpsBoost` | | unverified |

Every create call returns `estimatedCost.credits` (maximum charge, refunded down after completion) — show it in the UI before polling.

## Endpoints (exact)
All generation endpoints are async and return `{"id":"<task uuid>","estimatedCost":{"credits":n}}` (HTTP 200).
- `POST https://api.dev.runwayml.com/v1/image_to_video` — `{"model":"gen4_turbo","promptImage":"https://... or data:image/png;base64,...","promptText":"...","ratio":"1280:720","duration":5,"seed":123}`; multi-position form `"promptImage":[{"uri":"...","position":"first"},{"uri":"...","position":"last"}]` (last only on models that support it, e.g. veo3.1; gen4.5/gen4_turbo accept `first` only).
- `POST /v1/text_to_video` — `{"model":"gen4.5","promptText":"...","ratio":"1280:720","duration":5}`.
- `POST /v1/text_to_image` — `{"model":"gen4_image","promptText":"...","ratio":"1920:1080","referenceImages":[{"uri":"https://...","tag":"hero"}]}`.
- `POST /v1/video_to_video` — `{"model":"aleph2","videoUri":"https://...mp4","promptText":"...","ratio":"1280:720"}`.
- `POST /v1/character_performance` — `{"model":"act_two","character":{"type":"image","uri":"..."},"reference":{"type":"video","uri":"..."},"ratio":"1280:720","bodyControl":true,"expressionIntensity":3}`.
- `POST /v1/image_upscale`, `POST /v1/video_upscale` — see table.
- `POST /v1/uploads` — `{"filename":"x.png","type":"ephemeral"}` → `{"runwayUri":"runway://...","uploadUrl":"https://...","fields":{...}}`; then multipart `POST uploadUrl` with `fields` + `file`; use `runwayUri` anywhere a `uri` is accepted (ephemeral, auto-expires).
- `GET /v1/tasks/{id}` → one of: `{"id","createdAt","status":"PENDING","estimatedCost":{credits}}`, `{"status":"THROTTLED",…}` (over concurrency limit, not yet enqueued), `{"status":"RUNNING","progress":0.42,…}`, `{"status":"SUCCEEDED","cost":{"credits":n},"output":["https://..."]}`, `{"status":"FAILED","failure":"<message>","failureCode":"<code>","cost":{credits}}`, `{"status":"CANCELLED","cost":{credits}}`. Docs: do not poll more often than every 5 s per task.
- `DELETE /v1/tasks/{id}` — cancels PENDING/THROTTLED/RUNNING tasks; deletes finished ones (their outputs are purged). 204 on success.
- Webhooks: none in the SDK for tasks (organization-level "routers"/"workflows" exist but are out of scope).

## Input media
- Any `uri`/`promptImage`/`videoUri` accepts: (a) HTTPS URL — must start with `https://`, be a domain not an IP, be fetchable by Runway with a supported `Content-Type` header (and stay under the per-type size caps; docs also mention the server should return a Content-Length — unverified); (b) base64 data URI `data:image/png;base64,...` **≤ 5 MB encoded (~3.3 MB binary)**; (c) a Runway upload URI from `/v1/uploads`. Images: png/jpeg/webp; aspect ratio must be within 0.5–2.0 (docs; unverified exact). Videos for aleph2/act_two: 2–30 s (ComfyUI validation).
- Reference image tags: 3–16 chars, start with a letter, letters/digits/underscore only.

## Output media
- `output[]` HTTPS URLs (mp4 by default; png for images; zip for sequences). Docs state outputs are ephemeral and should be downloaded promptly (retention window unverified; commonly quoted as 24–48 h). Deleting the task deletes the output. Browser fetch of the output host: unknown → proxy.

## Rate limits, quotas, free tier
- No free tier for the API (must buy credits). Concurrency limits by usage tier (docs "Usage tiers & limits"); exceeding them yields `THROTTLED` tasks rather than HTTP 429. 429 is returned for request-rate limits. Credits: $0.01 each; unused estimated credits are refunded when the task finishes.

## Gotchas
- Missing `X-Runway-Version` → 400. The version string is a date; pin `2024-11-06`.
- `gen3a_turbo`, `gen4_aleph`, `upscale_v1` are no longer in the SDK; do not expose them (sunset 2026-07-30 per third-party notes — unverified).
- `gen4.5` requires `duration` (2–10) and `promptText`; `gen4_turbo` requires an image.
- `THROTTLED` is a normal pre-queue state, not an error; keep polling.
- Data-URI cap (5 MB) is easy to blow with phone photos — downscale client-side or use `/v1/uploads` / R2 URLs.
- `estimatedCost` is a max; final `cost` may be lower.
- `outputFormat` other than mp4 adds large per-second surcharges.

## Adapter mapping notes
- text→image → `/v1/text_to_image` (gen4_image default; gen4_image_turbo when the user supplies ≥1 reference). Our aspect presets → Runway `ratio` strings (1920:1080, 1080:1920, 1024:1024, …). Refs → `referenceImages[]` with optional tags.
- image→video → `/v1/image_to_video` (gen4_turbo default, gen4.5 when the user picks quality); text→video → `/v1/text_to_video` (gen4.5). Map our duration to 5/10 (gen4_turbo) or 2–10 (gen4.5); aspect → ratio list.
- video→video → `/v1/video_to_video` (aleph2); performance transfer → `/v1/character_performance` (act_two).
- Poll `GET /v1/tasks/{id}` every 5 s; terminal = SUCCEEDED/FAILED/CANCELLED. Cancel → `DELETE /v1/tasks/{id}`.
- Large local files → Worker uploads to R2 (HTTPS URL) or calls `/v1/uploads` to get a `runway://` URI.
- Show `estimatedCost.credits × $0.01` before/after submit.
