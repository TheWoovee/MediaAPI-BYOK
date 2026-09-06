# Google Gemini API (Nano Banana image models, Imagen, Veo) — API-key auth, not Vertex

- Website / docs: Image generation https://ai.google.dev/gemini-api/docs/image-generation (Interactions API) and legacy generateContent variant https://ai.google.dev/gemini-api/docs/generate-content/image-generation · Imagen https://ai.google.dev/gemini-api/docs/imagen · Veo https://ai.google.dev/gemini-api/docs/video and https://ai.google.dev/gemini-api/docs/veo · Models https://ai.google.dev/gemini-api/docs/models (cards: /models/gemini-2.5-flash-image, /models/gemini-3.1-flash-image, /models/gemini-3.1-flash-lite-image, /models/gemini-3-pro-image, /models/imagen, /models/veo-3.1-generate-preview, /models/veo-3.1-lite-generate-preview) · Pricing https://ai.google.dev/gemini-api/docs/pricing · Rate limits https://ai.google.dev/gemini-api/docs/rate-limits · Deprecations https://ai.google.dev/gemini-api/docs/deprecations · Changelog https://ai.google.dev/gemini-api/docs/changelog · REST discovery document (authoritative field names): https://generativelanguage.googleapis.com/$discovery/rest?version=v1beta · SDK wire mappings cross-checked in https://github.com/googleapis/python-genai (`google/genai/models.py`, `_to_mldev` converters) and cookbook https://github.com/google-gemini/cookbook/blob/main/quickstarts/Get_started_Veo.ipynb
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter). ai.google.dev was blocked by the sandbox egress proxy; facts come from search snippets of the official pages, the live discovery document, and the official SDK source. The API host itself was reachable, so CORS was tested live.
- Adapter id: `google`  ·  Transport: `direct` (CORS allowed — see below; proxy still useful for video downloads)  ·  Priority wave: 1

## Account and authentication
- Get a key: Google AI Studio → https://aistudio.google.com/apikey (free to create; a Google Cloud project is created implicitly). Free tier exists for many Gemini models; Imagen and Veo are paid-tier only ("Veo is a paid only feature" — cookbook; Imagen free-tier quota shows 0/25 style limits in AI Studio per forum reports — treat as paid-only). Billing → "Set up billing" in AI Studio upgrades to Tier 1.
- Auth header: `x-goog-api-key: <GEMINI_API_KEY>` (all REST examples), or `?key=` query param. No bearer token.
- Base URL: `https://generativelanguage.googleapis.com/v1beta` (single global endpoint; no regional hosts). Some features have regional policy differences (e.g. `personGeneration` in EU/UK/CH/MENA).

