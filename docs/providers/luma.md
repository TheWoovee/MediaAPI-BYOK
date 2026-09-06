# Luma Dream Machine API (Ray 2 / Photon) — plus notes on the newer Ray 3.x "Luma 2" API

- Website / docs: https://docs.lumalabs.ai/docs/video-generation , https://docs.lumalabs.ai/docs/image-generation , https://docs.lumalabs.ai/docs/python-video-generation , https://lumalabs.ai/llm-info (official "information for AI assistants"), API keys: https://lumalabs.ai/dream-machine/api/keys . Ground truth for shapes: official `lumaai` npm SDK 1.19.1 (2026-01-21) and PyPI `lumaai` 1.21.0 (2026-04-07) — Stainless-generated from Luma's OpenAPI spec (`src/resources/generations/*.ts`, `src/index.ts`).
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter). docs.lumalabs.ai, lumalabs.ai and api.lumalabs.ai were blocked by the sandbox egress proxy; doc pages were seen only as search snippets.
- Adapter id: `luma`  ·  Transport: `proxy` (CORS unverified)  ·  Priority wave: 2

## Account and authentication
- How to get a key: Dream Machine account → https://lumalabs.ai/dream-machine/api → add billing → API Keys. The API is pay-as-you-go (no free API credits; the web app's free daily credits do not apply to the API — eesel/apiframe summaries; unverified).
- Auth header exact format: `Authorization: Bearer <LUMAAI_API_KEY>` (SDK `authToken` → bearer). `Content-Type: application/json`.
- Base URL(s) and regions: `https://api.lumalabs.ai/dream-machine/v1` (SDK default; single global endpoint). Ray 3.x lives behind a **different** product/API ("Luma Agents API" / ComfyUI proxy `luma_2`) whose public base URL is **unverified** here.

## Browser (CORS) behaviour
- Result of preflight test from origin https://www.thewoovee.com: **unknown**. `curl -X OPTIONS https://api.lumalabs.ai/dream-machine/v1/generations` returned `403 Forbidden` from the sandbox egress proxy (CONNECT denied by policy), so Luma was never reached. Retest from a real host; assume proxy.

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | yes | `POST /generations/image` — photon-1, photon-flash-1 |
| image→image / edit / inpaint | yes: `modify_image_ref` (edit), `image_ref` / `style_ref` / `character_ref` (guidance); `POST /generations/image/reframe` (outpaint/reframe). No mask inpaint | `POST /generations/image` |
| upscale | video only | `POST /generations/{id}/upscale` (540p/720p/1080p/4k) |
| text→video | yes | `POST /generations` (alias `POST /generations/video`) — ray-2, ray-flash-2 (ray-1-6 legacy) |
| image→video | yes | keyframes `frame0` (start) / `frame1` (end) of `type:"image"` |
| video→video / extend | yes | extend = `keyframes.frame0 = {type:"generation", id}`; reverse-extend = `frame1` generation; interpolate = both; `POST /generations/video/modify` (restyle, modes adhere_1…reimagine_3); `POST /generations/video/reframe` |
| audio in video | yes (post-process) | `POST /generations/{id}/audio` with `prompt` / `negative_prompt` |

## Models
| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| `ray-2` | t2v, i2v, extend, loop, modify, reframe | `aspect_ratio` 1:1 \| 16:9 \| 9:16 \| 4:3 \| 3:4 \| 21:9 \| 9:21; `duration` `"5s"` \| `"9s"`; `resolution` 540p \| 720p \| 1080p \| 4k; `loop` bool; `concepts[{key}]` (camera motions from `GET /generations/concepts/list`) | | ComfyUI badge (approx. list price): 5 s 540p $0.57, 720p $1.02, 1080p $2.27, 4k $9.11; 9 s $1.03 / $1.83 / $4.10 / $16.40. Third parties quote ≈$0.08/s at 720p. Official unit is per-megapixel-second (rate unverified) |
| `ray-flash-2` | same as ray-2, faster/cheaper | same params | | 5 s 540p $0.20, 720p $0.34, 1080p $0.79, 4k $3.13; 9 s $0.36 / $0.61 / $1.42 / $5.65 (ComfyUI badge) |
| `ray-1-6` | legacy t2v/i2v | no `duration`/`resolution` (fixed 5 s 720p) | | ≈$0.50 / clip (ComfyUI) |
| `photon-1` | t2i / refs / modify / reframe | `aspect_ratio` (same list), `format` jpg \| png, `image_ref[]` (≤4, `weight` 0–1), `style_ref[]`, `character_ref.identity0.images[]` (≤4), `modify_image_ref{url,weight}`, `sync`, `sync_timeout` | | ≈$0.0104 / image (ComfyUI; official ≈$0.0073/MP unverified) |
| `photon-flash-1` | same | same | | ≈$0.0027 / image |
| `ray-3` / `ray-3.2` | **not available on the Dream Machine v1 API** | Ray 3.2 is served by the separate Luma 2 API: `{prompt, model:"ray-3.2", type:"video", aspect_ratio, video:{resolution 360p\|540p\|720p\|1080p, duration "5s"\|"10s", loop (5 s only), start_frame, end_frame, keyframes[], keyframe_indexes[], edit{auto_controls,strength}}, image_ref[{url\|data\|media_type\|generation_id}], source, style, output_format, web_search}` → `{id,type,state,model,output:[{type,url}],failure_reason,failure_code}` (from ComfyUI `apis/luma.py`) | up to 64 keyframes (ComfyUI) | ComfyUI badge: 540p 5 s $0.15 / 10 s $0.45; 720p $0.30 / $0.90; 1080p $1.20 / $3.60 |

