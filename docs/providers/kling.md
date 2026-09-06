# Kling AI Open API (global)

- Website / docs: https://app.klingai.com/global/dev/document-api (portal), https://app.klingai.com/global/dev/document-api/apiReference/commonInfo (auth + error codes), https://app.klingai.com/global/dev/document-api/apiReference/model/textToVideo , …/model/imageToVideo , …/model/videoTolip (lip-sync), …/model/skillsMap (model × mode × duration capability map), https://app.klingai.com/global/dev/document-api/productBilling/prePaidResourcePackage (billing), https://app.klingai.com/global/dev/api-key (key management), https://kling.ai/dev/pricing . Ground truth used because the docs host was blocked: Kuaishou's own plugin **KwaiVGI/ComfyUI-KLingAI-API** (`py/api/*.py`: client, JWT, every path and field), Comfy-Org/ComfyUI `comfy_api_nodes/apis/kling.py` + `apis/__init__.py` (enums generated from Kling's OpenAPI), a mirrored copy of the official doc (199-mcp/mcp-kling `kling-api-docs.md`, betasecond/KlingDemo `APIDoc_Auth.md`).
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter). app.klingai.com, kling.ai, docs.klingai.com and all api*.klingai.com hosts were blocked by the sandbox egress proxy.
- Adapter id: `kling`  ·  Transport: `proxy` (CORS unverified) — but the JWT can be minted in the browser so the Worker never sees the secret (see Gotchas)  ·  Priority wave: 1

## Account and authentication
- How to get a key: Kling AI (global) → Developer / API → https://app.klingai.com/global/dev/api-key → create **Access Key (AK) + Secret Key (SK)**. The API is prepaid: buy a Resource Package (from ≈$9.80; billing page) — web-app subscription credits do not work for the API. Free API credits: none documented (unverified).
- Auth header exact format: `Authorization: Bearer <JWT>` where the JWT is minted client-side from AK/SK: header `{"alg":"HS256","typ":"JWT"}`, payload `{"iss":"<AK>","exp":<unix now + 1800>,"nbf":<unix now - 5>}`, signed HMAC-SHA256 with the SK (KwaiVGI `client.py`, doc mirror). Any `exp` window works (docs example 30 min); regenerate before expiry. Error codes: HTTP 401 `1000/1001/1002/1003 (nbf not reached)/1004 (expired)`, 429 `1100–1102` account/arrears/package depleted, 403 `1103` no permission for model, 400 `1200/1201` bad params, 404 `1202/1203`, 400 `1300/1301` content policy, 429 `1302` rate, `1303` concurrency/QPS over package limit, `1304` IP whitelist, 5xx `5000–5002`.
- Base URL(s) and regions: Global (current docs) `https://api-singapore.klingai.com`; older global host `https://api.klingai.com` (KwaiVGI `ApiLocation.GLOBAL`, still referenced by many SDKs — unverified whether it is still served); Mainland China `https://api-beijing.klingai.com` (KwaiVGI `ApiLocation.CHINA`, separate account/keys). All paths are identical across hosts.

