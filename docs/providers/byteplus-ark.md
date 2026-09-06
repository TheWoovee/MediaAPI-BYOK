# BytePlus ModelArk (Seedream / Seedance) — international; Volcengine Ark is the mainland twin

- Website / docs: https://docs.byteplus.com/en/docs/ModelArk/1541523 (Image generation API), https://docs.byteplus.com/en/docs/ModelArk/1520757 (Create video generation task), https://docs.byteplus.com/en/docs/ModelArk/1521309 (Retrieve task), https://docs.byteplus.com/en/docs/ModelArk/1521675 (List tasks), https://docs.byteplus.com/en/docs/ModelArk/1330310 (Model list), https://docs.byteplus.com/docs/ModelArk/1099320 (Pricing), https://docs.byteplus.com/en/docs/ModelArk/1399514 (free trial). Mainland equivalent: Volcengine Ark (https://www.volcengine.com/docs/82379). Official SDK used as ground truth for field names: `volcengine-python-sdk` 5.0.48, package `volcenginesdkarkruntime` (PyPI, 2026-09).
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter). NOTE: docs.byteplus.com, www.byteplus.com and the ark.* API hosts were blocked by the research sandbox's egress proxy, so doc pages were read only through search snippets; request/response shapes below come from the official Ark Python SDK and from Comfy-Org/ComfyUI `comfy_api_nodes/nodes_bytedance.py` + `apis/bytedance.py` (which target the BytePlus API).
- Adapter id: `byteplus-ark`  ·  Transport: `proxy` (CORS unverified; key is a long-lived bearer token — keep it off the wire)  ·  Priority wave: 1