## Endpoints (exact)
All generation endpoints are async unless `sync:true` (images only) and return the same `Generation` object.
- `POST https://api.lumalabs.ai/dream-machine/v1/generations` (SDK 1.19 posts to `/generations/video`; both accepted) — minimal: `{"prompt":"...","model":"ray-2"}`; typical: `{"prompt":"...","model":"ray-flash-2","aspect_ratio":"16:9","resolution":"720p","duration":"5s","loop":false,"keyframes":{"frame0":{"type":"image","url":"https://.../start.jpg"},"frame1":{"type":"image","url":"https://.../end.jpg"}},"concepts":[{"key":"orbit_left"}],"callback_url":"https://..."}`; `generation_type:"video"` optional.
- Extend: `{"prompt":"...","model":"ray-2","keyframes":{"frame0":{"type":"generation","id":"<prev generation id>"}}}`; reverse extend uses `frame1`; interpolate uses both generation refs.
- `POST /generations/image` — `{"prompt":"...","model":"photon-1","aspect_ratio":"16:9","format":"png","image_ref":[{"url":"https://...","weight":0.85}],"style_ref":[{"url":"...","weight":0.8}],"character_ref":{"identity0":{"images":["https://..."]}},"modify_image_ref":{"url":"...","weight":1.0},"sync":false}`.
- `POST /generations/image/reframe` — `{"generation_type":"reframe_image","model":"photon-1","media":{"url":"..."},"aspect_ratio":"16:9","prompt":"...","grid_position_x","grid_position_y","x_start","x_end","y_start","y_end","resized_width","resized_height","format"}`.
- `POST /generations/video/reframe` — same fields with `generation_type:"reframe_video"`, `model:"ray-2"|"ray-flash-2"`, optional `first_frame{url}`.
- `POST /generations/video/modify` — `{"generation_type":"modify_video","model":"ray-2","media":{"url":"...mp4"},"mode":"adhere_1|adhere_2|adhere_3|flex_1|flex_2|flex_3|reimagine_1|reimagine_2|reimagine_3","prompt":"...","first_frame":{"url":"..."}}`.
- `POST /generations/{id}/upscale` — `{"resolution":"1080p"}` (generation_type `upscale_video`).
- `POST /generations/{id}/audio` — `{"prompt":"...","negative_prompt":"..."}` (generation_type `add_audio`).
- `GET /generations/{id}` → `{"id":"uuid","generation_type":"video"|"image","state":"queued"|"dreaming"|"completed"|"failed","failure_reason":null,"created_at":"...","model":"ray-2","request":{...echo of request...},"assets":{"video":"https://...mp4","image":"https://...","progress_video":"https://..."}}`. Poll every ~5–10 s (SDK examples use 3 s); typical 60–180 s.
- `GET /generations?limit=&offset=` → `{"generations":[...],"count","has_more","limit","offset"}`; `DELETE /generations/{id}`.
- `GET /generations/concepts/list` → `["truck_left","pan_right","pedestal_down","low_angle",…,"eye_level"]` (34 camera concepts).
- `GET /credits` → `{"credit_balance": <USD cents? number>}` (unit unverified). `GET /ping`.
- Webhooks: `callback_url` on create — Luma POSTs the Generation object when state becomes dreaming/completed/failed.
- Cancel: none (DELETE removes a record; whether it aborts a running job is unverified).

## Input media
- **Public URLs only** for v1: every image/video input is `{ "url": "https://..." }` — the SDK exposes no data-URI or upload field, and ComfyUI uploads inputs to its own CDN first. The Worker must host user files at a temporary public HTTPS URL (R2) before calling Luma. (The Luma 2 / Ray 3.2 schema adds `data` + `media_type` for inline bytes.)
- Image constraints (docs; unverified): jpg/png/webp, reasonable size; aspect ratio should be close to the requested `aspect_ratio` for keyframes.

## Output media
- `assets.video` (mp4) / `assets.image` (jpg or png per `format`) — HTTPS URLs on Luma's CDN; expiry unverified (docs recommend downloading; treat as temporary). Browser fetchability unknown → download via proxy; `<video src>` display is fine.

## Rate limits, quotas, free tier
- Pay-as-you-go with prepaid balance (`GET /credits`); concurrency limits per account (numbers unverified). HTTP 429 on rate limits; errors are `{"detail": "..."}`.

## Gotchas
- `duration` is a string with unit (`"5s"`, `"9s"`), `resolution` is a string (`"720p"`), `aspect_ratio` uses colons.
- Ray 3 / 3.2 are not on this API; the v1 model enum is only `ray-2` / `ray-flash-2` (+ legacy `ray-1-6`). Anything "ray-3" needs the separate Luma 2 API (base URL, auth and pricing unverified).
- Image inputs must be publicly fetchable URLs — no base64.
- `loop:true` is only meaningful without an end keyframe (and on Ray 3.2 only for 5 s).
- Extend/interpolate reference previous generations by id, so keep generation ids in our history.
- Photon `sync:true` blocks up to `sync_timeout`; prefer async + poll for the UI.
- Prices scale steeply with resolution (4k ≈ 16× 540p).

## Adapter mapping notes
- text→image → `POST /generations/image` (photon-flash-1 default, photon-1 quality); image→image edit → `modify_image_ref`; style/character/reference UIs → `style_ref` / `character_ref` / `image_ref`.
- text→video → `POST /generations` (ray-flash-2 default); image→video → `keyframes.frame0` (start) and optional `frame1` (end) with R2-hosted URLs; loop toggle → `loop`; camera preset → `concepts`.
- extend → `keyframes.frame0={type:"generation",id}`; upscale → `POST /generations/{id}/upscale`; add audio → `POST /generations/{id}/audio`.
- Poll `GET /generations/{id}` until `completed|failed`; read `assets.video|image`; surface `failure_reason`.
- Show `GET /credits` balance in settings.