## Browser (CORS) behaviour
- Result: **allowed**. Tested 2026-09-06 with
  `curl -s -o /dev/null -D - -X OPTIONS -H "Origin: https://www.thewoovee.com" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type,x-goog-api-key" https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict`
  and the same against `.../models/veo-3.0-generate-001:predictLongRunning`. Both returned `HTTP/2 200` with
  `access-control-allow-origin: https://www.thewoovee.com`, `access-control-allow-methods: DELETE,GET,HEAD,OPTIONS,PATCH,POST,PUT`, `access-control-allow-headers: authorization,content-type,x-goog-api-key`, `access-control-max-age: 3600`. The origin is echoed (not `*`), so credentialed requests also work. Direct browser calls are viable.

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | yes | `gemini-3.1-flash-image` (Nano Banana 2), `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite), `gemini-3-pro-image-preview` (Nano Banana Pro), `gemini-2.5-flash-image` (Nano Banana, legacy) — `POST /v1beta/models/{model}:generateContent`; Imagen 4 (`imagen-4.0-*`) — `:predict` **(shut down 2026-08-17, see below)** |
| image→image / edit / inpaint | yes (prompt-driven edit, multi-image composition; no explicit mask API in Gemini API) | Nano Banana models via `generateContent` with `inline_data` image parts (up to 14 reference images) |
| upscale | no | — (request `imageSize: "4K"` instead) |
| text→video | yes | `veo-3.1-generate-preview`, `veo-3.1-fast-generate-preview`, `veo-3.1-lite-generate-preview` — `POST /v1beta/models/{model}:predictLongRunning` |
| image→video | yes | same, `instances[0].image` (first frame) + optional `lastFrame`; `referenceImages` (≤3, `referenceType: "asset"`) |
| video→video / extend | yes (extend) | same endpoint with `instances[0].video` = a Veo-generated video from the last 2 days; +7 s per extension up to 148 s total (ai.google.dev) / 141 s (cookbook) — not supported on Lite |
| audio in video | yes | Veo 3.x generates native synchronized audio; `generateAudio` is Vertex-only (SDK raises for Gemini API) — audio is always on |

## Models
| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| `gemini-3.1-flash-image` (Nano Banana 2) | text→image, edit | `imageConfig.aspectRatio` ∈ `1:1, 1:4, 4:1, 1:8, 8:1, 2:3, 3:2, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9`; `imageConfig.imageSize` ∈ `512`, `1K` (default), `2K`, `4K` (discovery doc) | up to 14 input reference images | output $60/1M tokens: 0.5K = 747 tok ≈ $0.045; 1K = 1120 tok ≈ $0.067; 2K = 1680 tok ≈ $0.101; 4K = 2520 tok ≈ $0.151 per image (https://ai.google.dev/gemini-api/docs/pricing) |
| `gemini-3.1-flash-lite-image` (Nano Banana 2 Lite) | text→image, edit | adds 0.5K (512 px) and aspect ratios `1:1, 3:2, 2:3, 3:4, 4:3, 4:5, 5:4, 9:16, 16:9, 21:9`; recommended migration target from 2.5-flash-image ("enhanced quality, faster, lower price") | — | lower than Nano Banana 2; exact unverified |
| `gemini-3-pro-image-preview` (Nano Banana Pro) | text→image, edit (premium, text rendering, thinking) | same config; 1K/2K/4K | up to 14 reference images | output $120/1M tokens: 1K–2K = 1120 tok ≈ $0.134; 4K = 2000 tok ≈ $0.24 per image. Deprecations page lists `gemini-3-pro-image-preview` shutdown 2026-06-25 (may already be replaced by a GA id — verify) |
| `gemini-2.5-flash-image` (Nano Banana) | text→image, edit | 1024 px class output; `aspectRatio` supported; no `imageSize` | — | ≈$0.039/image historically; Google "strongly recommends" moving to Nano Banana 2 Lite; treat as legacy |
| `imagen-4.0-generate-001` / `imagen-4.0-ultra-generate-001` / `imagen-4.0-fast-generate-001` | text→image | `parameters.sampleCount` 1–4 (default 4), `aspectRatio` `1:1, 3:4, 4:3, 9:16, 16:9`, `imageSize` `1K`\|`2K` (standard/ultra only), `personGeneration` | **deprecated; shut down 2026-08-17** (before today) — "Imagen models are deprecated … migrate to Nano Banana" (https://ai.google.dev/gemini-api/docs/deprecations, /docs/changelog). Ultra limited to 1 image/request | was $0.04 / $0.06 / $0.02 per image |
| `veo-3.1-generate-preview` | text→video, image→video, extend, references | `parameters.aspectRatio` `16:9`\|`9:16`; `resolution` `720p`\|`1080p`\|`4k`; `durationSeconds` 4\|6\|8 (extension is fixed 7 s); `negativePrompt`; `personGeneration` `allow_adult`\|`dont_allow` (EU/UK/CH/MENA: `allow_adult` only); `enhancePrompt`; `sampleCount` | 8 s clips; up to 3 reference images; extend only Veo-made videos <2 days old; output kept 2 days | $0.40/s (720p & 1080p), $0.60/s (4K) |
| `veo-3.1-fast-generate-preview` | same | same | same | $0.10/s 720p, $0.12/s 1080p, $0.30/s 4K |
| `veo-3.1-lite-generate-preview` | text→video, image→video | 720p/1080p only; **no 4K, no extension** | — | $0.05/s 720p, $0.08/s 1080p (forum notes the model card's "$0.05 per video" wording is misleading — it is per second) |
| `veo-3.0-generate-001`, `veo-3.0-fast-generate-001`, `veo-2.0-generate-001` | — | — | **shut down 2026-06-30** (deprecations page). Do not ship. | — |

All image outputs carry a SynthID watermark. "You will only be charged if your video is successfully generated."

## Endpoints (exact)
### POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent — sync (Nano Banana)
Headers: `x-goog-api-key`, `Content-Type: application/json`.
Request (text→image):
```json
{"contents":[{"parts":[{"text":"A photoreal red panda"}]}],
 "generationConfig":{"responseModalities":["IMAGE"],
                     "imageConfig":{"aspectRatio":"16:9","imageSize":"2K"}}}
