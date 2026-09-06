# MiniMax (Hailuo) video + image API

- Website / docs: https://platform.minimax.io/docs/api-reference/video-generation-intro , https://platform.minimax.io/docs/api-reference/video-generation-t2v , https://platform.minimax.io/docs/api-reference/video-generation-i2v , https://platform.minimax.io/docs/api-reference/video-generation-fl2v , https://platform.minimax.io/docs/api-reference/video-generation-query , https://platform.minimax.io/docs/api-reference/video-generation-v2-create , https://platform.minimax.io/docs/api-reference/video-generation-v2-query , https://platform.minimax.io/docs/api-reference/image-generation-t2i , https://platform.minimax.io/docs/api-reference/image-generation-i2i , https://platform.minimax.io/docs/guides/pricing-video . Official code used as ground truth: MiniMax-AI/MiniMax-MCP (`minimax_mcp/server.py`, `client.py`, `const.py`) and MiniMax-AI/MiniMax-MCP-JS (`src/api/video.ts`, `image.ts`, `const/index.ts`); field enums cross-checked with Comfy-Org/ComfyUI `comfy_api_nodes/apis/minimax.py`.
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter). platform.minimax.io, www.minimax.io and api.minimax.io were blocked by the sandbox egress proxy; doc pages were seen only as search snippets.
- Adapter id: `minimax`  ·  Transport: `proxy` (CORS unverified)  ·  Priority wave: 1

## Account and authentication
- How to get a key: MiniMax Global platform → User Center → Basic information → Interface key: https://www.minimax.io/platform/user-center/basic-information/interface-key (mainland: https://platform.minimaxi.com/user-center/basic-information/interface-key). Keys are region-bound: a global key only works against `api.minimax.io`; a mismatched host yields `base_resp.status_code 1004 "invalid api key"` (MCP README). Mainland accounts may need real-name verification (`status_code 2038`). Free credits: unverified.
- Auth header exact format: `Authorization: Bearer <MINIMAX_API_KEY>`; `Content-Type: application/json` (MCP `client.py`).
- Base URL(s) and regions: Global `https://api.minimax.io`; Mainland China `https://api.minimaxi.com`. (Legacy host `https://api.minimax.chat` still appears in the JS MCP default; prefer `.io`.)

## Browser (CORS) behaviour
- Result of preflight test from origin https://www.thewoovee.com: **unknown**. `curl -X OPTIONS https://api.minimax.io/v1/video_generation` returned `403 Forbidden` from the sandbox egress proxy (CONNECT denied), never reaching MiniMax. Retest from a real host; assume proxy.

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | yes | `POST /v1/image_generation`, model `image-01` |
| image→image / edit / inpaint | subject/character reference only (no edit/inpaint) | `POST /v1/image_generation` with `subject_reference` |
| upscale | no | — |
| text→video | yes | `POST /v1/video_generation` (T2V-01, T2V-01-Director, MiniMax-Hailuo-02, MiniMax-Hailuo-2.3, Hailuo 2.3 Fast); `POST /v2/video_generation` (MiniMax-H3) |
| image→video | yes | `/v1/video_generation` with `first_frame_image` (I2V-01, I2V-01-Director, I2V-01-live, MiniMax-Hailuo-02, Hailuo-2.3) and `last_frame_image` (first+last, Hailuo-02); v2 `content[]` roles first_frame / last_frame |
| video→video / extend | v2 only (reference video) | `/v2/video_generation` `video_url` role `reference_video`; `/v2/video_regeneration` |
| audio in video | v2 reference audio input only; no generated audio field found on v1 | `/v2/video_generation` `audio_url` role `reference_audio` |

## Models
| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| `MiniMax-Hailuo-2.3` | t2v / i2v (v1) | `duration` 6 \| 10, `resolution` `768P` \| `1080P` (1080P → 6 s only, like Hailuo-02; unverified for 2.3) | prompt ≤ 2000 chars | official "video points": 768p 6 s = 1 pt, 768p 10 s = 2 pt, 1080p 6 s = 2 pt (pricing-video page snippet); USD/pt unverified. Third parties resell at ≈$0.08/s |
| `MiniMax-Hailuo-2.3-Fast` (exact id unverified) | t2v / i2v | as above | | unverified |
| `MiniMax-Hailuo-02` | t2v / i2v / first+last | `duration` 6 \| 10; `resolution` `512P` \| `768P` \| `1080P`; 1080P only with 6 s | | ComfyUI badge (approx.): 768P 6 s $0.28, 10 s $0.56, 1080P 6 s $0.49; official points: 512p 6 s = 0.3, 10 s = 0.5 |
| `T2V-01`, `T2V-01-Director` | t2v (legacy 01 series, 6 s, 720p/25 fps) | prompt; Director accepts camera instructions in `[brackets]` (15 moves) | no duration/resolution params | ≈$0.43 / video (ComfyUI); third parties $0.43–0.50 |
| `I2V-01`, `I2V-01-Director`, `I2V-01-live` | i2v | `first_frame_image` required | | ≈$0.43 / video |
| `S2V-01` | subject→video | `subject_reference` (character image) | | ≈$0.43 / video |
| `MiniMax-H3` | v2 omni (t2v, first/last frame, reference image/video/audio) | `resolution` `768P` \| `2K`, `duration` 4–15, `ratio`, `seed`, `aigc_watermark` | | ComfyUI badge ≈ $0.1287/s (768p), $0.1859/s (2K) |
| `image-01` | t2i / subject ref | `aspect_ratio` 1:1, 16:9, 4:3, 3:2, 2:3, 3:4, 9:16, 21:9; `n` 1–9; `prompt_optimizer`; `response_format` url \| base64 (snippet) | | unverified |

