# xAI (Grok Imagine API)

- Website / docs: https://docs.x.ai/developers/model-capabilities/imagine (Imagine overview) · https://docs.x.ai/developers/model-capabilities/images/generation · https://docs.x.ai/developers/model-capabilities/images/editing · https://docs.x.ai/developers/model-capabilities/images/multi-image-editing · https://docs.x.ai/developers/model-capabilities/video/generation · https://docs.x.ai/developers/model-capabilities/video/image-to-video · https://docs.x.ai/developers/model-capabilities/video/reference-to-video · https://docs.x.ai/developers/model-capabilities/video/editing · https://docs.x.ai/developers/model-capabilities/video/extension · REST reference: https://docs.x.ai/developers/rest-api-reference/inference/images and https://docs.x.ai/developers/rest-api-reference/inference/videos · Models & pricing: https://docs.x.ai/developers/models and https://docs.x.ai/developers/pricing · Rate limits: https://docs.x.ai/developers/rate-limits · SDK source used for cross-checking: https://github.com/xai-org/xai-sdk-python
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter). NOTE: docs.x.ai, x.ai and api.x.ai were blocked by the research sandbox's egress proxy, so facts below come from search-engine snippets of the official docs plus the official `xai-sdk-python` source on GitHub. Items marked "unverified" could not be confirmed against the page itself.
- Adapter id: `xai`  ·  Transport: `proxy` (CORS unknown, see below)  ·  Priority wave: 1