```
Edit / compose: add image parts before the text: `{"inline_data":{"mime_type":"image/png","data":"<base64>"}}` (up to 14). Multi-turn edits: resend prior `candidates[0].content` as a `model` turn plus a new `user` turn. `responseModalities` may be `["TEXT","IMAGE"]` to get commentary; `["IMAGE"]` for image-only. `imageConfig` on an unsupported model returns an error (discovery doc).
Response: `{"candidates":[{"content":{"parts":[{"inlineData":{"mimeType":"image/png","data":"<base64>"}}],"role":"model"},"finishReason":"STOP"}],"usageMetadata":{...}}`. Iterate `parts` — text and image parts may be interleaved.
Note: Google now labels generateContent "legacy" and recommends the Interactions API (`POST /v1beta/interactions` with `model`, `response_format:{aspect_ratio,image_size}`, `response_modalities`) for new projects (https://ai.google.dev/gemini-api/docs/image-generation). generateContent "remains supported" — fine for wave 1; keep the endpoint string configurable.

### POST https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-001:predict — sync (Imagen; retired)
Request: `{"instances":[{"prompt":"..."}],"parameters":{"sampleCount":2,"aspectRatio":"16:9","imageSize":"2K","personGeneration":"allow_adult"}}` → `{"predictions":[{"bytesBase64Encoded":"...","mimeType":"image/png"}]}`. Kept for reference only; expect 404 after 2026-08-17.

### POST https://generativelanguage.googleapis.com/v1beta/models/{veo-model}:predictLongRunning — async (Veo)
Request (text→video):
```json
{"instances":[{"prompt":"A cinematic drone shot over Venice at dawn"}],
 "parameters":{"aspectRatio":"16:9","resolution":"1080p","durationSeconds":8,
               "negativePrompt":"text, watermark","personGeneration":"allow_adult"}}