## Account and authentication
- How to get a key: BytePlus console → ModelArk → API Key management (docs "Quick start" https://docs.byteplus.com/en/docs/ModelArk/1399008). Search snippets say new accounts get an inference free trial (docs 1399514) and a blog cites "200 free Seedream 4.0 image generations" (unverified exact quota). Whether a model must be explicitly "activated" in the ModelArk console before first API call: the Quick start describes opening/activating models in the console; treat as **required until verified** and surface the resulting 4xx error text to the user.
- Auth header exact format: `Authorization: Bearer <ARK_API_KEY>` (SDK `_client.py`: `{"Authorization": f"Bearer {api_key}"}`). Content-Type `application/json`.
- Base URL(s) and regions:
  - International (BytePlus ModelArk): `https://ark.ap-southeast.bytepluses.com/api/v3` (docs + ComfyUI proxy naming `byteplus/api/v3`).
  - Mainland China (Volcengine Ark): `https://ark.cn-beijing.volces.com/api/v3` (SDK `_constants.py` `BASE_URL`). Same paths and JSON; model ids there carry a `doubao-` prefix (e.g. `doubao-seedance-1-0-pro-250528`, `doubao-seedream-4-0-250828`) — exact mainland ids unverified here. Ark also accepts an endpoint id (`ep-...`) in `model`.

## Browser (CORS) behaviour
- Result of preflight test from origin https://www.thewoovee.com: **unknown**. `curl -X OPTIONS https://ark.ap-southeast.bytepluses.com/api/v3/images/generations` and `/contents/generations/tasks` returned `403 Forbidden` from the sandbox egress proxy (CONNECT denied by policy), so the provider was never reached. Re-run the preflight from a real host. Default to proxy transport.

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | yes | `POST /images/generations` — seedream-5-0-pro-260628, seedream-5-0-260128 (5.0 lite), seedream-4-5-251128, seedream-4-0-250828 (Seedream 3.0 t2i id unverified) |
| image→image / edit / inpaint | yes (edit + multi-image fusion via `image`; no mask inpaint field) | same endpoint, `image` = URL or [URLs] (≤10 refs for 4.x, ≤14 for 5.0 lite); 5.0 pro adds `layer_decomposition` |
| upscale | no dedicated endpoint (generate at up to 4K) | — |
| text→video | yes | `POST /contents/generations/tasks` — seedance-1-5-pro-251215, seedance-1-0-pro-250528, seedance-1-0-pro-fast-251015, dreamina-seedance-2-5-260628, dreamina-seedance-2-0-260128, dreamina-seedance-2-0-fast-260128, dreamina-seedance-2-0-mini |
| image→video | yes (first frame; first+last frame; reference images) | same endpoint, `content[]` items with `role` first_frame / last_frame / reference_image |
| video→video / extend | Seedance 2.x only | `content[]` `video_url` items with role `reference_video`; `omni_reference_task_type` = auto \| reference \| edit \| extend |
| audio in video | yes | `generate_audio: true` (Seedance 1.5 pro and 2.x; ignored by 1.0). Reference audio input via `audio_url` items (2.x) |

## Models
| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| `seedream-4-0-250828` | t2i / i2i / sequential | `size`: `"WxH"` (presets 1K: 1024x1024, 1152x864, 864x1152, 1312x736, 736x1312, 1248x832, 832x1248, 1568x672; 2K: 2048x2048, 2304x1728, 2848x1600, 2496x1664, 3136x1344 …; 4K: 4096x4096, 4704x3520, 5504x3040, 4992x3328, 6240x2656 …) or `"2K"`/`"4K"` | min 921,600 px, max 16,777,216 px; ≤10 input images; `sequential_image_generation:"auto"` with `max_images` (inputs+max_images ≤ 15) | ≈$0.03 / image (BytePlus blog + ComfyUI badge) |
| `seedream-4-5-251128` | t2i / i2i / sequential | 2K and 4K presets only | min 3,686,400 px, max 16,777,216 px; ≤10 refs | ≈$0.04 / image (ComfyUI badge) |
| `seedream-5-0-260128` ("5.0 lite") | t2i / i2i / sequential, `stream` | 2K / 3K / 4K presets; `output_format:"png"` supported | min 3,686,400 px, max 10,404,496 px; ≤14 refs | ≈$0.035 / image |
| `seedream-5-0-pro-260628` | t2i / i2i, `layer_decomposition`, `optimize_prompt_options{thinking,mode}` | 1K + 2K presets (16:9 2K temporarily unavailable per ComfyUI comment) | does NOT support `sequential_image_generation` or `stream` | ≈$0.045 / image ≤2.36 MP, ≈$0.09 above |
| `seedance-1-0-pro-250528` | t2v, i2v (first / first+last) | prompt-suffix params `--resolution 480p\|720p\|1080p --ratio 16:9\|4:3\|1:1\|3:4\|9:16\|21:9(\|adaptive for i2v) --duration 3..12 --seed --camerafixed true\|false --watermark true\|false` | 3–12 s | ≈$0.23–0.24 (480p) / $0.51–0.56 (720p) / $1.18–1.22 (1080p) per 10 s (ComfyUI badge, approximate) |
| `seedance-1-0-pro-fast-251015` | t2v, i2v | same as above | 3–12 s | ≈$0.09–0.10 / $0.21–0.23 / $0.47–0.49 per 10 s |
| `seedance-1-5-pro-251215` | t2v, i2v, first+last, audio | same prompt-suffix params + JSON `generate_audio` | 4–12 s (ComfyUI rejects <4 s); audio doubles price | ≈$0.12 (480p) / $0.26 (720p) / $0.58–0.59 (1080p) per 10 s; ×2 with audio |
| `dreamina-seedance-2-0-260128` | omni: t2v, i2v, ref images/video/audio, edit, extend | JSON fields `resolution` 480p\|720p\|1080p\|4k, `ratio` (adaptive allowed), `duration`, `seed`, `watermark`, `generate_audio`, `omni_reference_task_type` | ≤9 ref images, ≤3 ref videos, ≤3 ref audios, ≤15.1 s total ref media; ref-video pixel limits 409,600–927,408 (480/720p) or –2,073,600 (1080p) | BytePlus lists $7 / 1M video tokens w/o video input, $4.3 / 1M with video input at 720p (third-party summary of ModelArk pricing; unverified) |
| `dreamina-seedance-2-0-fast-260128`, `dreamina-seedance-2-0-mini` | omni (480p/720p only) | as above | as above | unverified |
| `dreamina-seedance-2-5-260628` | omni | 480p/720p/1080p; ref limits 30 images / 10 videos / 10 audios / 30.1 s | | ≈$10.70 / 1M video tokens without video input (≈$0.1028/s 480p, ≈$0.2312/s 720p, 5 s 1080p ≈ $2.84) per cellcog summary of ModelArk pricing |
| `seedance-1-0-lite-t2v-250428`, `seedance-1-0-lite-i2v-250428` | t2v / i2v (lite) | as 1.0 pro | | **unverified** — not present in any source reachable from the sandbox; confirm on the Model list page before exposing |

Video billing unit is "video tokens" (docs formula, unverified here: tokens ≈ width × height × fps × seconds / 1024). The task GET returns `usage.completion_tokens` / `usage.total_tokens`, so the adapter can show actual cost after completion.

## Endpoints (exact)
### Image generation — sync
- `POST {base}/images/generations`
- Request (minimal): `{"model":"seedream-4-0-250828","prompt":"...","size":"2048x2048","response_format":"url"}`
- Notable optional fields (SDK `resources/images/images.py`): `image` (string URL/base64 data URL, or array of strings, for editing / multi-image fusion), `size` (`"WxH"` or `"1K"|"2K"|"4K"`; 5.0 pro layer mode uses `"auto"`), `seed` (0–2147483647), `guidance_scale`, `watermark` (bool, default true on the service — send `false` to remove the AI watermark), `sequential_image_generation` (`"auto"` | `"disabled"`), `sequential_image_generation_options: {"max_images": n}`, `optimize_prompt` (bool) / `optimize_prompt_options: {"thinking":"auto|enabled|disabled","mode":"standard|fast"}`, `output_format` (`"png"`|`"jpeg"`), `layer_decomposition` (bool, 5.0 pro), `tools` (e.g. web search), `stream` (bool, SSE; not on 5.0 pro), `response_format` (`"url"` | `"b64_json"`).
- Response: `{"model":"...","created_at":<unix>,"data":[{"url":"https://...","b64_json":"...","size":"2048x2048","output_format":"png","z_index":0,"bounding_box":{...},"name":"...","description":"..."}],"usage":{"generated_images":1,"output_tokens":n,"total_tokens":n,"input_images":n},"error":{"code":"...","message":"..."}}`. With `sequential_image_generation:"auto"` `data[]` holds several images. Streaming emits per-image events `{type, model, url|b64_json, size, image_index, created_at, error}` then a completed event `{type, model, usage, created_at, error}` (event `type` string values unverified).
- No polling, no webhooks, no cancel.

### Video generation — async task
- `POST {base}/contents/generations/tasks`
- Request (t2v minimal): `{"model":"seedance-1-0-pro-250528","content":[{"type":"text","text":"a cat surfing --resolution 720p --ratio 16:9 --duration 5 --camerafixed false --watermark false"}]}`
- Request (i2v first+last): `{"model":"seedance-1-5-pro-251215","generate_audio":true,"content":[{"type":"text","text":"... --resolution 1080p --duration 5"},{"type":"image_url","image_url":{"url":"https://.../first.png"},"role":"first_frame"},{"type":"image_url","image_url":{"url":"https://.../last.png"},"role":"last_frame"}]}`
- Content item types (SDK `create_task_content_param.py`): `{"type":"text","text"}`, `{"type":"image_url","image_url":{"url"},"role"}` (role: `first_frame` | `last_frame` | `reference_image`), `{"type":"video_url","video_url":{"url"},"role":"reference_video"}`, `{"type":"audio_url","audio_url":{"url"},"role":"reference_audio"}`, `{"type":"draft_task","draft_task":{"id"}}`.
- Top-level optional JSON fields (SDK `tasks.py`): `callback_url`, `return_last_frame` (bool → `content.last_frame_url`), `generate_audio`, `camera_fixed`, `watermark`, `seed`, `resolution`, `ratio`, `duration`, `frames`, `draft`, `service_tier`, `execution_expires_after`, `priority`, `tools`, `output_format`, `omni_reference_task_type`, `safety_identifier`. Seedance 1.x docs/ComfyUI use the **prompt-suffix** form (`--resolution --ratio --duration --seed --camerafixed --watermark`; `--fps` documented by BytePlus but unverified here); Seedance 2.x uses the JSON fields. Sending both is not recommended.
- Response: `{"id":"cgt-2025...","safety_identifier":null}`
- `GET {base}/contents/generations/tasks/{id}` → `{"id","model","status","error":{"code","message"},"content":{"video_url":"https://...mp4","last_frame_url":"...","file_url":"..."},"usage":{"completion_tokens":n,"total_tokens":n},"created_at","updated_at","seed","revised_prompt","resolution","ratio","duration","framespersecond","frames","generate_audio","draft","service_tier",...}`
- `status` values (SDK docstring): `queued`, `running`, `succeeded`, `failed`, `cancelled`. Poll every 5–10 s; typical run time for 10 s clips per ComfyUI table: 1.0 pro 70/85/115 s (480/720/1080p), 1.5 pro 80/100/150 s.
- `GET {base}/contents/generations/tasks?page_num=&page_size=&filter.status=&filter.model=&filter.task_ids=&filter.service_tier=` → `{"total":n,"items":[task...]}`
- `DELETE {base}/contents/generations/tasks/{id}` — cancels a queued/running task (deletes finished ones).
- Webhook: `callback_url` (POSTs task object; payload shape unverified).

## Input media
- Images are passed as URLs inside `image_url.url` (video) or `image` (image API). The Ark docs accept publicly reachable HTTPS URLs and base64 data URLs (`data:image/png;base64,...`) for `image`; ComfyUI uploads to its own CDN and sends URLs, so **data-URL support for the video task content is unverified** — plan on the Worker hosting user uploads at a temporary HTTPS URL (R2) and passing that.
- Kling-style size limits: docs quote per-image limits (commonly ≤10 MB, ≥300 px short side, aspect 0.4–2.5) — unverified here.
- Seedance 2.x reference videos have pixel-count limits per output resolution (table above) and the 2.0 series caps total reference media at ~15 s (2.5: ~30 s).

## Output media
- Image API: `data[].url` (or `b64_json`). Video API: `content.video_url` (mp4; `last_frame_url` png when requested). URLs are temporary; docs state a fixed validity window (widely cited as 24 h — **unverified** here). Download/copy to R2 promptly.
- Whether the TOS/CDN host sets `Access-Control-Allow-Origin` for browser `fetch` is unknown; `<img>`/`<video src>` display works regardless. Route downloads through the proxy.

## Rate limits, quotas, free tier
- Free trial quota exists per model (docs 1399514; amounts unverified). Per-model RPM/concurrency limits and prepaid "resource packs" (docs 2191775 for Seedance 2.0) exist; numbers unverified. Error responses follow OpenAI style `{"error":{"code","message","type"}}` with HTTP 429 on throttling.

## Gotchas
- Model ids are date-suffixed (`-250828`, `-251215`, `-260628`); new versions get new ids and old ones are retired — keep the model list data-driven.
- Two parameter styles: Seedance 1.x expects `--flags` appended to the prompt text; Seedance 2.x/Seedream use JSON fields. `generate_audio` is a JSON field even for 1.5 pro.
- `watermark` defaults to true on the service; send `false` explicitly.
- Seedream 5.0 pro rejects `sequential_image_generation` and `stream`; 4.5/5.0 require ≥3.69 MP output, 4.0 ≥0.92 MP.
- Status vocabulary is lower-case (`succeeded`), unlike Kling/MiniMax.
- The `mainland` (volces.com) and `international` (bytepluses.com) accounts/keys are separate; the adapter should let the user pick the region (base URL) and keep model ids per region.
- Output URLs expire; task listing is available for recovery only while the task record is retained.

## Adapter mapping notes
- text→image / image→image → `POST /images/generations`; map our `count` to `sequential_image_generation:"auto"` + `max_images` (max 15 minus input images); map our `size` presets to `"WxH"` from the preset tables above; expose `watermark` toggle (default off) and `response_format:"url"`.
- text→video / image→video → `POST /contents/generations/tasks` then poll `GET .../{id}` until `succeeded|failed|cancelled`; for 1.x models build the prompt suffix from our duration/aspect/resolution/seed/cameraFixed/watermark UI; for 2.x send JSON fields. First/last frame UI → two `image_url` items with roles. Audio toggle → `generate_audio` (only 1.5 pro / 2.x).
- Cancel → `DELETE .../{id}`.
- Region selector (international vs mainland) changes base URL and model-id prefix (`doubao-` on mainland — verify).
- Cost display: use `usage.completion_tokens` × per-model token price when available.