## Account and authentication
- Get a key: sign up at https://console.x.ai (quickstart: https://docs.x.ai/docs/tutorial → "Get your API key"). Free credits: unverified (not mentioned in the snippets seen).
- Auth header: `Authorization: Bearer <XAI_API_KEY>` (all REST examples on docs.x.ai use this).
- Base URL: `https://api.x.ai/v1`. Regions: the models page has `?cluster=us-east-1` / `?cluster=eu-west-1` variants (https://docs.x.ai/developers/models?cluster=us-east-1), implying per-region availability tables; whether a separate regional base URL exists is unverified.

## Browser (CORS) behaviour
- Result: **unknown**. The preflight `OPTIONS https://api.x.ai/v1/images/generations` (and `/v1/videos/generations`) with `Origin: https://www.thewoovee.com` could not be executed: the sandbox egress proxy refused the CONNECT (`HTTP/1.1 403 Forbidden` from the proxy, not from xAI). No official statement about CORS was found in docs.x.ai snippets. Plan for `proxy` transport and re-test from a real browser/curl:
  `curl -s -o /dev/null -D - -X OPTIONS -H "Origin: https://www.thewoovee.com" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type" https://api.x.ai/v1/images/generations`

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | yes | `grok-imagine-image-2.0`, `grok-imagine-image`, `grok-imagine-image-quality` (alias `grok-imagine-image-pro`, retiring 2026-11-02) — `POST /v1/images/generations` |
| image→image / edit / inpaint | yes (prompted edit, no mask) | same models — `POST /v1/images/edits`; up to 5 source images per request (multi-image editing) |
| upscale | no | — (not offered) |
| text→video | yes | `grok-imagine-video-1.5` (and `-1.5-preview`, `-1.5-preview-1` slugs), `grok-imagine-video` — `POST /v1/videos/generations` |
| image→video | yes | same — `POST /v1/videos/generations` with `image` (first frame); reference-to-video with up to 7 reference images |
| video→video / extend | yes | `POST /v1/videos/edits` (prompted edit, same duration as input, capped 8.7 s, ≤720p) and `POST /v1/videos/extensions` (input 2–15 s, extension 2–10 s, default 6) |
| audio in video | yes | Generated videos include an audio track by default; `generate_audio: false` to disable; on `grok-imagine-video-1.5` up to 3 preset voices via `reference_audios: [{"voice_id": "eve"}]` (voices shared with the TTS catalog; unknown id → 400 listing valid voices). Audio *file* input (audio-to-video) is unverified — only voice-id presets are documented in the SDK. |

## Models
| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| `grok-imagine-image-2.0` | text→image, image edit | `aspect_ratio` (SDK literals: `1:1, 3:4, 4:3, 9:16, 16:9, 2:3, 3:2, 9:19.5, 19.5:9, 9:20, 20:9, 1:2, 2:1`; docs also list `21:9` and `5:2` for 2.0; omitted → `auto`), `resolution` `1k` \| `2k`, `quality` `low` \| `medium` \| `auto` (default moved from `medium` to `auto`), `n` 1–10, `response_format` `url` \| `b64_json` | up to 5 source images for editing; input image max 20 MiB | output: $0.04 (1K low), $0.06 (2K low), $0.06 (1K medium), $0.08 (2K medium); image input $0.01/image (https://docs.x.ai/developers/models/grok-imagine-image-2.0) |
| `grok-imagine-image` | text→image, image edit | same param set (resolution/quality support unverified for this model) | n 1–10 | $0.02/image output, $0.002/image input (https://docs.x.ai/developers/models/grok-imagine-image) |
| `grok-imagine-image-quality` (alias `grok-imagine-image-pro`) | text→image, image edit | same | **retirement 2026-11-02** (60-day notice began 2026-09-02); afterwards served by `grok-imagine-image-2.0` with `quality=low` (https://docs.x.ai/developers/migration/imagine-image-quality-nov-2) | $0.05/image output, $0.01/image input |
| `grok-2-image-1212` (legacy `grok-2-image`) | text→image | legacy; params were `prompt`, `n`, `response_format` | **retired**: model page shows "Model Retirement on May 15" (https://docs.x.ai/developers/models/grok-2-image-1212, https://docs.x.ai/developers/migration/may-15-retirement). Do not ship. | historical price unverified |
| `grok-imagine-video-1.5` (also `grok-imagine-video-1.5-preview`, `grok-imagine-video-1.5-preview-1`) | text→video, image→video, reference→video, edit, extend | `duration` 1–15 s; `aspect_ratio` `1:1, 16:9, 9:16, 4:3, 3:4, 3:2, 2:3` (default 16:9); `resolution` `480p` \| `720p` \| `1080p` (1080p for T2V/I2V; reference-to-video capped at 720p); `generate_audio` bool; `reference_audios` ≤3 voice ids | reference images ≤7; edit output = input duration (≤8.7 s) and input resolution (≤720p); extension input 2–15 s, +2–10 s | $0.08/s 480p, $0.14/s 720p, $0.25/s 1080p; voice input free (https://docs.x.ai/developers/models/grok-imagine-video-1.5) |
| `grok-imagine-video` | text→video, image→video, edit, extend | `duration` 1–15 s; same aspect ratios; `resolution` `480p` \| `720p` | as above | $0.05/s 480p, $0.07/s 720p (https://docs.x.ai/developers/models/grok-imagine-video) |

T2V on 1.5 is implemented as text→image then image→video (docs note), so the first frame is a generated still.

## Endpoints (exact)
All JSON, `Content-Type: application/json`, `Authorization: Bearer`.

### POST https://api.x.ai/v1/images/generations — sync
Request (minimal): `{"model":"grok-imagine-image-2.0","prompt":"..."}`.
Notable optional: `n` (1–10, default 1), `response_format` (`"url"` default | `"b64_json"`), `aspect_ratio`, `resolution` (`"1k"`|`"2k"`), `quality` (`"low"`|`"medium"`|`"auto"`), `user`, `storage_options` (persist output to xAI Files, optionally with a permanent public URL; SDK field `storage_options.expires_after`).
Response: `{"data":[{"url":"https://imgen.x.ai/...","mime_type":"image/jpeg","revised_prompt":""}],"usage":{"cost_in_usd_ticks":200000000}}` for URL mode; `{"data":[{"b64_json":"..."}], ...}` for base64 mode (shape from docs snippet, https://docs.x.ai/developers/model-capabilities/images/generation). Output is JPEG.

### POST https://api.x.ai/v1/images/edits — sync
Request: `{"model":"grok-imagine-image-2.0","prompt":"...","image":{"type":"image_url","image_url":{"url":"https://... or data:image/png;base64,..."}}}`. The docs snippet says the request carries "an image object with a URL and type `image_url`"; whether the URL nests as `image.image_url.url` (chat-style part) or `image.url` is **unverified** — confirm against https://docs.x.ai/developers/rest-api-reference/inference/images. Multi-image (≤5): SDK exposes `image_urls[]` / `image_file_ids[]`; REST field name for the array is unverified (likely `images`). Same optional params as generation (`n`, `response_format`, `aspect_ratio`, `resolution`, `quality`). Response shape as generations.

### POST https://api.x.ai/v1/videos/generations — async
Request (text→video): `{"model":"grok-imagine-video-1.5","prompt":"...","duration":10,"aspect_ratio":"16:9","resolution":"720p"}`.
Image→video: add `"image":{"url":"https://... | data:image/...;base64,..."}` (or a `file_id` from the Files API; SDK params `image_url` / `image_file_id`).
Reference→video: `reference_images` (≤7; each a public HTTPS URL, base64 data URI, or file_id — kinds can be mixed; SDK `reference_image_urls` / `reference_image_file_ids`), `reference_audios: [{"voice_id":"eve"}]` (≤3), and tag them in the prompt as `<IMAGE_0>…`, `<AUDIO_0>…`. `generate_audio: false` disables the audio track.
Response: `{"request_id":"d97415a1-5796-b7ec-379f-4e6819e08fdf"}`.

### POST https://api.x.ai/v1/videos/edits — async
Request: `{"model":"grok-imagine-video","prompt":"Give the woman a silver necklace","video":{"url":"https://.../portrait-wave.mp4"}}` (video may be public URL, base64 data URL, or `file_id`). No `duration`/`resolution` (output matches input, capped 8.7 s / 720p). Response `{"request_id": "..."}`.

### POST https://api.x.ai/v1/videos/extensions — async
Request: `{"prompt":"The camera slowly zooms out ...","video":{"url":"https://example.com/video.mp4"},"model":"grok-imagine-video","duration":6}` (`duration` = extension length 2–10 s, default 6; input video 2–15 s). Response `{"request_id": "..."}`.

### GET https://api.x.ai/v1/videos/{request_id} — poll
Response: `{"status":"pending"|"done"|"failed"|"expired","model":"grok-imagine-video","video":{"url":"https://...","duration":10}}` (`video` present when `done`). Docs say "poll every few seconds"; the official SDK defaults to a 1 s interval and 10 min timeout (`DEFAULT_VIDEO_POLL_INTERVAL = 1s`, `DEFAULT_VIDEO_TIMEOUT = 10min` in `xai_sdk/video.py`). Recommend 3–5 s for a browser client. `expired` means the deferred result is gone — treat as terminal. Webhooks: none documented. Cancel: none documented. The SDK response also exposes `respect_moderation` (bool; when false the URL is withheld) and `cost_usd` — the REST field names for these are unverified.

### Files API (optional)
`file_id` values from the xAI Files API (https://docs.x.ai/docs/guides/files) are accepted anywhere a URL/data URI is (`image_file_id`, `video_file_id`, `reference_image_file_ids`), and `storage_options` on any Imagine request persists outputs to Files with an optional public URL.

## Input media
- Images: public HTTPS URL, `data:image/...;base64,...` data URI, or Files API `file_id`; max 20 MiB per image (limit stated for image inputs). Up to 5 for image editing, up to 7 reference images for video.
- Videos (edit/extend): public URL, base64 data URL, or `file_id`; 2–15 s for extension, ≤8.7 s effective for edit.
- Audio: only preset `voice_id` references (free); arbitrary audio upload unverified.

## Output media
- Images: `url` (host `imgen.x.ai`, JPEG) or `b64_json`. URL lifetime: not stated for the sync API; the Batch API docs say image/video signed URLs expire after 1 hour, so download promptly. Whether `imgen.x.ai` sends CORS headers for browser `fetch` is unknown — prefer `b64_json` for direct rendering or fetch through the proxy.
- Videos: temporary `video.url` (MP4). SDK docstring: "The returned URL is valid for 24 hours." Docs: "Videos are returned as temporary URLs … download/process promptly." No base64 option for video. Browser fetch CORS of the video host: unknown → route download through the proxy or open in a `<video>` tag (which does not need CORS).

## Rate limits, quotas, free tier
- Imagine (image/video) limits are **not** part of the published text-model tier table; "for increases to Voice and Imagine API limits, contact sales@x.ai" (https://docs.x.ai/developers/rate-limits). Per-team limits are shown in the xAI Console → Rate Limits page.
- Per-request caps: `n` ≤10 images; video 1–15 s.
- Free tier: unverified.

## Gotchas
- `grok-imagine-image-quality` retires 2026-11-02 (silently remapped to 2.0 `quality=low`); `grok-2-image-1212` already retired 2026-05-15. Only ship `grok-imagine-image-2.0`, `grok-imagine-image`, `grok-imagine-video-1.5`, `grok-imagine-video`.
- Video results are moderated post-hoc: a `done` job may omit the URL when moderation fails (SDK `respect_moderation == False`).
- Video URLs are short-lived (≤24 h); image URLs possibly 1 h. Persist or re-host immediately.
- 1080p only for T2V/I2V on 1.5; reference-to-video and edits are capped at 720p; edits cap at 8.7 s.
- Pricing is per generated second × resolution; cost appears in `usage.cost_in_usd_ticks` (1 USD = 1e10 ticks by the example: 200,000,000 ticks = $0.02).
- `quality` default changed from `medium` to `auto` on 2.0 — pin it explicitly to make cost predictable.
- Exact REST nesting of the `image` object for `/v1/images/edits` and the multi-image array name must be confirmed against the REST reference before coding.

## Adapter mapping notes
- text→image → `POST /v1/images/generations` with `response_format:"b64_json"` (avoids URL expiry/CORS). Map our aspect presets onto xAI's `aspect_ratio`; map our "quality" to `resolution` (`1k`/`2k`) + `quality` (`low`/`medium`).
- image edit → `POST /v1/images/edits`; send the source as a data URI (no upload step needed). Expose "up to 5 reference images". No mask support: hide the mask tool for this provider.
- text→video / image→video → `POST /v1/videos/generations`; UI needs duration slider 1–15 s, aspect (7 values), resolution (480p/720p/1080p, hide 1080p for `grok-imagine-video` and for reference mode), audio on/off, optional voice picker (≤3, 1.5 only).
- extend → `POST /v1/videos/extensions` (needs the previous video URL still valid: chain quickly or re-host through Files API `storage_options`). edit → `POST /v1/videos/edits`.
- Job model: store `request_id`; poll `GET /v1/videos/{id}` every 3–5 s via the proxy; terminal states `done|failed|expired`.
- Cost estimate: seconds × per-second rate table above; images flat per-image table.