```
Image→video: `instances[0].image = {"bytesBase64Encoded":"<b64>","mimeType":"image/png"}`; optional `instances[0].lastFrame` (same shape) for first/last-frame interpolation. Reference images: `instances[0].referenceImages = [{"image":{...},"referenceType":"asset"}]` (≤3; cannot be combined with `image`/`video`/`lastFrame`). Extend: `instances[0].video = {"uri":"<generated video uri>"}` (or `{"encodedVideo":"<b64>","encoding":"video/mp4"}`; SDK maps `video_bytes`→`encodedVideo`, `mime_type`→`encoding`) plus a prompt; result = original + 7 s. `sampleCount`, `enhancePrompt` also accepted. Not supported on Gemini API (SDK raises): `fps`, `seed`, `generateAudio`, `mask`, `compressionQuality`, `resizeMode`, GCS URIs, `labels`.
Response: `{"name":"models/veo-3.1-generate-preview/operations/abc123"}`.

### GET https://generativelanguage.googleapis.com/v1beta/{name} — poll
`{"name":"...","done":false}` while running; on completion `{"done":true,"response":{"@type":"...","generateVideoResponse":{"generatedSamples":[{"video":{"uri":"https://generativelanguage.googleapis.com/v1beta/files/xxxx:download?alt=media"}}]}}}`; on failure `{"done":true,"error":{"code":..,"message":..}}`; filtered content shows up as `raiMediaFilteredCount`/`raiMediaFilteredReasons` inside `generateVideoResponse` (SDK fields). Poll every 10–20 s (cookbook uses 20 s; typical job ≈ 1–3 min). No cancel or webhook for API-key users (`webhookConfig` exists in the SDK but is undocumented for Gemini API).

### Download
`GET <video.uri>` with `x-goog-api-key` header, follow redirects (`curl -L`). Returns `video/mp4`. Videos are stored 2 days then deleted.

## Input media
- Nano Banana: inline base64 (`inline_data`, mime png/jpeg/webp/heic/heif/gif/avif per discovery `Blob` doc) or `file_data.file_uri` from the Files API (`POST /v1beta/files` resumable upload; https://ai.google.dev/gemini-api/docs/files). Inline request bodies are capped at 20 MB total; use Files API above that. Up to 14 images.
- Veo: `image` / `lastFrame` / `referenceImages[].image` as `{bytesBase64Encoded, mimeType}` (jpeg/png). Aspect of the input should match `aspectRatio`. Extension source must be a Veo-generated video URI (< 2 days old) or base64 `encodedVideo`.

## Output media
- Images: base64 `inlineData` (png by default) — no URLs, no expiry, no CORS concern; SynthID watermarked.
- Videos: authenticated `files/...:download?alt=media` URI (MP4). Requires the `x-goog-api-key` header, so a bare `<video src>` will not work; fetch with the header from the browser (CORS allowed) or via the proxy, then use a Blob URL. Expires after 2 days.

## Rate limits, quotas, free tier
- Limits are per project and per tier (Free, Tier 1, 2, 3); RPD resets at midnight Pacific; preview models are more restricted (https://ai.google.dev/gemini-api/docs/rate-limits). Exact per-model image/video numbers were not retrievable (page blocked); community reports: Imagen Tier 1 ≈ 70 RPD, Veo 3.1 Lite Tier 1 10 RPD / Tier 2 50 RPD — treat as indicative only, read the live table.
- Free tier: text Gemini models yes; Imagen and Veo paid-only; Nano Banana models on the free tier: unverified (AI Studio UI has free quota, API free-tier availability for `gemini-3.1-flash-image` should be checked on the pricing page).
- Nano Banana Pro / Veo 3.1 are "preview" — limits and ids can change without the usual deprecation window.

## Gotchas
- **Imagen 4 is gone** (shutdown 2026-08-17) and **Veo 3.0/2.0 are gone** (2026-06-30). The only current families are Nano Banana (`gemini-*-image`) and Veo 3.1 preview ids.
- `gemini-3-pro-image-preview` shows a 2026-06-25 shutdown on the deprecations page while the model card/pricing still list it — confirm the live id via `GET /v1beta/models?key=` at adapter start-up and prefer whatever the models list returns.
- Two image APIs now: `generateContent` (legacy but supported, used here) vs Interactions API (recommended for new work). Field names differ (`imageConfig.imageSize` vs `response_format.image_size`).
- Veo extension math is inconsistent across docs (141 s vs 148 s max); 7 s per extension is consistent.
- `personGeneration` is region-restricted; omit it unless the user chooses, and surface the 400 message.
- Video URIs need the API key header; do not embed the key in a URL that gets logged.
- Prompt-based inpainting only: there is no mask parameter for Nano Banana in the Gemini API (masking is a Vertex `EditImage` feature).

## Adapter mapping notes
- text→image, edit, multi-image compose → `generateContent` on `gemini-3.1-flash-image` (default), `gemini-3.1-flash-lite-image` (cheap), `gemini-3-pro-image-preview` (premium). UI: aspect ratio picker (14 values), size 512/1K/2K/4K, up to 14 reference images. Parse all `inlineData` parts (a request can yield several images).
- text→video / image→video / first+last frame / references → `predictLongRunning` on Veo 3.1 (default fast); UI: 16:9 / 9:16, 720p/1080p/4K (hide 4K for Lite), duration 4/6/8 s, negative prompt. Job = operation `name`; poll every 10–15 s; terminal when `done`.
- extend → same endpoint with `video.uri` of a stored job result; only enable within 48 h of generation; append 7 s.
- Transport: direct from the browser (CORS OK); still proxy video downloads if you want to strip the key from client fetches or cache the MP4 before the 2-day expiry.
- Cost estimate: images via token table above; video = seconds × rate per model/resolution.