## Browser (CORS) behaviour
- Result of preflight test from origin https://www.thewoovee.com: **unknown**. `curl -X OPTIONS https://api-singapore.klingai.com/v1/videos/text2video` (and api.klingai.com / api-beijing) returned `403 Forbidden` from the sandbox egress proxy (CONNECT denied by policy) — Kling was never reached. Retest from a real host. Assume proxy.

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | yes | `POST /v1/images/generations` — model_name kling-v1, kling-v1-5, kling-v2, kling-v2-new, kling-v2-1 (Kuaishou plugin list); newer omni-image models kling-image-o1 / kling-v3-omni via `POST /v1/images/omni-image` |
| image→image / edit / inpaint | reference-guided (subject/face) + outpaint; no mask inpaint | `POST /v1/images/generations` with `image` + `image_reference`; `POST /v1/images/editing/expand` (outpainting); `POST /v1/images/kolors-virtual-try-on` (garment try-on) |
| upscale | no | — |
| text→video | yes | `POST /v1/videos/text2video` (kling-v1, v1-5, v1-6, v2-master, v2-1, v2-1-master, v2-5-turbo, v2-6); `POST /v1/videos/omni-video` (kling-v3-omni, kling-video-o1) |
| image→video | yes | `POST /v1/videos/image2video` (`image` + optional `image_tail` end frame, motion brush masks, camera control); `POST /v1/videos/multi-image2video` (1–4 subject images, kling-v1-6); omni-video `image_list` with `type` first_frame / end_frame or reference |
| video→video / extend | yes | `POST /v1/videos/video-extend` (`video_id`, +4–5 s, ≤3 min total); `POST /v1/videos/lip-sync`; `POST /v1/videos/effects` (preset scenes); omni-video `video_list` (refer_type base \| feature) for edit/restyle; `POST /v1/videos/multi-elements` |
| audio in video | yes on v2.6+ / v3-omni | `sound: "on"` (text2video/image2video/omni-video); separate `video2audio` / `text2audio` endpoints exist (Kuaishou plugin) |

## Models
| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| `kling-v2-5-turbo` | t2v, i2v, first+last (`image_tail`) | `mode` pro (std unverified), `duration` "5" \| "10", `aspect_ratio` 16:9 \| 9:16 \| 1:1 (t2v), `cfg_scale` 0–1, `negative_prompt` | prompt ≤2500 (t2v) — ComfyUI caps i2v prompt at 500 | ComfyUI badge: pro 5 s $0.35, 10 s $0.70 |
| `kling-v2-6` | t2v, i2v, sound | same + `sound` on \| off | | ComfyUI card: std $0.07/s, pro $0.112/s; audio doubles the t2v price (ComfyUI badge `0.07 × duration × 2`) |
| `kling-v3` | t2v, i2v with audio on the classic `/v1/videos/text2video` & `image2video` endpoints (ComfyUI model options `kling-v3`, `kling-v2-6`) and `/v1/videos/motion-control` | `mode` std \| pro, `duration`, `sound` on \| off, `multi_shot`/`multi_prompt` | | ComfyUI card: std $0.126/s, pro $0.168/s |
| `kling-v2-1`, `kling-v2-1-master`, `kling-v2-master` | t2v, i2v | `mode` std \| pro, 5/10 s | | resource-package units: V2.1 10 s ≈7 units ($0.98), V2.1 Master 10 s ≈20 units ($2.80) (atlascloud summary; ≈$0.14/unit) |
| `kling-v1-6` | t2v, i2v, multi-image2video, effects | std \| pro, 5/10 s | | ≈$0.18–0.49 per 5 s (third-party summaries) |
| `kling-v1`, `kling-v1-5` | legacy t2v/i2v | camera_control only on v1 std 5 s (docs; unverified) | | cheapest tier |
| `kling-v3-omni` | omni t2v / i2v / ref / edit, audio, multi-shot | `duration` "3"–"15", `mode` std (720p) \| pro (1080p), 4k variant, `sound`, `multi_shot` + `multi_prompt[{index,prompt,duration}]`, `image_list` ≤7, `video_list` ≤1 | | ComfyUI badge (= official per-second card): 720p $0.084/s ($0.112/s with audio), 1080p $0.112/s ($0.14/s with audio), 4k $0.42/s; video edit std $0.126/s, pro $0.168/s |
| `kling-video-o1` | omni (no audio, no 4k, no storyboard) | `duration` 5 \| 10 | | same card |
| `kling-3.0-turbo` (Kling 3.0 Turbo; id as used in ComfyUI paths) | t2v / i2v via a **new request schema** (`contents[{type:"prompt"|"first_frame",text|url}]`, `settings{resolution 720p|1080p, aspect_ratio, duration 3–15}`; status `submitted|processing|succeeded|failed`; result `data[].outputs[{type,url,duration}]`) | prompt ≤3072 | | ≈$0.101/s (720p), $0.126/s (1080p) (imagine.art summary) — see Endpoints for the paths |
| `kling-v1`, `kling-v1-5`, `kling-v2`, `kling-v2-new`, `kling-v2-1` (image) | t2i / ref | `n` 1–9, `aspect_ratio` 16:9 \| 9:16 \| 1:1 \| 4:3 \| 3:4 \| 3:2 \| 2:3 \| 21:9, `resolution` "1k" \| "2k", `image_reference` subject \| face, `image_fidelity` 0–1, `human_fidelity` 0–1 (not on v2-1) | prompt ≤500, negative ≤200 | ≈$0.028/image (1k/2k), $0.056 (4k) for omni-image (ComfyUI); legacy per-image unit price unverified |
| `kolors-virtual-try-on-v1`, `kolors-virtual-try-on-v1-5` | try-on | `human_image`, `cloth_image` | | unverified |

