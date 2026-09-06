# Together AI (images + video) — and Fireworks AI (images)

- Website / docs: https://www.together.ai · Images reference: https://docs.together.ai/reference/post_images-generations · Images guide: https://docs.together.ai/docs/images-overview · Video reference: https://docs.together.ai/reference/create-videos · Serverless model list (image models section): https://docs.together.ai/docs/serverless/models · Pricing: https://www.together.ai/pricing · Rate limits: https://docs.together.ai/docs/rate-limits · Model pages (price per model): `https://www.together.ai/models/<slug>` (e.g. https://www.together.ai/models/flux-1-schnell, /flux-1-kontext-pro, /flux-2-pro, /sora-2, /seedance-2-5, /vidu-2-0) · Blog (40+ image/video models): https://www.together.ai/blog/40-new-image-and-video-models · Official OpenAPI: https://github.com/togethercomputer/openapi · SDK sources used for cross-checking: https://github.com/togethercomputer/together-typescript (`api.md`, `src/resources/images.ts`, `src/resources/videos.ts`), https://github.com/togethercomputer/together-python (`src/together/resources/images.py`, `videos.py`)
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter). NOTE: docs.together.ai, together.ai, api.together.xyz, docs.fireworks.ai, fireworks.ai and api.fireworks.ai were **blocked by the research sandbox's egress proxy**, so facts below come from search-engine snippets of the official docs, the official SDK sources on GitHub (which embed the OpenAPI field docs verbatim), and the Vercel AI SDK provider sources for Fireworks URL patterns. Items marked "unverified" could not be confirmed against the page itself.
- Adapter id: `together` (Fireworks: `fireworks`)  ·  Transport: `proxy` (CORS unknown for both)  ·  Priority wave: 3

## Account and authentication
- Get a key: sign up at https://api.together.ai (or https://api.together.xyz) → Settings → API Keys (exact console path unverified). Free: promotional signup credits ("Start free with promotional credits", amount unverified; historically $1) plus the permanently free, rate-limited model `black-forest-labs/FLUX.1-schnell-Free`.
- Auth header (exact): `Authorization: Bearer <TOGETHER_API_KEY>` (OpenAPI `bearerAuth`).
- Base URLs: `https://api.together.xyz/v1` (classic, used by SDK defaults and most docs) and `https://api.together.ai/v1` (OpenAPI `servers`) — both serve the same API. **Video lives under `/v2`:** `https://api.together.ai/v2/videos` (OpenAPI per-operation `servers`; TS SDK base `https://api.together.ai/v2`). No regions.

## Browser (CORS) behaviour
- Result: **unknown**. `OPTIONS https://api.together.xyz/v1/images/generations` with `Origin: https://www.thewoovee.com` could not be executed (sandbox egress proxy `403` on CONNECT). Hint: the official TypeScript SDK README lists "Web browsers (Up-to-date Chrome, Firefox, Safari, Edge, and more)" among supported runtimes, which suggests the API sends CORS headers, but no explicit CORS statement was found. Plan for `proxy`; re-test:
  `curl -s -o /dev/null -D - -X OPTIONS -H "Origin: https://www.thewoovee.com" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type" https://api.together.xyz/v1/images/generations`

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | yes | `black-forest-labs/FLUX.1-schnell`, `FLUX.1-schnell-Free`, `FLUX.1-dev`, `FLUX.1-dev-lora`, `FLUX.1-pro`, `FLUX.1.1-pro`, FLUX.2 [pro]/[flex]/[max], Nano Banana Pro, Stable Diffusion, Dreamshaper (per docs/blog; exact ids for FLUX.2/Nano Banana unverified) — `POST /v1/images/generations` |
| image→image / edit / inpaint | yes (prompted edit, no mask) | `black-forest-labs/FLUX.1-kontext-pro`, `FLUX.1-kontext-max`, `FLUX.1-kontext-dev` via `image_url`; `FLUX.1-canny`, `FLUX.1-depth`, `FLUX.1-redux` (control/variation via `image_url`); `reference_images[]` on models that support it (FLUX.2 edit — unverified) |
| upscale | no | not offered (unverified) |
| text→video | yes | `openai/sora-2`, `google/veo-2.0`, Veo 3.0, `ByteDance/Seedance-2.5`, `vidu/vidu-2.0`, Wan 2.7 suite, 20+ others — `POST /v2/videos` |
| image→video | yes | same endpoint with `media.frame_images[{input_image, frame:"first"}]` (i2v-capable models) |
| video→video / extend | yes (model-dependent) | `media.source_video` (video edit), `media.frame_videos` (starting clips), `media.reference_videos` — Wan 2.7 edit etc. |
| audio in video | yes | `generate_audio: true`; `media.audio_inputs[]` for audio-conditioned models |

