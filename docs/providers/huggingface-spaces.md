# Hugging Face Spaces (Gradio apps as a free/"page" backend)

- Website / docs: https://huggingface.co/docs/hub/spaces-api-endpoints ("Spaces as API endpoints") · https://www.gradio.app/guides/querying-gradio-apps-with-curl · https://www.gradio.app/guides/getting-started-with-the-js-client · `@gradio/client` README https://github.com/gradio-app/gradio/blob/main/client/js/README.md · ZeroGPU https://huggingface.co/docs/hub/spaces-zerogpu · embed/direct URL https://huggingface.co/docs/hub/spaces-embed · sleep https://huggingface.co/docs/hub/spaces-gpus#sleep-time · overview https://huggingface.co/docs/hub/spaces-overview · Hub API https://huggingface.co/docs/hub/api (OpenAPI at https://huggingface.co/.well-known/openapi.json)
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter). huggingface.co, *.hf.space and gradio.app are blocked by this sandbox's egress proxy, so everything was verified from the docs' sources on GitHub (`huggingface/hub-docs` @ main, `gradio-app/gradio` @ main: `guides/09_gradio-clients-and-lite/*.md`, `client/js/README.md`, `client/js/src/**`, `gradio/routes.py`, `gradio/route_utils.py`, `gradio/blocks.py`; `huggingface/huggingface.js` `packages/hub/src/types/api/api-space.ts`). Space presets come from third-party client code found via GitHub code search and must be re-checked against each Space's `/gradio_api/info`.
- Adapter id: `hf-spaces`  ·  Transport: `direct` (Gradio's CORS middleware echoes any Origin — see below; fall back to `proxy` only if a live preflight fails)  ·  Priority wave: 2

## Account and authentication
- No key required for public Spaces. Recommended: a Hugging Face **read** token (`hf_…`, https://huggingface.co/settings/tokens) — required for private Spaces, and for public/ZeroGPU Spaces it "gives better rate limits" and charges the user's own ZeroGPU quota instead of the anonymous per-IP pool (spaces-api-endpoints.md).
- Header on every request to the Space (POST and the GET stream, and file downloads): `Authorization: Bearer hf_…`.
- Gradio-level username/password apps (rare on the Hub): `POST {host}/login` form fields `username`, `password` → `{"success":true}` + cookie, send cookie on later calls (curl guide "Authentication"). Not needed for typical Spaces.
- Base URL: the Space's own subdomain `https://<space-subdomain>.hf.space` ("Your space is always served from the root of this subdomain"; subdomain = `owner-name` lowercased with `/` and `.`→`-`, e.g. `NimaBoscarino/hotdog-gradio` → `https://nimaboscarino-hotdog-gradio.hf.space`; but do not compute it — resolve it, see Endpoints §0). API prefix for Gradio ≥ 5: `/gradio_api` (`API_PREFIX` in routes.py); Gradio 4 exposed the same routes at the root (`/call/...`, as in the older curl guide). Regions: none.
- Visibility: public / protected (PRO+; code private, app reachable via embed URL) / private (app returns 404 without a token that can read it).

## Browser (CORS) behaviour
- Live test: `curl -X OPTIONS https://black-forest-labs-flux-1-schnell.hf.space/gradio_api/info -H "Origin: https://www.thewoovee.com" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type"` → `HTTP/1.1 403 Forbidden` **from the sandbox egress proxy**, so the origin's headers could not be observed (unknown by test).
- Code-verified (gradio/route_utils.py `CustomCORSMiddleware`, installed by default in routes.py): for any request carrying an `Origin`, `is_valid_origin()` returns true whenever the app's `Host` is **not** localhost/127.0.0.1/0.0.0.0 — i.e. on `*.hf.space` **every origin is allowed**. Preflight response: `200 OK`, `Access-Control-Allow-Origin: <request Origin>` (echoed, plus `Vary: Origin`), `Access-Control-Allow-Methods: DELETE, GET, HEAD, OPTIONS, PATCH, POST, PUT`, `Access-Control-Allow-Headers: <whatever was requested>`, `Access-Control-Allow-Credentials: true`, `Access-Control-Max-Age: 600`. Simple responses get the same `Allow-Origin` + `Allow-Credentials`. Caveats: (a) applies to Gradio ≥ 4 apps; a Space that mounts Gradio inside its own FastAPI with its own `CORSMiddleware` overrides this; (b) HF's front proxy (which returns the non-JSON 401 page for private Spaces) is not covered by this code — expected direct browser use is confirmed by the official `@gradio/client` being a browser package and by HF's own embed docs, so `direct` is the sensible default, but capture one real preflight before shipping.

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | Yes | any Gradio Space; presets: `black-forest-labs/FLUX.1-schnell`, `black-forest-labs/FLUX.1-dev` (`/infer`) |
| image→image / edit / inpaint | Yes | `black-forest-labs/FLUX.1-Kontext-Dev` (`/infer`), `Qwen/Qwen-Image-Edit-2511` and `linoyts/Qwen-Image-Edit-2511-Fast` (`/infer`); inpaint Spaces exist (e.g. `Gradio-Community/Text-guided-Flux-Inpainting`) — signature unverified |
| upscale | Yes (community Spaces) | no verified preset — unverified |
| text→video | Yes (community Spaces) | e.g. Wan 2.2 5B / LTX Spaces — signature unverified |
| image→video | Yes | `multimodalart/wan-2-2-first-last-frame` (`/generate_video`); `zerogpu-aoti/wan2-2-fp8da-aoti-faster` (I2V, signature unverified) |
| video→video / extend | Community only | e.g. `alexnasa/Wan2.2-Animate-ZEROGPU` — unverified |
| audio in video | Community only | Wan2.2-S2V Spaces — unverified |

## Models
"Model id" here = Space id. Signatures below were observed in third-party `gradio_client` code (GitHub code search, 2025–2026) — always confirm with `GET https://<host>/gradio_api/info` at ship time because Space authors change parameters freely.

| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| `black-forest-labs/FLUX.1-schnell` (host `black-forest-labs-flux-1-schnell.hf.space`) | text→image | `api_name="/infer"`; inputs in order: `prompt` (str), `seed` (int), `randomize_seed` (bool), `width` (int), `height` (int), `num_inference_steps` (int, 1–4) → returns `[image FileData, seed]` | ZeroGPU quota | free (ZeroGPU quota) |
| `black-forest-labs/FLUX.1-dev` | text→image | `/infer`; `prompt, seed, randomize_seed, width, height, guidance_scale (3.5), num_inference_steps (28)` → `[image, seed]` | ZeroGPU quota | free |
| `black-forest-labs/FLUX.1-Kontext-Dev` | image edit | `/infer`; `input_image` (FileData), `prompt`, `seed`, `randomize_seed`, `guidance_scale` (2.5), `steps` (28) → result tuple; observed code takes `result[0][1]` as the output path (first output is a before/after pair) | ZeroGPU quota | free |
| `Qwen/Qwen-Image-Edit-2511` and `linoyts/Qwen-Image-Edit-2511-Fast` | image edit (multi-ref) | `/infer`; `images=[{"image": FileData, "caption": null}, …]`, `prompt`, `seed`, `randomize_seed`, `true_guidance_scale` (4.0), `num_inference_steps` (40 / 8 for Fast), `height`, `width`, `rewrite_prompt` (bool) | ZeroGPU quota; ~3 refs | free |
| `multimodalart/wan-2-2-first-last-frame` | image→video (first+last frame) | `/generate_video`; `start_image_pil` (FileData), `end_image_pil` (FileData), `prompt` → `result[0]["video"]` (FileData) | ZeroGPU quota; duration/fps fixed by Space (unverified) | free |
| `Qwen/Qwen-Image` | text→image | recommended by HF docs; `api_name`/inputs unverified | ZeroGPU | free |

## Endpoints (exact)
### 0. Resolve a Space to its host and status (Hub API, GET)
- `GET https://huggingface.co/api/spaces/{owner}/{name}/host` → `{"host": "https://owner-name.hf.space", …}` — this is exactly what `@gradio/client` calls (`client/js/src/helpers/api_info.ts` `process_endpoint`, `HOST_URL = "host"`); pass `Authorization: Bearer hf_…` for private Spaces; 401/404 ⇒ not found / private.
- `GET https://huggingface.co/api/spaces/{owner}/{name}` → JSON with `id`, `subdomain`, `sdk` (`gradio`|`docker`|`static`), `private`, `runtime: {stage, hardware, …}` (`ApiSpaceInfo` in huggingface.js; also `?expand[]=runtime` etc.). `GET https://huggingface.co/api/spaces/by-subdomain/{subdomain}` resolves the other way. `GET /api/spaces/{id}/runtime` → `{hardware:{current:…}}`.
- `runtime.stage` values handled by the client (helpers/spaces.ts): `RUNNING`, `RUNNING_BUILDING` (usable), `BUILDING`, `APP_STARTING`, `SLEEPING`, `STOPPED` (poll again), `PAUSED` (author paused, cannot be used), and error stages `NO_APP_FILE`, `CONFIG_ERROR`, `BUILD_ERROR`, `RUNTIME_ERROR`.
- Semantic search for Spaces: `GET https://huggingface.co/api/spaces/semantic-search?q=text+to+image&sdk=gradio`.
- Restart (owner only): `POST https://huggingface.co/api/spaces/{id}/restart` (huggingface_hub `restart_space`; factory-reboot flag exists in the SDK, query name unverified).

### 1. Introspection
- `GET https://<host>/gradio_api/info` (add `?all_endpoints=true` for unnamed ones) → `{"named_endpoints": {"/infer": {"parameters": [{"label", "parameter_name", "parameter_has_default", "parameter_default", "type", "python_type": {"type","description"}, "component", "example_input"}], "returns": [{"label","type","python_type","component"}], "code_snippets": {...}}}, "unnamed_endpoints": {...}}` (blocks.py `get_api_info`).
- `GET https://<host>/gradio_api/openapi.json` — OpenAPI 3.0.2 generated from the same info (spaces-api-endpoints.md).
- `GET https://<host>/config` — app config (`space_id`, `api_prefix`, `dependencies`, `max_file_size`, …); the JS client fetches this first.

### 2. Submit a job (POST, async, queue)
- `POST https://<host>/gradio_api/call/{api_name}` (api_name without the leading slash, e.g. `/gradio_api/call/infer`), `Content-Type: application/json`, body `{"data": [<one positional value per input component>], "session_hash": "<optional, reuse to share state>"}` → `200 {"event_id": "abc123"}`.
- Errors (routes.py `queue_join_helper`): `503` queue full, `422` validator error, `400` other input errors; private Space without token → `401` (HTML page from HF proxy).
- File inputs: a dict `{"path": "https://public.url/img.png"}` (URL) or `{"path": "<server path returned by /gradio_api/upload>", "meta": {"_type": "gradio.FileData"}}` (curl guide "Files"; openapi summary text in routes.py). Multi-image components take a list of such dicts, e.g. Qwen-Edit's `images` = `[{"image": {...FileData}, "caption": null}]`.

### 3. Read the result (GET, Server-Sent Events)
- `GET https://<host>/gradio_api/call/{api_name}/{event_id}` (use `Accept: text/event-stream`; keep the connection open). Events: `event: generating` (intermediate), `event: complete` (final), `event: error` (failed; `data` holds the message), `event: heartbeat` (every 15 s). `data:` is a JSON array, one element per output component, e.g. `[{"path": "/tmp/gradio/…/image.webp", "url": "https://<host>/gradio_api/file=/tmp/gradio/…/image.webp", "size": null, "orig_name": "image.webp", "mime_type": null, "is_stream": false, "meta": {"_type": "gradio.FileData"}}, 12345]`.
- Results live in an LRU cache of 2,000 entries per app; fetch promptly.
- Cancel: `POST https://<host>/gradio_api/cancel` body `{"session_hash": "...", "fn_index": <int>, "event_id": "..."}` → `{"success": true}` (routes.py `cancel_event`; only queued jobs are really cancelled — JS guide "Cancelling Jobs"). Webhooks: none.
- Recommended polling: none needed (SSE); if the SSE connection drops, re-GET the same URL (cache is LRU).
- Low-level queue protocol used by the JS client: `POST /gradio_api/queue/join` (requires `session_hash`, `fn_index`, `data`, optional `trigger_id`) then `GET /gradio_api/queue/data?session_hash=…` SSE. Prefer the `/call` API for raw HTTP.

### 4. Upload input files
- `POST https://<host>/gradio_api/upload` (optional `?upload_id=`), `multipart/form-data` with one or more `files` fields → JSON array of server paths, e.g. `["/tmp/gradio/<hash>/photo.png"]`; `413` if a file exceeds the app's `max_file_size`, `400` on malformed multipart. Reference the returned path as `{"path": "...", "meta": {"_type": "gradio.FileData"}}`; the client also sets `url` = `https://<host>/gradio_api/file=<url-encoded path>` (client/js/src/upload.ts). Upload progress: `GET /gradio_api/upload_progress?upload_id=`.

### 5. Download outputs
- `GET https://<host>/gradio_api/file=<path>` (HEAD also allowed) — same `Authorization` header for private Spaces. Files are temporary (see Output media).

### 6. `@gradio/client` (browser)
- npm `@gradio/client` (current 2.5.1); ESM CDN `https://cdn.jsdelivr.net/npm/@gradio/client/dist/index.min.js` — hard-code a version in production. This host is on our artifact CSP allowlist (cdn.jsdelivr.net/npm/).
- `const app = await Client.connect("owner/space" | "https://owner-space.hf.space", { token: "hf_…", status_callback, events: ["data","status"], auth: [user, pass], headers: {...} })` — `hf_token` is a deprecated alias for `token` (init_helpers.ts). With a Space id it calls the Hub `/host` endpoint, then `/config`, then (if `token`) `https://huggingface.co/api/spaces/{id}/jwt` and appends `__sign=<jwt>` to heartbeat/queue URLs. If the Space is sleeping/building it polls `GET /api/spaces/{id}` every 5 s up to 12 times and reports `status: "sleeping" | "building" | "running" | "paused" | "space_error"` via `status_callback`.
- `await app.predict("/infer", [prompt, 0, true, 1024, 1024, 4])` or object form keyed by `parameter_name`; `app.submit(...)` returns an async iterable with `{type:"data", data}` and `{type:"status", stage: "pending"|"generating"|"complete"|"error", position, size, eta, progress_data}` plus `.cancel()`; `app.view_api()`; `handle_file(File|Blob|URL)` (uploads Blobs at predict time); `Client.duplicate("owner/space", {token, private, hardware, timeout})` creates/uses a personal copy (paid hardware billed to the token owner; auto-sleep default 5 min).

## Input media
- Browser: upload `File`/`Blob` via `/gradio_api/upload` (or `handle_file`) then reference by server path; or pass a public `https://` URL (`{"path": url}`) — the Space downloads it. Max size = the Space's `max_file_size` (from `/config`; default unlimited). Base64 data-URIs are **not** the documented input format (some Spaces accept them in `url`, unverified).
- Videos/masks: same FileData mechanism; ImageEditor components expect `{"background": FileData, "layers": [FileData], "composite": FileData}` (unverified per Space).

## Output media
- FileData with `url` = `https://<host>/gradio_api/file=/tmp/gradio/<hash>/<name>` (curl guide shows an older `/c/file=` form too). Served by the Space itself: temporary directory, cleaned by Gradio's `delete_files_on_schedule` (`delete_cache` setting) and lost on restart/sleep — **download immediately**. Content types: image/webp or png, video/mp4 depending on the Space. Browser fetch: same CORS middleware applies (echoed Origin), and the `/file=` route requires the same `Authorization` for private Spaces; a plain `<img src>` works for public Spaces.

## Rate limits, quotas, free tier
- Spaces themselves: free to call; "you may get rate limited by Hugging Face if you make too many requests" to public Spaces (no numbers published). Duplicate the Space for unlimited use (paid hardware).
- ZeroGPU daily GPU quota (spaces-zerogpu.md): Unauthenticated **2 min** (per IP), Free account **5 min**, PRO **40 min**, Team member **40 min**, Enterprise member **60 min**; resets 24 h after first GPU use; remaining quota also drives queue priority. PRO/Team/Enterprise can exceed quota at **$1 per 10 GPU-minutes** of pre-paid credits. Quota is attributed to the account whose `hf_` token is in `Authorization`; Space-to-Space calls forward the caller's `x-ip-token` header. `xlarge` GPU functions cost 2× quota. Default max function runtime 60 s (Space authors can raise `duration`).
- Hosting: free personal accounts (email verified, >30 days old) may host up to 2 ZeroGPU Spaces; Gradio/Docker Spaces on other hardware require PRO/Team/Enterprise; PRO up to 10 ZeroGPU Spaces.
- Sleep: `cpu-basic` Spaces sleep after 48 h without traffic; upgraded hardware never sleeps unless a custom sleep time is set; visiting the Space (any request to `*.hf.space`) restarts it — cold starts can take minutes (model download), no published SLA. Authors can pause a Space (`PAUSED`).
- Hub API calls (`huggingface.co/api/*`, used for resolution/status) count against Hub rate limits: anon 500 / free 1,000 / PRO 2,500 per 5-minute window (rate-limits.md).

## Gotchas
- Anonymous ZeroGPU quota is per **IP**: if we route Space calls through our Cloudflare Worker, every user shares one 2-minute pool. Space calls must go browser→`*.hf.space` directly with the user's own `hf_` token so their 5/40-minute quota applies.
- ZeroGPU quota exhaustion/aborts surface as `event: error` with messages containing "quota", "GPU duration", or "GPU task aborted"; retrying soon does not help (observed in third-party code) — offer a fallback provider.
- Space API contracts are unversioned; `api_name`, parameter order and names change with any commit. Fetch `/gradio_api/info` at runtime and map by `parameter_name`; treat presets as hints.
- Queue position and ETA are only visible via the JS client's `status` events (queue protocol), not via the simple `/call` SSE; consider the JS client for UX.
- `/call` positional `data` must include a value for **every** input, including hidden/default ones (`parameter_has_default`); missing values → 422.
- Private Space 401 responses are HTML from the HF proxy (not JSON) — detect by status.
- Sleeping Spaces: the first request may hang or fail for minutes; poll `runtime.stage` via the Hub API and only submit when `RUNNING`/`RUNNING_BUILDING`.
- Output files vanish after restart or cache cleanup; never persist `file=` URLs.
- Gradio 3.x Spaces use WebSockets and are not supported by `@gradio/client` ≥ 1 nor by `/call`.
- Docker/Streamlit Spaces have no Gradio API; filter by `sdk=gradio` when discovering.

## Adapter mapping notes
- Model = Space id + `api_name` + an ordered parameter map derived from `/gradio_api/info` (cache per Space). Ship presets for the 5 Spaces above but validate/auto-heal against live `info` (match by `parameter_name`; fall back to `label`).
- text→image: `prompt→prompt`, `seed→seed` + `randomize_seed=false` when the user fixes a seed, `width/height` pass-through (Spaces use multiples of 16/32; clamp to the component's `minimum/maximum` from `info`), `steps→num_inference_steps` (schnell max 4), `cfg→guidance_scale`.
- image→image/edit: upload via `/gradio_api/upload` then pass FileData; Qwen-Edit takes a gallery list (multi-reference UI), Kontext takes `input_image`.
- image→video: `start_image_pil`/`end_image_pil` FileData + prompt; result `video.url` (mp4) — download through the browser directly (CORS ok), store ourselves.
- Job flow: POST `/call` → keep SSE open (heartbeat 15 s) → parse `complete` → fetch `url`. Show "Space sleeping / building / queue" states from the Hub API + status events. Add an "HF token" field (read scope) even though it is optional, with a note about ZeroGPU quota.
- Transport `direct`; the Worker is only needed for optional server-side caching of outputs.