## Endpoints (exact)
### Video v1 — create (async)
- `POST https://api.minimax.io/v1/video_generation`
- Request (minimal t2v): `{"model":"MiniMax-Hailuo-2.3","prompt":"..."}`
- Optional (MCP + ComfyUI models): `prompt_optimizer` (bool, default true), `first_frame_image` (HTTPS URL or `data:image/jpeg;base64,...`), `last_frame_image` (fl2v page: public URL or base64 data URL), `duration` (6 | 10), `resolution` (`"512P"` | `"768P"` | `"1080P"`), `subject_reference` (S2V-01: array; ComfyUI shape `[{"image":"<url|base64>","mask":"..."}]`, JS MCP sends `{ "type":"character","image_file":...}` per image docs — **confirm exact shape**), `callback_url`.
- Response: `{"task_id":"1234567890","base_resp":{"status_code":0,"status_msg":"success"}}` — `status_code` 0 = success; any other value is an API error even with HTTP 200.
### Video v1 — poll
- `GET https://api.minimax.io/v1/query/video_generation?task_id=<id>` → `{"task_id":"...","status":"Preparing"|"Queueing"|"Processing"|"Success"|"Fail","file_id":"<id when Success>","base_resp":{...}}`. MCP polls every 20 s (60 tries for Hailuo-02); ComfyUI estimates 120 s (768P) / 240 s (1080P). No cancel endpoint found.
### File retrieve
- `GET https://api.minimax.io/v1/files/retrieve?file_id=<file_id>` → `{"file":{"file_id":<int>,"bytes":n,"created_at":<unix>,"filename":"...mp4","purpose":"video_generation","download_url":"https://...","backup_download_url":"https://..."},"base_resp":{...}}`. Use `backup_download_url` if the primary times out.
### Video v2 (MiniMax-H3)
- `POST https://api.minimax.io/v2/video_generation` `{"model":"MiniMax-H3","content":[{"type":"text","text":"..."},{"type":"image_url","image_url":{"url":"https://..."},"role":"first_frame"}],"resolution":"768P","duration":6,"ratio":"16:9","seed":123,"aigc_watermark":false}` → `{"task_id":"..."}`
- `GET https://api.minimax.io/v2/query/video_generation/{task_id}` → `{"task":{"id","status","error":{"code","message"},"content":{"url":"https://...mp4","prompt":"..."},"usage":{"total_seconds","input_seconds","output_seconds"}}}`; v2 status vocabulary per third-party guides: `queued`, `running`, `succeeded`, `failed`, `cancelled` (**unverified**; ComfyUI only checks a failed-status list).
- Also `POST /v2/h3_context_ir`, `POST /v2/video_regeneration` (regenerate from a task).
### Image
- `POST https://api.minimax.io/v1/image_generation` `{"model":"image-01","prompt":"...","aspect_ratio":"1:1","n":1,"prompt_optimizer":true}`; optional `response_format` (`"url"` | `"base64"`), `subject_reference` (see above), `width`/`height` (docs mention custom resolution; unverified).
- Response: `{"id":"...","data":{"image_urls":["https://..."]},"metadata":{...},"base_resp":{"status_code":0,"status_msg":"success"}}` (MCP reads `data.image_urls`). Synchronous.
- Webhooks: `callback_url` on v1 video create (payload unverified).

## Input media
- `first_frame_image` / `last_frame_image`: public HTTPS URL or base64 data URL (`data:image/jpeg;base64,...`) — both accepted (MCP converts local files to data URLs). Size/aspect limits per docs (commonly ≤20 MB, short side ≥300 px, aspect 2:5–5:2) unverified. v2 `content[]` items take URLs only (data URLs unverified).
- `subject_reference` image: URL or base64.

## Output media
- Videos: `download_url` from `/v1/files/retrieve` (mp4) or v2 `task.content.url`. Expiry: **unverified** (treat as short-lived; copy to R2). Images: `data.image_urls[]` (jpeg) or base64 when `response_format:"base64"`. Browser-fetchability of the CDN host is unknown → download via proxy.

## Rate limits, quotas, free tier
- Concurrency/RPM limits per model and per plan are documented on the pricing pages (unverified numbers). Errors surface as `base_resp.status_code != 0` (1004 auth, 2038 verification, others like insufficient balance / rate limit) with HTTP 200, so the adapter must inspect `base_resp` on every response.

## Gotchas
- HTTP 200 does not mean success: check `base_resp.status_code == 0`.
- Task status words are capitalized on v1 (`Success`, `Fail`) and lower-case on v2.
- Video download is a three-step dance (create → query → files/retrieve) on v1; v2 returns the URL directly in the query response.
- `1080P` restricts Hailuo-02 to 6 s; the 01-series ignores `duration`/`resolution`.
- Region/host/key mismatch is the #1 support issue (per MCP README).
- No documented cancel for v1 tasks.

## Adapter mapping notes
- text→video / image→video → v1 `/v1/video_generation` for Hailuo-2.3 / 02 / 01-series; poll `/v1/query/video_generation` until `Success|Fail`; then `/v1/files/retrieve` → `download_url`. Map our first/last-frame UI to `first_frame_image` / `last_frame_image`; duration select 6|10; resolution select 512P|768P|1080P (disable 10 s at 1080P).
- MiniMax-H3 (wave 2) → v2 `/v2/video_generation` with `content[]` items; poll `/v2/query/video_generation/{id}`.
- text→image → `/v1/image_generation` (sync); our `count` → `n` (1–9); aspect select from list; use `response_format:"url"` by default.
- Region selector (global vs mainland) swaps base URL; store key per region.