## Endpoints (exact)
All generation endpoints are async; every response is `{"code":0,"message":"SUCCEED","request_id":"...","data":{...}}` and `code != 0` means error even with HTTP 200. Task objects: `data.task_id`, `data.task_status` ∈ `submitted` | `processing` | `succeed` | `failed`, `data.task_status_msg`, `data.task_info.external_task_id`, `data.created_at` / `updated_at` (unix **ms**), `data.task_result` (`videos:[{id,url,duration}]` or `images:[{index,url}]`). Query: `GET <create path>/{task_id}`; list: `GET <create path>?pageNum=1&pageSize=30` (param names per doc mirror TOC; unverified). Optional on every create: `callback_url`, `external_task_id`.
- `POST /v1/videos/text2video` — `{"model_name":"kling-v2-5-turbo","prompt":"...","negative_prompt":"","cfg_scale":0.5,"mode":"pro","aspect_ratio":"16:9","duration":"5","camera_control":{"type":"simple","config":{"horizontal":0,"vertical":0,"pan":0,"tilt":0,"roll":0,"zoom":5}},"sound":"off"}`; `camera_control.type` ∈ simple \| down_back \| forward_up \| right_turn_forward \| left_turn_forward (config only with `simple`, one non-zero axis −10…10). Poll `GET /v1/videos/text2video/{task_id}`.
- `POST /v1/videos/image2video` — `{"model_name":"kling-v2-5-turbo","image":"<https URL or raw base64 (no data: prefix)>","image_tail":"<end frame, same formats>","prompt":"...","negative_prompt":"","cfg_scale":0.5,"mode":"pro","duration":"5","static_mask":"<mask>","dynamic_masks":[{"mask":"...","trajectories":[{"x":..,"y":..}]}],"camera_control":{...}}`; poll `GET /v1/videos/image2video/{task_id}`.
- `POST /v1/videos/multi-image2video` — `{"model_name":"kling-v1-6","image_list":[{"image":"..."},{"image":"..."}],"prompt":"...","negative_prompt":"","mode":"std","duration":"5","aspect_ratio":"16:9"}` (1–4 images).
- `POST /v1/videos/video-extend` — `{"video_id":"<id from a previous task_result.videos[].id>","prompt":"...","negative_prompt":"","cfg_scale":0.5}`; returns a new video id; poll `GET /v1/videos/video-extend/{task_id}`.
- `POST /v1/videos/lip-sync` — `{"input":{"video_id":"..." | "video_url":"https://...mp4","mode":"text2video"|"audio2video","text":"≤120 chars","voice_id":"...","voice_language":"zh"|"en","voice_speed":1.0,"audio_type":"file"|"url","audio_file":"<base64 ≤5MB>","audio_url":"https://..."},"callback_url":"..."}`; video 2–10 s, ≤100 MB, 720p/1080p, 720–1920 px; poll `GET /v1/videos/lip-sync/{task_id}`.
- `POST /v1/videos/effects` — `{"effect_scene":"hug"|"kiss"|"heart_gesture"|"fight"|"squish"|"expansion"|"bloombloom"|"dizzydizzy"|"fuzzyfuzzy"|…,"input":{"model_name":"kling-v1-6","mode":"std","duration":"5","image":"...","images":["...","..."]}}`.
- `POST /v1/videos/omni-video` — `{"model_name":"kling-v3-omni","prompt":"...","aspect_ratio":"16:9","duration":"5","mode":"pro","sound":"on","image_list":[{"image_url":"https://...","type":"first_frame"},{"image_url":"...","type":"end_frame"}],"video_list":[{"video_url":"...","refer_type":"base"|"feature","keep_original_sound":"yes"}],"multi_shot":false,"multi_prompt":[{"index":1,"prompt":"...","duration":"3"}],"shot_type":"..."}`; poll `GET /v1/videos/omni-video/{task_id}`.
- `POST /v1/videos/multi-elements` — `{"model_name","session_id","edit_mode","image_list","prompt","negative_prompt","mode","duration"}` (element editing; details unverified).
- `POST /v1/images/generations` — `{"model_name":"kling-v2-1","prompt":"...","negative_prompt":"","image":"<URL or base64>","image_reference":"subject"|"face","image_fidelity":0.5,"human_fidelity":0.45,"n":1,"aspect_ratio":"16:9","resolution":"1k"}`; poll `GET /v1/images/generations/{task_id}` → `task_result.images[{index,url}]`.
- `POST /v1/images/editing/expand` — `{"image":"...","up_expansion_ratio":0.5,"down_expansion_ratio":0,"left_expansion_ratio":0,"right_expansion_ratio":0,"prompt":"...","n":1}` (each 0–2, total area ≤3×).
- `POST /v1/images/kolors-virtual-try-on` — `{"model_name":"kolors-virtual-try-on-v1-5","human_image":"...","cloth_image":"..."}`; poll `GET /v1/images/kolors-virtual-try-on/{task_id}`.
- `POST /v1/images/omni-image` (`kling-image-o1` / `kling-v3-omni`; path from ComfyUI `nodes_kling.py`) — `{"model_name":"kling-image-o1","resolution":"1k"|"2k"|"4k","aspect_ratio":"16:9","prompt":"...","mode":"pro","n":1,"image_list":[{"image":"..."}],"result_type":"series","series_amount":4}` (≤10 input images, `n` ≤9, series 2–9); poll `GET /v1/images/omni-image/{task_id}` → `task_result.images[]` or `series_images[]`.
- `POST /v1/videos/avatar/image2video` — `{"image":"...","sound_file":"<audio>","prompt":"...","mode":"std"|"pro"}` (talking avatar; poll `GET .../avatar/image2video/{task_id}`).
- `POST /v1/videos/motion-control` — `{"model_name":"kling-v3","prompt","image_url","video_url","keep_original_sound":"yes"|"no","character_orientation","mode":"std"|"pro"}` (drive an image with a reference video's motion; poll `GET .../motion-control/{task_id}`).
- Kling 3.0 Turbo (new schema): ComfyUI posts to `text-to-video/kling-3.0-turbo` and `image-to-video/kling-3.0-turbo` and polls `tasks/{id}` — note **no `/v1` prefix** in those proxy paths; the real public base path is unverified.
- ComfyUI also exposes `model_name:"kling-v3"` on an image-generation node using the image aspect-ratio enum (endpoint presumably `/v1/images/generations`; unverified).
- Account: resource-package balance endpoint exists (`KlingResourcePackageResponse`; docs section "Query Resource Package List") — path unverified.
- Webhooks: `callback_url` POSTs the task object on status change ("Callback Protocol" doc section). Cancel: none.

## Input media
- Images: HTTPS URL **or raw base64 string without the `data:image/...;base64,` prefix** (docs; Kuaishou plugin sends base64). Limits: ≤10 MB, ≥300×300 px, aspect 1:2.5–2.5:1 (jpg/jpeg/png). `image_tail` same. Masks must match the input aspect.
- Video inputs: `video_id` from prior Kling tasks (valid ~30 days) or public URL (.mp4/.mov ≤100 MB, 2–10 s). Audio: base64 or URL, .mp3/.wav/.m4a/.aac ≤5 MB.
- Because base64 is accepted inline, no upload host is required for images (watch JSON body size through the Worker).

## Output media
- `task_result.videos[].url` (mp4, no watermark on API output per docs — unverified) and `.id` (reuse for extend / lip-sync), `task_result.images[].url` (png/jpg). Retention: results/IDs referenced as usable for 30 days (lip-sync doc: "videos generated within the last 30 days"); explicit URL expiry unverified — copy to R2. Browser fetchability of the CDN unknown → proxy.

## Rate limits, quotas, free tier
- Concurrency and QPS are per prepaid Resource Package (error `1303` when exceeded; `1302` for burst rate). No free tier. Packages expire (error `1102`).

## Gotchas
- **JWT minting.** HS256 is 10 lines of WebCrypto (`crypto.subtle.importKey('raw', sk, {name:'HMAC', hash:'SHA-256'}, false, ['sign'])` + base64url) — feasible in the browser. Recommended design: the SPA mints a short-lived JWT (e.g. `exp = now + 30 min`) from the locally stored AK/SK and sends **only the JWT** to the Worker (`Authorization: Bearer <jwt>`), which forwards it; the secret never crosses the wire. If the Worker must mint, it needs both AK and SK per request. Clock skew: keep `nbf = now − 5…60 s`; error 1003 = token not yet valid, 1004 = expired.
- Status word is `succeed` (not `succeeded`); timestamps are milliseconds.
- `code`/`message` in the JSON body carry the real error even on HTTP 200; `1103` usually means the chosen model/mode is not enabled for the account's package.
- Model × mode × duration × feature support is a matrix (`skillsMap` page): e.g. `image_tail` only on specific combos (ComfyUI only enables it for `kling-v2-5-turbo` pro 5/10 s), `camera_control` only on v1 std 5 s, `sound` only on v2.6+/omni, `negative_prompt` ignored on some models. Keep the matrix data-driven and show server messages.
- `duration` is a **string** ("5"), `mode` is std \| pro, `aspect_ratio` uses colons.
- Kling 3.0 Turbo uses a different request/response schema (`contents`/`settings`, `data.id`, `outputs[]`) — treat as a separate adapter path.
- Two global hosts exist (`api-singapore` current, `api` legacy); mainland accounts are separate.

## Adapter mapping notes
- text→video → `/v1/videos/text2video`; image→video (+ end frame) → `/v1/videos/image2video`; multi-subject → `/v1/videos/multi-image2video`; audio-enabled / long / multi-shot → `/v1/videos/omni-video` (kling-v3-omni). Map our duration select to "5"/"10" (3–15 for omni), quality toggle to `mode` std/pro, aspect to 16:9/9:16/1:1.
- extend → `/v1/videos/video-extend` with the stored `videos[].id`; lip-sync → `/v1/videos/lip-sync`.
- text→image / ref image → `/v1/images/generations` (`n` = our count, `resolution` 1k/2k, `image_reference` subject/face); outpaint → `/v1/images/editing/expand`; try-on → `/v1/images/kolors-virtual-try-on`.
- Poll `GET <create path>/{task_id}` every 5–10 s until `succeed|failed`; typical times (ComfyUI estimates): t2v ≈5 min, i2v ≈3 min, lip-sync ≈7 min, image ≈30 s.
- Auth UI needs two fields (AK, SK) plus region (global/mainland); token minted in the SPA per request batch.