## Models
Together bills FLUX non-pro models **per megapixel scaled by steps**: `Cost = MP × price_per_MP × (steps ÷ default_steps)` where `MP = width×height/1e6`, only when `steps` exceeds the default (fewer steps do not reduce cost) (https://docs.together.ai/docs/images-overview pricing note / https://www.together.ai/pricing). Pro/Kontext/Nano-Banana models are flat per image. Video is flat per clip ($0.14–$3.20 per video across the catalog per a pricing mirror). Specific figures below are marked unverified unless seen in an official snippet.

| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| `black-forest-labs/FLUX.1-schnell-Free` | t2i | `prompt`, `width`, `height` (default 1024×1024), `steps` 1–4, `n`, `seed`, `response_format` `url`\|`base64` | rate-limited free tier (≈10 img/min historically; unverified); `disable_safety_checker` not allowed | free |
| `black-forest-labs/FLUX.1-schnell` | t2i | as above (`steps` default 4 in examples) | — | per MP (≈$0.0027/MP — unverified) |
| `black-forest-labs/FLUX.1-dev` · `FLUX.1-dev-lora` | t2i (+LoRA) | `steps` (default 28), `guidance_scale` (3.5), `negative_prompt`, `image_loras[{path,scale}]` | — | per MP (≈$0.025/MP — unverified) |
| `black-forest-labs/FLUX.1-pro` · `black-forest-labs/FLUX.1.1-pro` | t2i | `width`/`height`, `steps`, `seed`; safety checker cannot be disabled | — | per MP (≈$0.04/MP for 1.1 pro — unverified) |
| `black-forest-labs/FLUX.1-kontext-pro` · `FLUX.1-kontext-max` · `FLUX.1-kontext-dev` | edit | `prompt`, `image_url` (https URL or data URI), `width`/`height`, `seed`, `output_format` | 1 input image, no mask | pro ≈$0.04/image, max ≈$0.08/image, dev per MP (unverified) |
| `black-forest-labs/FLUX.1-canny` · `FLUX.1-depth` · `FLUX.1-redux` | control / variation | `image_url` | — | unverified |
| FLUX.2 [pro] / [flex] / [max] (model pages https://www.together.ai/models/flux-2-pro, /flux-2-flex, /flux-2-max; API ids unverified, probably `black-forest-labs/FLUX.2-pro` etc.) | t2i / edit (`reference_images[]`) | `width`/`height`, `steps` (flex) | — | unverified |
| Nano Banana Pro, Stable Diffusion XL (`stabilityai/stable-diffusion-xl-base-1.0`), Dreamshaper | t2i | `width`/`height`, `steps`, `negative_prompt` | — | unverified |
| `openai/sora-2` | t2v / i2v, audio | `prompt`, `seconds` (`"4"`,`"8"`,`"12"`), `resolution`/`ratio` | — | per clip (unverified; model page https://www.together.ai/models/sora-2) |
| `google/veo-2.0` · Veo 3.0 (id unverified) | t2v / i2v | `seconds` `"5"`–`"8"`, `ratio` 16:9/9:16, `generate_audio` (Veo 3) | 8 s | per clip (unverified) |
| `ByteDance/Seedance-2.5` (also Seedance 1.x/2.0 — ids unverified) | t2v / i2v, audio | `seconds` 4–30, `resolution` 480p/720p, `fps` 24 | — | per clip (unverified; https://www.together.ai/models/seedance-2-5) |
| `vidu/vidu-2.0` | t2v / i2v | `seconds` up to 8 | 8 s | per clip (unverified; https://www.together.ai/models/vidu-2-0) |
| Wan 2.7 suite (t2v, i2v, reference-to-video, edit; ids unverified) | t2v / i2v / ref2v / edit, audio | 720p/1080p, up to 15 s | — | unverified (https://www.together.ai/blog/wan-2-7-now-available-on-together-ai) |

## Endpoints (exact)

### POST https://api.together.xyz/v1/images/generations — sync
Request (OpenAPI/TS SDK field docs verbatim):
```json
{
  "model": "black-forest-labs/FLUX.1-schnell",
  "prompt": "cat floating in space, cinematic",
  "width": 1024, "height": 1024,
  "steps": 4, "n": 1, "seed": 42,
  "negative_prompt": "...",
  "response_format": "url",
  "output_format": "jpeg",
  "guidance_scale": 3.5,
  "image_url": "https://... or data:image/png;base64,...",
  "image_loras": [{"path": "https://huggingface.co/.../lora", "scale": 1}],
  "reference_images": ["https://..."],
  "disable_safety_checker": false
}
```
Required: `model`, `prompt`. Defaults: `steps` 20, `n` 1, `width`/`height` 1024, `guidance_scale` 3.5, `output_format` `jpeg`, `response_format` `url` (returns hosted URLs; `"base64"` embeds the image). Notes: "Maximum length [of prompt] varies by model"; `image_url` = "URL of an image to use for image models that support it" (the Vercel provider sends data URIs here and it works); `reference_images` = "array of image URLs that guide the overall appearance and style"; `disable_safety_checker` "not available for Flux Schnell Free and Flux Pro models". Some docs also mention `image_base64` — unverified (not in the OpenAPI schema).
Response `200`: `{"id":"...","model":"black-forest-labs/FLUX.1-schnell","object":"list","data":[{"index":0,"type":"url","url":"https://..."}]}` or `{"index":0,"type":"b64_json","b64_json":"..."}` when `response_format: "base64"`. Synchronous; no polling, no cancel, no webhooks. Errors: `{"error":{"message":"...","type":"...","code":"..."}}`.

### POST https://api.together.ai/v2/videos — async create
Request (`CreateVideoBody`, all optional except `model`):
```json
{
  "model": "openai/sora-2",
  "prompt": "A cartoon of an astronaut riding a horse on the moon",
  "width": 1280, "height": 720, "resolution": "720p", "ratio": "16:9",
  "seconds": "8", "fps": 24, "steps": 30, "seed": 1,
  "guidance_scale": 7, "output_format": "MP4", "output_quality": 20,
  "negative_prompt": "...", "generate_audio": true,
  "media": {
    "frame_images": [{"input_image": "https://...", "frame": "first"}],
    "reference_images": ["https://..."],
    "reference_videos": [{"video": "https://..."}],
    "frame_videos": [{"video": "https://..."}],
    "source_video": "https://...",
    "audio_inputs": ["https://..."]
  }
}
```
Field docs: `prompt` 1–32000 chars; `seconds` is a **string**; `fps` defaults 24; `steps` 10–50; `guidance_scale` "recommended range 6.0–10.0"; `output_format` `MP4`|`WEBM`; `output_quality` default 20; `media.frame_images[].frame` = number | `"first"` | `"last"` (heuristics if omitted: one image → first; two → first+last; more → evenly spaced); `media.source_video` = URL string or `{"video": url}`; `media.audio_inputs[]` = URL string or `{"audio": url}`. Top-level `frame_images` / `reference_images` still work but are **deprecated** in favour of `media.*`. Which `media` fields a model accepts "depend on the model type (i2v, r2v, t2v, videoedit)".
Response `200` (`VideoJob`): `{"id":"...","object":"video","model":"openai/sora-2","status":"in_progress","created_at":1725600000,"size":"1280x720","seconds":"8"}`.

### GET https://api.together.ai/v2/videos/{id} — poll
Returns `VideoJob`: `status` ∈ `in_progress` | `completed` | `failed` (only three values); on completion `"completed_at": <unix>`, `"outputs": {"cost": <number>, "video_url": "https://..."}`; on failure `"error": {"code": "...", "message": "..."}`. Polling interval not documented — use 5 s. No cancel endpoint, no webhooks documented for video (unverified).

### Files API (optional): `POST /v1/files/upload`, `GET /v1/files/{id}/content` exist (TS `api.md`) but are for fine-tuning data; whether their URLs are accepted as `image_url`/`media` inputs is unverified.

## Input media
- Images: `image_url` accepts an HTTPS URL or a `data:` URI (Vercel provider converts files to data URIs and posts them). Size limit unverified.
- Video inputs (`media.*`) are URLs only ("URL path to hosted image"); base64 unverified → host inputs (e.g. via a temporary R2 signed URL in phase 3) before calling `/v2/videos`.

## Output media
- Images: `response_format: "url"` → hosted URL (host and expiry unverified — download promptly); `response_format: "base64"` → inline JPEG/PNG (`output_format`), no second fetch needed (recommended for the SPA).
- Video: `outputs.video_url` hosted MP4/WEBM; host, expiry and CORS unverified → route through the Worker `/api/fetch?url=` once the host is known.

## Rate limits, quotas, free tier
- Per-model RPM/TPM limits by account tier (Build/Scale/Enterprise, growing with spend), visible in the console; `429` on throttle; honour `Retry-After` (https://docs.together.ai/docs/rate-limits — specific numbers unverified).
- `FLUX.1-schnell-Free`: free but tightly rate-limited (unverified figure).
- Billing: prepaid credits / postpaid; images priced per MP × steps (non-pro) or per image; videos per clip.

## Gotchas
- Two hostnames (`api.together.xyz`, `api.together.ai`) and two API versions: images on `/v1`, **video on `/v2`**.
- `seconds` is a string; `steps` above the model default raises the price proportionally, below does not lower it.
- `response_format` values are `url` | `base64` (not OpenAI's `b64_json`), yet the *response* item type is `b64_json` — don't reuse the OpenAI-compatible adapter blindly.
- Video status has no `queued` state and no cancel; failed jobs may still bill (unverified).
- `media.*` is the current input container; top-level `frame_images`/`reference_images` are deprecated.
- Kontext editing is prompt-only (no mask) and single-image.

## Adapter mapping notes
- Transport: `/api/proxy/together/*` → `https://api.together.xyz/v1/*` and `/v2/*` → `https://api.together.ai/v2/*` (or use `api.together.ai` for both); forward `authorization`, `content-type`, `accept`.
- Images: our t2i → `POST /v1/images/generations` with `width`/`height` from our size, `steps`, `seed`, `n`, `negative_prompt`, `response_format: "base64"` (skip output fetch); our edit → same endpoint with a Kontext model and `image_url` = data URI of the input blob. Sync: run behind a 60–120 s client timeout, no job record needed beyond retry.
- Video: `POST /v2/videos` → store `id` → poll `GET /v2/videos/{id}` every 5 s until `completed`/`failed` → `outputs.video_url` via `/api/fetch`. i2v = `media.frame_images[{input_image: <hosted URL>, frame: "first"}]` — requires hosted inputs (phase-3 R2 signed URLs) since data URIs are unverified. Our `duration` → `seconds` string; `aspect` → `ratio`; `resolution` → `resolution`; `audio` → `generate_audio`.
- Cost display: images = MP × per-MP × max(1, steps/default) for non-pro FLUX, flat for pro/Kontext; video = per-clip (`outputs.cost` is returned after completion — surface it).
- Model picker: seed with the table; `GET /v1/models` (models API) can list serverless models and their `type` — filter `type == "image"`/`"video"` (field names unverified).

---

# Fireworks AI (image generation)

- Website / docs: https://fireworks.ai · Image API reference (FLUX text-to-image): https://docs.fireworks.ai/api-reference/generate-a-new-image-from-a-text-prompt · FLUX Kontext (async): https://docs.fireworks.ai/api-reference/generate-or-edit-image-using-flux-kontext and https://docs.fireworks.ai/api-reference/get-generated-image-from-flux-kontex · FLUX capabilities FAQ: https://docs.fireworks.ai/faq/models/image-generation/flux · API intro: https://docs.fireworks.ai/api-reference/introduction · Pricing: https://fireworks.ai/pricing · FLUX launch blog (per-step pricing): https://fireworks.ai/blog/flux-launch · SDXL img2img/ControlNet blog: https://fireworks.ai/blog/new-in-fireworks-image-to-image-and-controlnet-support-for-ssd-1b-and-sdxl · Model pages: https://fireworks.ai/models/fireworks/flux-kontext-pro · URL patterns and async schema cross-checked from the Vercel AI SDK provider source: https://github.com/vercel/ai/blob/main/packages/fireworks/src/fireworks-image-model.ts (and `fireworks-image-api.ts`, `fireworks-image-model-options.ts`)
- Last verified: 2026-09-06 — docs.fireworks.ai/api.fireworks.ai blocked in the sandbox (see note at top).
- Adapter id: `fireworks`  ·  Transport: `proxy` (CORS unknown)  ·  Priority wave: 3

## Account and authentication (Fireworks)
- Get a key: sign up at https://fireworks.ai → app.fireworks.ai → API Keys (exact path unverified). New users get **$1 in free credits** (pricing mirror; unverified against the page).
- Auth header: `Authorization: Bearer <FIREWORKS_API_KEY>`.
- Base URL: `https://api.fireworks.ai/inference/v1` (image workflows live under `/workflows/...` and legacy `/image_generation/...`). No regions.

## Browser (CORS) behaviour (Fireworks)
- Result: **unknown** — preflight to `https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-1-dev-fp8/text_to_image` blocked by the sandbox proxy (`403` on CONNECT); no CORS statement found. Plan `proxy`; re-test with the standard curl.

## Capabilities (Fireworks)
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | yes | `accounts/fireworks/models/flux-1-dev-fp8`, `flux-1-schnell-fp8` (sync workflows); `flux-kontext-pro`, `flux-kontext-max` (async workflows); legacy `stable-diffusion-xl-1024-v1-0`, `SSD-1B`, `playground-v2-5-1024px-aesthetic`, `playground-v2-1024px-aesthetic`, `japanese-stable-diffusion-xl` (`/image_generation`) |
| image→image / edit / inpaint | yes (Kontext prompted edit; SDXL img2img/ControlNet) | Kontext: `input_image`, no mask; FLUX dev/schnell: **no** image-to-image (FAQ); SDXL/SSD-1B: `/image_to_image` and `/control_net` (canny etc.) |
| upscale | no | — |
| text→video / image→video / video→video | no | Fireworks has no video generation API (unverified but none documented) |
| audio in video | n/a | — |

## Models (Fireworks)
| Model id | Type | Key params | Limits | Price |
|---------|------|-----------|--------|-------|
| `accounts/fireworks/models/flux-1-dev-fp8` | t2i (sync) | `prompt`, `aspect_ratio` (e.g. `"16:9"`; list per docs: `1:1, 21:9, 16:9, 3:2, 5:4, 4:5, 2:3, 9:16, 9:21` — unverified), `guidance_scale` (3.5), `num_inference_steps` (30 in docs example), `seed`, `samples` (Vercel sends `samples: n`; unverified) | no `width`/`height`; no img2img | $0.0005 per step (≈$0.014/image at defaults) (https://fireworks.ai/blog/flux-launch) |
| `accounts/fireworks/models/flux-1-schnell-fp8` | t2i (sync) | same; `num_inference_steps` ~4 | — | $0.00035 per step (≈$0.0014/image) |
| `accounts/fireworks/models/flux-kontext-pro` · `flux-kontext-max` | t2i / edit (async) | `prompt`, `input_image` (base64 data URI or URL), `aspect_ratio`, `seed`, `output_format` `jpeg`\|`png`, `prompt_upsampling`, `safety_tolerance` 0–6 (max 2 with an input image), `webhook_url`, `webhook_secret` | 1 input image, no mask | unverified (BFL list price $0.04 / $0.08 per image) |
| `accounts/fireworks/models/stable-diffusion-xl-1024-v1-0` (+ `SSD-1B`, Playground v2/v2.5, Japanese SDXL) | t2i / img2img / ControlNet (sync) | `prompt`, `negative_prompt`, `width`, `height`, `cfg_scale`, `steps`, `seed`, `samples`, `sampler` | — | per step (SDXL ≈$0.00013/step — unverified) |

## Endpoints (exact) (Fireworks)
- **FLUX dev/schnell (sync):** `POST https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-1-dev-fp8/text_to_image` with `Content-Type: application/json`, **`Accept: image/jpeg`** (or `image/png`) and body `{"prompt":"Woman laying in the grass","aspect_ratio":"16:9","guidance_scale":3.5,"num_inference_steps":30,"seed":0}` → response body is the **raw image bytes** (docs example saves with `--output output.jpg`; Vercel uses a binary response handler). A JSON/base64 response mode via `Accept: application/json` is unverified.
- **FLUX Kontext (async):** `POST https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-kontext-pro` (no `/text_to_image` suffix — Vercel `urlFormat: 'workflows_async'`) with body `{"prompt":"...","input_image":"data:image/png;base64,...","aspect_ratio":"1:1","output_format":"png","safety_tolerance":2,"seed":1}` → `{"request_id":"..."}`. Then poll **`POST https://api.fireworks.ai/inference/v1/workflows/accounts/fireworks/models/flux-kontext-pro/get_result`** with body `{"id":"<request_id>"}` → `{"id":"...","status":"Ready"|"Pending"|"Error"|"Failed"|...,"result":{"sample":"https://..."}|null}`; when `status === "Ready"`, download `result.sample` (Vercel polls every 500 ms, 2 min timeout, and sends the API key only if the sample URL is on `api.fireworks.ai`). Status strings beyond `Ready`/`Error`/`Failed` unverified (BFL-style `Pending`, `Request Moderated`, `Content Moderated` likely). Optional `webhook_url` + `webhook_secret` for server callbacks (docs mention webhook notifications for async Kontext).
- **Legacy SD (sync):** `POST https://api.fireworks.ai/inference/v1/image_generation/accounts/fireworks/models/stable-diffusion-xl-1024-v1-0` (`Accept: image/jpeg|image/png`; body `{"prompt","negative_prompt","width","height","cfg_scale","steps","seed","samples"}`) → image bytes; `.../image_to_image` and `.../control_net` variants take multipart form data with `init_image` / `control_image` (field names unverified; from the SDXL blog + API reference titles). ControlNet output size follows explicit `width`/`height`; the control image is auto-cropped to aspect.
- No cancel endpoint. Kontext jobs are the only async path.

## Input / output media (Fireworks)
- Input: Kontext `input_image` as base64 data URI (Vercel: `convertImageModelFileToDataUri`) or URL; SD img2img via multipart. Size limits unverified.
- Output: sync endpoints return raw `image/jpeg` or `image/png` bytes (no URL, no expiry — ideal for the SPA); Kontext returns a `result.sample` URL (host/expiry/CORS unverified — BFL-style delivery URLs typically expire within minutes → fetch immediately through the proxy).

## Rate limits, quotas, free tier (Fireworks)
- Serverless "high rate limits", postpaid billing after the free $1 credit; specific image RPM limits unverified. Standard `429` with `Retry-After` (unverified).

## Gotchas (Fireworks)
- Three URL shapes for one provider: `/workflows/<model>/text_to_image` (FLUX, sync, binary), `/workflows/<model>` + `/get_result` (Kontext, async, JSON), `/image_generation/<model>` (legacy SD, sync, binary).
- FLUX dev/schnell take `aspect_ratio` only (no `width`/`height`); SD models take `width`/`height` only.
- FLUX dev/schnell have no image-to-image on Fireworks; use Kontext for edits.
- Sync responses are binary — the proxy must stream bytes and pass `Accept` through; set `Content-Type` from the response, not from JSON parsing.
- Per-step pricing: cost scales linearly with `num_inference_steps`/`steps`.

## Adapter mapping notes (Fireworks)
- Transport: `/api/proxy/fireworks/*` → `https://api.fireworks.ai/inference/v1/*`; forward `authorization`, `content-type`, `accept`; allow binary responses.
- t2i: FLUX → workflows `text_to_image` with `Accept: image/png`, our `aspect` → `aspect_ratio`, `steps` → `num_inference_steps`, `guidance` → `guidance_scale`, `seed`; result blob straight into the media store. SD → `image_generation` with `width`/`height`, `steps`, `cfg_scale`.
- edit: Kontext async → submit, then poll `get_result` every 1 s up to ~2 min, then fetch `result.sample` via `/api/fetch`. Input blob → data URI.
- Cost display: steps × per-step rate; Kontext flat.
