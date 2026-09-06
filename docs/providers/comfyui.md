# ComfyUI (local server)

- Website / docs: https://github.com/comfyanonymous/ComfyUI · https://docs.comfy.org/development/comfyui-server/comms_routes · https://docs.comfy.org/development/comfyui-server/comms_messages · https://docs.comfy.org/development/comfyui-server/startup-flags · https://docs.comfy.org/development/api-development/workflow-api-format · https://docs.comfy.org/development/comfyui-server/api-key-integration
- Last verified: 2026-09-06 (by web research against the `master` branch of `server.py`, `comfy/cli_args.py`, `execution.py`, `nodes.py`, `comfy_extras/nodes_video.py`, `comfy_api/latest/_ui.py`, `app/user_manager.py`, and the source of docs.comfy.org in github.com/Comfy-Org/docs; re-verify before shipping the adapter)
- Adapter id: `comfyui`  ·  Transport: `direct` (browser → user's PC; see `local-access.md`)  ·  Priority wave: 1

Note on sources: docs.comfy.org itself was not reachable from the research sandbox, so every docs.comfy.org claim below was read from the docs' source repository (github.com/Comfy-Org/docs, `development/comfyui-server/*.mdx`, `installation/*.mdx`). Server behaviour claims were read directly from ComfyUI source files.

## Account and authentication
- No account. ComfyUI is a local aiohttp server; there is **no built-in API key or login** for the HTTP API. `comfy/cli_args.py` defines no auth flag (the only related flag is `--multi-user`, "Enables per-user storage", which selects per-user *storage* via a `comfy-user` request header, not authentication — `app/user_manager.py::get_request_user_id`).
- Default base URL: `http://127.0.0.1:8188` (`--listen` default `127.0.0.1`, `--port` default `8188`, `comfy/cli_args.py`). The **Desktop app** runs the same server on `127.0.0.1:8000` by default (`DEFAULT_SERVER_ARGS = { listen: '127.0.0.1', port: '8000', 'enable-manager': '' }` in github.com/Comfy-Org/desktop `src/constants.ts`).
- All routes are also mounted under an `/api/` prefix (e.g. `/api/prompt`, `/api/history`); the frontend uses the `/api/…` form. Either works.
- Protecting a remote exposure is the job of Cloudflare Access / a reverse proxy — see `local-access.md`. If the user puts Access in front, the browser needs either the `CF_Authorization` cookie for the `comfy.` hostname or the `CF-Access-Client-Id` / `CF-Access-Client-Secret` headers (service token). ComfyUI's CORS middleware only whitelists `Content-Type, Authorization` request headers, so **custom `CF-Access-Client-*` headers sent from the browser would fail ComfyUI's own preflight** unless Access answers the preflight itself (see `local-access.md` §c).
- Comfy.org "Partner/API nodes" (paid cloud models inside a workflow): pass the user's ComfyUI Account API key as `extra_data.api_key_comfy_org` in the `POST /prompt` body (docs: api-key-integration.mdx; server: `server.py` copies `extra_data` from the request into the job). This is optional and only needed if the workflow contains API nodes. `--disable-api-nodes` disables them entirely and adds a strict CSP.

## Browser (CORS) behaviour
- Default (no flag): `create_origin_only_middleware()` — returns **403** if `Sec-Fetch-Site: cross-site`, and returns 403 when the `Host` is a loopback address and `Origin` host ≠ `Host` (server.py lines ~159-197, verified). So a fetch from `https://www.thewoovee.com` to `http://127.0.0.1:8188` is **rejected with 403 unless `--enable-cors-header` is set** (and there are no CORS response headers anyway).
- With `--enable-cors-header <ORIGIN>` (`type=str, nargs="?", const="*"`, help: "Enable CORS (Cross-Origin Resource Sharing) with optional origin or allow all with default '*'"), `create_cors_middleware(allowed_origin)` sets on **every** response, and answers `OPTIONS` itself with 200 before any handler runs:
  ```
  Access-Control-Allow-Origin: <exactly the string you passed>
  Access-Control-Allow-Methods: POST, GET, DELETE, PUT, OPTIONS, PATCH
  Access-Control-Allow-Headers: Content-Type, Authorization
  Access-Control-Allow-Credentials: true
  ```
  - **Single origin only.** The value is echoed verbatim; there is no list parsing and no per-request reflection. Passing `a,b` would emit an invalid header. For this app the user must run `--enable-cors-header https://www.thewoovee.com` (exact scheme+host, no trailing slash, no path).
  - `--enable-cors-header` with no value → `*`. Note `*` together with `Access-Control-Allow-Credentials: true` is rejected by browsers **only if** the request uses `credentials: 'include'`; our adapter must use `credentials: 'omit'` when the origin is `*`, and should recommend the exact-origin form.
  - Preflight is handled (OPTIONS → 200 with the headers above). No `Access-Control-Max-Age` is sent, so every non-simple request re-preflights.
  - Only `Content-Type` and `Authorization` are allowed request headers. `multipart/form-data` uploads and `application/json` POSTs work; **any other custom header (e.g. `comfy-user`, `CF-Access-Client-Id`) will fail preflight** against ComfyUI itself.
  - The `Sec-Fetch-Site` 403 check is only in the *default* middleware; with `--enable-cors-header` set it is not applied.
- Result of preflight test from origin https://www.thewoovee.com: **not executed** (no live ComfyUI in the sandbox) — behaviour above is derived from source. Expectation: blocked (403) by default; allowed when started with `--enable-cors-header https://www.thewoovee.com`.
- Mixed content / Local Network Access: `https://www.thewoovee.com` → `http://127.0.0.1:8188` is exempt from mixed-content blocking in Chrome/Edge/Firefox but **not Safari**, and in Chrome 142+ triggers the Local Network Access permission prompt. Details and the Chrome `targetAddressSpace` fetch option in `local-access.md` §a.
- WebSocket `ws://127.0.0.1:8188/ws` from an https page: same rules (loopback exempt from mixed content in Chromium/Firefox; Safari blocks). WebSockets have no CORS preflight; ComfyUI does not check `Origin` on `/ws` in the CORS middleware path, and in the default middleware `Sec-Fetch-Site: cross-site` is not sent by browsers on WebSocket handshakes in all cases — treat as "works when `--enable-cors-header` is set; unverified otherwise".

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | Yes | Any workflow (SD1.5/SDXL/Flux/SD3/Qwen/etc. — whatever checkpoints the user has). `POST /prompt` with an API-format workflow. |
| image→image / edit / inpaint | Yes | Workflow with `LoadImage` (+ `LoadImageMask` / `VAEEncodeForInpaint`). Upload inputs via `POST /upload/image` and `POST /upload/mask`. |
| upscale | Yes | Workflow with `UpscaleModelLoader` + `ImageUpscaleWithModel`, or latent upscale. |
| text→video | Yes | Workflows with video models (Wan, LTX, Hunyuan, Mochi, CogVideo…) + `SaveVideo` (core) or `VHS_VideoCombine` (custom node). |
| image→video | Yes | Same, with `LoadImage` conditioning. |
| video→video / extend | Yes (workflow-dependent) | `LoadVideo` / `GetVideoComponents` core nodes exist (`comfy_extras/nodes_video.py`). |
| audio in video | Yes | `CreateVideo` node takes optional `audio`; `SaveVideo` saves container with audio. |

Everything is workflow-driven: the adapter cannot "call txt2img"; it must submit a complete node graph. Plan: ship a few built-in API-format workflow templates (SD1.5/SDXL txt2img, img2img, inpaint, upscale, one video template) with named "slots" (prompt, negative, seed, steps, cfg, size, checkpoint, input image filename) that the app patches before `POST /prompt`, plus "import your own API-format JSON" with slot mapping. Use `GET /object_info` to populate choice widgets (checkpoint names, samplers, schedulers) — see below.

## Models
| Model id | Type | Key params | Limits | Price |
|---------|------|-----------|--------|-------|
| (none fixed) | Whatever files exist in `models/checkpoints`, `models/diffusion_models`, `models/loras`, … | Discover with `GET /models` (list of folder types) → `GET /models/{folder}` (filenames), or from `GET /object_info/CheckpointLoaderSimple` → `input.required.ckpt_name[0]` (array of names) | Local GPU | free |

## Endpoints (exact)
Base: `http://<host>:<port>` (default `http://127.0.0.1:8188`). All paths below also exist under `/api/…`.

### `POST /prompt` — queue a workflow (async)
Request JSON (server.py `post_prompt`, verified):
```json
{
  "prompt": { "<node_id>": { "class_type": "KSampler", "inputs": { "seed": 5, "steps": 20, "cfg": 8, "sampler_name": "euler", "scheduler": "normal", "denoise": 1, "model": ["4", 0], "positive": ["6", 0], "negative": ["7", 0], "latent_image": ["5", 0] }, "_meta": { "title": "KSampler" } }, "...": {} },
  "client_id": "<uuid you also used on /ws?clientId=>",
  "prompt_id": "<optional canonical lowercase UUID; server mints one if absent>",
  "extra_data": { "api_key_comfy_org": "<optional>", "extra_pnginfo": { "workflow": {} } },
  "front": false,
  "number": 0,
  "partial_execution_targets": ["<optional node ids>"]
}
```
- `prompt` (required) = the **API-format** workflow: object keyed by node id, each `{ "inputs": {...}, "class_type": "<NodeClass>", "_meta": {"title": ...} }`; links are `[ "<source_node_id>", <output_index> ]` (docs workflow-api-format.mdx).
- `client_id` optional; if given, execution messages on `/ws` are routed only to that socket (execution.py: `server.client_id` is set from `extra_data["client_id"]` and `send_sync(..., server.client_id)`).
- `number` = explicit priority (float); `front: true` = jump the queue (priority negated). `prompt_id` must be a valid UUID or 400 `{"error":{"type":"invalid_prompt_id",...}}`.
- Response 200: `{"prompt_id": "<uuid>", "number": <float>, "node_errors": {}}`.
- Response 400 (validation failure): `{"error": {"type": "...", "message": "...", "details": "...", "extra_info": {}}, "node_errors": {"<node_id>": {"errors": [...], "dependent_outputs": [...], "class_type": "..."}}}`.
- Non-JSON body → 400. Payload limit is `--max-upload-size` (default 100 MB, applied to the whole aiohttp app via `client_max_size`).

### `GET /prompt` — queue counter
`{"exec_info": {"queue_remaining": <int>}}`.

### `GET /history?max_items=N&offset=M` and `GET /history/{prompt_id}` — results (poll this)
Returns an object keyed by `prompt_id` (empty `{}` if unknown / still running / not yet finished). Each entry (execution.py `task_done`, verified):
```json
{
  "<prompt_id>": {
    "prompt": [<number>, "<prompt_id>", {<api workflow>}, {<extra_data>}, ["<output node ids>"]],
    "outputs": {
      "9": { "images": [ { "filename": "ComfyUI_00001_.png", "subfolder": "", "type": "output" } ] },
      "12": { "images": [ { "filename": "video/ComfyUI_00001_.mp4", "subfolder": "video", "type": "output" } ], "animated": [true] },
      "15": { "gifs": [ { "filename": "AnimateDiff_00001.mp4", "subfolder": "", "type": "output", "format": "video/h264-mp4", "frame_rate": 8.0, "workflow": "AnimateDiff_00001.png", "fullpath": "/abs/path.mp4" } ] },
      "20": { "audio": [ { "filename": "audio/ComfyUI_00001_.flac", "subfolder": "audio", "type": "output" } ] }
    },
    "status": { "status_str": "success" | "error", "completed": true | false, "messages": [["execution_start", {...}], ["execution_cached", {...}], ["execution_success", {...}]] },
    "meta": { "<node_id>": { "node_id": "...", "display_node": "...", "parent_node": null, "real_node_id": "..." } }
  }
}
```
- `outputs` is keyed by output-node id; the value is whatever the node returned under `"ui"`. Core `SaveImage`/`PreviewImage` → `images: [{filename, subfolder, type}]` (`nodes.py` line ~1719). `type` is `"output"` for SaveImage, `"temp"` for PreviewImage.
- **Video outputs**:
  - Core `SaveVideo` node (`comfy_extras/nodes_video.py`) returns `ui.PreviewVideo([SavedResult(file, subfolder, output)])` whose `as_dict()` is `{"images": [ {filename, subfolder, type} ], "animated": (True,)}` (`comfy_api/latest/_ui.py` lines 432-437). So videos from the core node appear under the **`images`** key with an `animated: [true]` flag; default `filename_prefix` is `video/ComfyUI` so `subfolder` is `video` and the file is `.mp4`/`.mkv`/`.webm`. Fetch with `/view` exactly like an image; detect video by extension (or by `animated`).
  - Core `SaveAnimatedWEBP`/`SaveAVIF` animated mode: `{"images": [...], "animated": (True,)}` as well (`comfy_extras/nodes_images.py`).
  - Core `SaveAudio*`: `{"audio": [ {filename, subfolder, type} ]}`.
  - **VHS `VideoCombine`** (Kosinkadink/ComfyUI-VideoHelperSuite, `videohelpersuite/nodes.py` line ~634): `{"gifs": [ { "filename", "subfolder", "type": "output"|"temp", "format": "video/h264-mp4"|"image/gif"|…, "frame_rate": <float>, "workflow": "<png name>", "fullpath": "<abs path>" } ]}`. There is **no `videos[]` key** in either core or VHS.
  - Adapter rule: iterate every output node; collect entries from `images`, `gifs`, `audio` (and tolerate unknown keys whose items have `filename`+`type`).
- `status.status_str` is `"success"` or `"error"`; `status.completed` boolean; on error the `messages` list contains an `execution_error` tuple with `exception_message`, `node_id`, `node_type`, `traceback`. History is capped (`MAXIMUM_HISTORY_SIZE` in execution.py, default 10000).
- `POST /history` body `{"clear": true}` or `{"delete": ["<prompt_id>", ...]}` → 200.

### `GET /view?filename=&subfolder=&type=` — download an output/input/temp file
- `filename` (required; `..` or leading `/` → 400), `subfolder` (optional), `type` = `output` (default) | `input` | `temp`.
- Optional `preview=webp|jpeg[;quality]` (re-encodes images, default webp q90) and `channel=rgba|rgb|a`.
- Returns the raw file with `Content-Type` from the extension and `Content-Disposition`. Works for `.mp4`/`.webm` too (video served as a normal file; `Range` requests are not specially handled — treat as full download). Since ComfyUI 2026 the frontend may also pass `filename=blake3:<hash>` asset hashes; not needed by us.
- In the browser: `fetch(url).then(r=>r.blob())` then `URL.createObjectURL`. `<img src>`/`<video src>` also works when CORS is enabled (plain GET, no preflight) — but if Access sits in front, `<img>` tags do not send the Access cookie cross-site unless `crossorigin="use-credentials"`.

### `POST /upload/image` and `POST /upload/mask` — upload inputs (multipart/form-data)
- Fields: `image` (file part, filename required), `overwrite` (`"true"` or `"1"`), `subfolder` (optional), `type` = `input` (default) | `temp` | `output`.
- Without `overwrite`, an existing name gets ` (1)`, ` (2)`… appended unless the content hash matches (dedupe).
- `/upload/mask` additionally requires `original_ref` = JSON string `{"filename": "...", "subfolder": "...", "type": "input"}` referencing the image the mask belongs to; the server writes the alpha channel of the uploaded mask into a copy of that image and saves it under `clipspace/` (the returned `name`/`subfolder` are what you feed to `LoadImage`).
- Response 200: `{"name": "<saved filename>", "subfolder": "<subfolder>", "type": "input", "asset": {...optional}}`. Use `name` (with `subfolder/` prefix if any) as the `LoadImage.inputs.image` value.
- Size limit: `--max-upload-size` MB (default 100).

### `GET /queue` / `POST /queue`
- GET → `{"queue_running": [[number, prompt_id, prompt, extra_data, outputs_to_execute], ...], "queue_pending": [...]}` (sensitive `extra_data` keys stripped).
- POST body `{"clear": true}` wipes pending; `{"delete": ["<prompt_id>", ...]}` removes specific pending items. Returns 200, empty body.

### `POST /interrupt`
Body optional `{"prompt_id": "<uuid>"}` to interrupt only if that prompt is the one running; empty body → interrupt whatever is running. 200 always.

### `POST /free`
`{"unload_models": true, "free_memory": true}` → frees VRAM. Useful "unload" button.

### `GET /object_info` and `GET /object_info/{NodeClass}` — node schema (build forms from this)
Per node class (server.py `node_info`):
```json
"KSampler": {
  "input": { "required": { "model": ["MODEL"], "seed": ["INT", {"default": 0, "min": 0, "max": 18446744073709551615, "control_after_generate": true}], "steps": ["INT", {"default": 20, "min": 1, "max": 10000}], "cfg": ["FLOAT", {"default": 8.0, "min": 0.0, "max": 100.0, "step": 0.1}], "sampler_name": [["euler", "euler_ancestral", "..."]], "scheduler": [["normal", "karras", "..."]], "denoise": ["FLOAT", {...}] }, "optional": {}, "hidden": {} },
  "input_order": { "required": ["model", "seed", "..."] },
  "output": ["LATENT"], "output_is_list": [false], "output_name": ["LATENT"],
  "name": "KSampler", "display_name": "KSampler", "description": "...", "python_module": "nodes", "category": "sampling",
  "output_node": false, "has_intermediate_output": false, "deprecated": false, "experimental": false, "api_node": false
}
```
- Widget spec: `[TYPE, options]` where TYPE is `"INT"|"FLOAT"|"STRING"|"BOOLEAN"|` or a **list of strings** for a combo (e.g. `ckpt_name: [["a.safetensors","b.safetensors"]]`). Options may include `default`, `min`, `max`, `step`, `round`, `multiline`, `tooltip`, `control_after_generate`.
- `GET /object_info` is large (MBs with many custom nodes); fetch it once per session and cache; prefer `GET /object_info/CheckpointLoaderSimple` etc. for specific lists. Newer "V3" nodes return the same V1 shape via `GET_NODE_INFO_V1()`.

### `GET /system_stats`
`{"system": {"os", "ram_total", "ram_free", "comfyui_version", "required_frontend_version", "python_version", "pytorch_version", "embedded_python", "argv"}, "devices": [{"name", "type", "index", "vram_total", "vram_free", "torch_vram_total", "torch_vram_free"}]}`. Good as the "connection test" call (cheap, GET, no preflight when no custom headers).

### `GET /features`, `GET /embeddings`, `GET /models`, `GET /models/{folder}`, `GET /extensions`
Feature flags / lists. `GET /models` → e.g. `["checkpoints","loras","vae","diffusion_models",...]`; `GET /models/checkpoints` → filenames.

### Jobs API (newer, 2026): `GET /api/jobs?status=pending,in_progress,completed,failed&limit=&offset=&sort_by=created_at|execution_duration&sort_order=`, `GET /api/jobs/{job_id}`, `POST /api/jobs/{job_id}/cancel`, `POST /api/jobs/cancel {"job_ids":[...]}`
Returns `{"jobs":[...], "pagination":{...}}`. Job ids are prompt ids. Optional nicety; `/history` remains the stable contract.

### WebSocket `GET /ws?clientId=<uuid>`
- Connect with the same `clientId` you send as `client_id` in `/prompt`; omitting it makes the server mint a `sid`. First message from server: `{"type":"status","data":{"status":{"exec_info":{"queue_remaining":N}},"sid":"<id>"}}`. Reconnecting with the same `clientId` replaces the old socket and, if you are the executing client, re-sends the current `executing` node.
- JSON message types (docs comms_messages.mdx + execution.py), all `{"type": ..., "data": {...}}`:
  - `status` — `{"status": {"exec_info": {"queue_remaining": N}}, "sid"?: "..."}` (broadcast to all clients on queue change)
  - `execution_start` — `{"prompt_id", "timestamp"}`
  - `execution_cached` — `{"prompt_id", "nodes": [ids], "timestamp"}`
  - `executing` — `{"node": "<id>" | null, "display_node", "prompt_id"}`; **`node: null` with your `prompt_id` means the prompt finished** (this is the completion signal used by the official example)
  - `progress` — `{"node", "prompt_id", "value", "max"}` (sampler steps)
  - `progress_state` — per-node aggregated progress (newer frontends)
  - `executed` — `{"node", "display_node", "prompt_id", "output": {<same shape as history outputs[node]>}}`; sent only for nodes that return `ui`
  - `execution_success` — `{"prompt_id", "timestamp"}`
  - `execution_error` — `{"prompt_id", "node_id", "node_type", "executed", "exception_message", "exception_type", "traceback", "current_inputs", "current_outputs", "timestamp"}`
  - `execution_interrupted` — `{"prompt_id", "node_id", "node_type", "executed"}`
  - `feature_flags` — reply to a client `{"type":"feature_flags","data":{...}}` first message
- **Binary frames** = live previews: 4-byte big-endian event type (1 = preview image, 3 = preview with metadata) + 4-byte image type (1 JPEG, 2 PNG) + bytes. Ignore unless you want live previews (`--preview-method auto` must be set on the server).
- Per-client routing: `executing/executed/progress/execution_*` go only to the socket whose id equals the prompt's `client_id`; `status` is broadcast. If you submit without `client_id` you only see `status`.
- **Recommendation for this browser app: submit with `client_id`, open `/ws` for progress if it connects, but drive completion by polling `GET /history/{prompt_id}` every ~1–2 s (non-empty → done; check `status.status_str`).** Reasons: (1) through Cloudflare Tunnel/Access the WS handshake carries cookies only if the browser has the `CF_Authorization` cookie for that hostname, and WS cannot send custom headers (so service-token auth is impossible on WS); (2) Cloudflare may drop idle/long WS (edge code releases); (3) history polling is trivially resumable after tab reload. Each poll is a simple GET (no preflight if no custom headers). The official docs likewise describe "WebSocket + History" as the recommended pattern and say `/history` is the source of truth for outputs.

## Input media
- Images/masks: upload as multipart to `/upload/image` / `/upload/mask` (≤ `--max-upload-size` MB, default 100), then reference by returned `name` in a `LoadImage` node (`inputs.image = "name.png"`; with subfolder: `"sub/name.png"`). There is no data-URI or URL input in core nodes; some custom nodes (e.g. "Load Image From URL") exist but cannot be assumed.
- Videos: upload via the same `/upload/image` endpoint (it accepts any file; `LoadVideo` lists `input/` files filtered by video content type) — `type=input`. VHS `VHS_LoadVideo` also reads from `input/`.
- CORS note: `multipart/form-data` is a CORS-safelisted content type, so `fetch(url, {method:'POST', body: formData})` with no custom headers is a *simple* request (no OPTIONS preflight) — convenient behind Access-protected hostnames (the cookie is sent with `credentials:'include'`). `application/json` POSTs to `/prompt` are **not** safelisted and always trigger a preflight.

## Output media
- Files on the user's disk under `output/` (or `temp/` for previews). Fetch with `GET /view?filename=&subfolder=&type=`; no expiry (until the user deletes). Content types: `image/png` (default SaveImage), `image/webp`, `image/jpeg`, `video/mp4`, `video/webm`, `video/x-matroska`, `image/gif`, `audio/flac|mpeg|ogg`.
- Browser fetch works when `--enable-cors-header` is set (plain GET). Through Cloudflare Tunnel the `/view` GET also passes the Cloudflare 100 MB *upload* limit trivially (it is a response), but responses > the Proxy Read Timeout are not an issue for static files.
- To show in `<img>/<video>` directly use the `/view` URL (same-PC case) or a blob URL (remote/Access case).

## Rate limits, quotas, free tier
- None (local). Queue is FIFO with priority `number`. VRAM is the only quota. Cloudflare free-plan limits when tunnelled: 100 MB max request body, 125 s Proxy Read Timeout (see `local-access.md` §b) — `/prompt` returns immediately so long generations are fine; only a single slow request (e.g. a huge `/view` of a multi-GB file, or `/object_info` on a pathological install) could hit it.

## Gotchas
- **Must export the workflow in API format**: `File → Export Workflow (API)` in the current frontend (older frontends: enable "Dev mode options" in settings, then `Save (API Format)`). Regular `Save` JSON (has `nodes[]`, `links[]`) is **not accepted** by `/prompt`. Node keys are numeric-string ids; `_meta.title` is ignored by the server. Doc: workflow-api-format.mdx.
- `--enable-cors-header` accepts **one** origin; multiple deployments (e.g. `https://www.thewoovee.com` and `http://localhost:5173` dev) need `*` or two ComfyUI instances. Document `*` + `credentials:'omit'` for dev.
- Default middleware 403s cross-site requests even for GET; the connection test must tell the user to add the flag, and detect 403 + missing `Access-Control-Allow-Origin` as "CORS not enabled".
- Desktop app: settings → Server-Config lets you set listen address/port and extra launch args (docs installation/desktop/usage/manage); the port is **8000**, not 8188. Extra args go into the instance's "launch args" (Manage panel). Portable: edit `run_nvidia_gpu.bat` → `.\python_embeded\python.exe -s ComfyUI\main.py --windows-standalone-build --enable-cors-header https://www.thewoovee.com` (docs installation/comfyui_portable_windows.mdx shows the `--listen` example). comfy-cli: `comfy launch -- --enable-cors-header https://www.thewoovee.com` or `comfy set-default <ws> --launch-extras="..."`.
- `--listen` is **not** needed for the localhost or Cloudflare Tunnel cases (cloudflared connects to 127.0.0.1). Do not tell users to `--listen 0.0.0.0` unless they want LAN access; if they do, the Host/Origin 403 check is skipped for non-loopback hosts but browsers will block `http://192.168.x.x` from an https page anyway (mixed content) — see `local-access.md`.
- Seeds: `control_after_generate` is a frontend-only feature; the API must send explicit `seed` values (randomize client-side).
- Identical prompts are cached: re-submitting the exact same graph re-uses outputs and `executed` messages may not fire; history still contains outputs. Change the seed to force re-run.
- `/history` for an unknown/in-flight id returns `{}` (200), not 404.
- Windows Portable `.7z` must be extracted with 7-Zip; the current builds ship Python 3.13 + CUDA 13.0 (`ComfyUI_windows_portable_nvidia.7z`), plus `_cu126` (Py 3.12) for 10-series and older GPUs, `_amd`, `_intel` (README + portable docs). ComfyUI-Manager is now a pip package bundled by the portable/desktop (`--enable-manager` flag exists in server.py; `comfy install` installs Manager unless `--skip-manager`); for older portables, run `scripts/install-manager-for-portable-version.bat` from the ComfyUI-Manager repo.
- comfy.org login in the frontend (used for API nodes and cloud) does not add auth to the local HTTP API; there is no "user login" for the server. `--multi-user` only namespaces `user/` storage by a `comfy-user` header (which our app cannot send without breaking preflight); ignore it.

## Adapter mapping notes
- **Connection settings UI**: base URL (default `http://127.0.0.1:8188`; presets: "same PC (8188)", "Desktop app (8000)", "my Cloudflare hostname"), optional Access mode (cookie / service token — service token only works through the app's Worker proxy, see `local-access.md`). Store per-device in localStorage.
- **Test**: `GET {base}/system_stats`. Interpret: network error + `http://127.0.0.1` from Safari → "Safari blocks localhost; use Chrome/Firefox or the tunnel"; 403 → "start ComfyUI with `--enable-cors-header https://www.thewoovee.com`"; Chrome LNA prompt → tell user to click Allow.
- **txt2img** → template graph: `CheckpointLoaderSimple(ckpt_name) → CLIPTextEncode×2 → EmptyLatentImage(width,height,batch_size) → KSampler(seed,steps,cfg,sampler_name,scheduler,denoise=1) → VAEDecode → SaveImage(filename_prefix="woovee")`. Combos from `/object_info/KSampler` (`sampler_name`, `scheduler`) and `/object_info/CheckpointLoaderSimple` (`ckpt_name`).
- **img2img** → add `LoadImage(image=<uploaded name>) → VAEEncode` replacing `EmptyLatentImage`, `denoise` = strength. **inpaint** → `LoadImage` (mask from alpha via `/upload/mask` or `LoadImageMask`) → `VAEEncodeForInpaint` or `SetLatentNoiseMask`.
- **upscale** → `LoadImage → UpscaleModelLoader(model_name) → ImageUpscaleWithModel → SaveImage`.
- **video** → ship one template per popular family only after checking `GET /object_info` for required node classes; surface "missing nodes" from `/prompt` 400 `node_errors` to the user.
- **Advanced**: "paste API-format JSON" mode with auto-detected editable widgets (all `inputs` values that are not `[node, idx]` links) — the generic ComfyUI power-user path.
- Flow: (optional uploads) → `POST /prompt` → poll `GET /history/{id}` (1–2 s; back off to 5 s after 60 s) and optionally show `/ws` progress → collect `images/gifs/audio` entries → `GET /view` → blob. Cancel: `POST /interrupt {"prompt_id"}` if running, `POST /queue {"delete":[id]}` if pending.
- Never route ComfyUI traffic through the Worker proxy by default (large files, user's private PC); only offer the Worker as an Access service-token relay if the user opts in.
