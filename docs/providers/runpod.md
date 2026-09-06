# RunPod (Serverless endpoints, Public Endpoints, Pods)

- Website / docs: https://docs.runpod.io/serverless/endpoints/send-requests · https://docs.runpod.io/serverless/endpoints/operation-reference · https://docs.runpod.io/serverless/endpoints/endpoint-configurations · https://docs.runpod.io/serverless/endpoints/job-states · https://docs.runpod.io/serverless/workers/handler-functions · https://docs.runpod.io/serverless/pricing · https://docs.runpod.io/pods/configuration/expose-ports · https://docs.runpod.io/pods/pricing · https://docs.runpod.io/public-endpoints/overview , /public-endpoints/requests , /public-endpoints/reference , /public-endpoints/models/flux-dev , /public-endpoints/models/flux-kontext-dev · https://docs.runpod.io/hub/overview · https://docs.runpod.io/get-started/api-keys · workers: https://github.com/runpod-workers/worker-comfyui , https://github.com/runpod-workers/worker-a1111 , https://github.com/runpod-workers/worker-sdxl , https://github.com/runpod-workers/worker-vllm-omni
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter). docs.runpod.io, www.runpod.io and api.runpod.ai are blocked by this sandbox's egress proxy; all doc statements were verified from the docs' source repo `runpod/docs` @ main (the `.mdx` files behind each URL above) and the worker READMEs on GitHub. Nothing was tested live against api.runpod.ai.
- Adapter id: `runpod`  ·  Transport: `proxy` (CORS unknown; community code always fronts api.runpod.ai with a server-side proxy)  ·  Priority wave: 2

## Account and authentication
- Key: RunPod console → Settings → **API Keys** → Create (https://www.console.runpod.io/user/settings). Permission levels **All**, **Restricted** (per-API and per-Serverless-endpoint: None / Read-Write / Read-Only), **Read Only**. Key is shown once. No free credits documented (account needs a balance; Pods need ≥ 1 h of credit to start).
- Auth header: `Authorization: Bearer <RUNPOD_API_KEY>` (public-endpoints docs and send-requests.mdx). The operation reference shows the bare form `authorization: <RUNPOD_API_KEY>` (no `Bearer`) — both are used in official docs; use `Bearer`.
- Base URLs:
  - Serverless queue API: `https://api.runpod.ai/v2/{ENDPOINT_ID}/...`
  - Public Endpoints (RunPod-hosted models, no deploy): same shape with a model slug as the id, e.g. `https://api.runpod.ai/v2/black-forest-labs-flux-1-dev/runsync`
  - OpenAI-compatible (vLLM-type workers): `https://api.runpod.ai/v2/{ENDPOINT_ID}/openai/v1`
  - Pod HTTP proxy: `https://{POD_ID}-{INTERNAL_PORT}.proxy.runpod.net`
  - Management REST API v2 (create endpoints/pods): `https://rest.runpod.io/v1` (docs section `api-reference-v2`, not detailed here)
- Regions: endpoints are global; you can restrict data centers in endpoint settings (reduces GPU pool).

## Browser (CORS) behaviour
- Result: **unknown**. `curl -X OPTIONS https://api.runpod.ai/v2/xxxx/run -H "Origin: https://www.thewoovee.com" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type"` → `HTTP/1.1 403 Forbidden` from the sandbox egress proxy (CONNECT denied), so no `Access-Control-Allow-Origin` could be observed. RunPod docs never mention CORS (GitHub search of `runpod/docs` for "CORS": 0 hits). Community browser apps consistently put a Cloudflare Worker/Vite proxy in front of `api.runpod.ai` (multiple hits for `api.runpod.ai` + `Access-Control-Allow-Origin` in proxy code), which suggests the API does not send permissive CORS headers — treat as `proxy`.
- Pod proxy URLs (`*.proxy.runpod.net`): CORS is whatever the app inside the Pod sends (e.g. ComfyUI needs `--enable-cors-header`); RunPod's proxy adds nothing documented.

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | Yes | Public Endpoints `black-forest-labs-flux-1-dev`, `black-forest-labs-flux-1-schnell`, Qwen Image, Seedream 4, Z-Image Turbo, WAN 2.6 T2I; own endpoints via worker-comfyui (`flux1-dev`, `flux1-schnell`, `sdxl`, `sd3` images), worker-sdxl, worker-a1111, worker-vllm-omni |
| image→image / edit / inpaint | Yes | Public `black-forest-labs-flux-1-kontext-dev`, Qwen Image Edit / 2511, Nano Banana Edit, P-Image Edit, Seedream 4 Edit; ComfyUI workflows (any); worker-sdxl `image_url` (refiner img2img); A1111 only `txt2img` |
| upscale | Yes (ComfyUI) | worker-comfyui with an upscale workflow — no public endpoint |
| text→video | Yes | Public WAN 2.6 T2V, WAN 2.2 T2V (LoRA), Vidu Q3 T2V, Pruna Video; ComfyUI Wan workflows; worker-vllm-omni (`Wan-AI/Wan2.2-TI2V-5B-Diffusers`) |
| image→video | Yes | Public WAN 2.1/2.2/2.5/2.6 I2V, Kling v2.1, Seedance 1.5 Pro, SORA 2 (I2V), Vidu Q3 I2V; ComfyUI |
| video→video / extend | Partial | Public Kling v2.6 Motion Control (motion transfer), InfiniteTalk (audio-driven); ComfyUI |
| audio in video | Yes | Public WAN 2.6 I2V ("audio support"), SORA 2 ("video and audio"), Vidu Q3 T2V |

## Models
Serverless pricing is per GPU-second regardless of model (table in "Rate limits, quotas, free tier"). Public Endpoint prices from public-endpoints/reference.mdx and model pages; endpoint slugs marked (slug unverified) were not read from a model page.

| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| Public `black-forest-labs-flux-1-dev` | text→image | `input.prompt`*, `negative_prompt`, `width` (1024), `height` (1024), `num_inference_steps` (28), `guidance` (7.5), `seed` (-1 = random), `image_format` (jpeg) | output URL expires 7 days | $0.02 / megapixel (1024² ≈ $0.021) |
| Public `black-forest-labs-flux-1-schnell` | text→image | `prompt`, `width`, `height` (+ same family of params, page not read) | 7-day URL | $0.0024 / MP (1024² ≈ $0.0025) |
| Public `black-forest-labs-flux-1-kontext-dev` | image edit | `prompt`*, `image`* (URL), `negative_prompt`, `size` "1024*1024", `num_inference_steps` (28, 1–50), `guidance` (2, 0–10), `seed` (-1), `output_format` png\|jpeg, `enable_safety_checker` (true) | 7-day URL | $0.025 / image |
| Public Qwen Image / Qwen Image Edit / Edit 2511 (+LoRA) (slugs unverified, e.g. `qwen-image`) | t2i / edit | see model pages | 7-day URL | $0.02 / image ($0.025 LoRA) |
| Public Seedream 4.0 T2I / Edit; Z-Image Turbo; P-Image T2I / Edit; WAN 2.6 T2I; Nano Banana Edit / Pro / 2 | t2i / edit | see model pages | 7-day URL | $0.027; $0.005; $0.005/$0.01; $0.03; $0.038 / $0.14–0.24 / $0.0875–0.175 per image |
| Public WAN 2.2 I2V (720p) / WAN 2.2 I2V LoRA / WAN 2.1 I2V (slugs unverified) | image→video | 5 s (8 s LoRA) @ 720p | 7-day URL | $0.30 / 5 s; $0.35 / 5 s, $0.56 / 8 s; $0.30 / 5 s |
| Public WAN 2.5 / WAN 2.6 T2V / WAN 2.6 I2V | video | 480p/720p/1080p, 5–10 s | 7-day URL | from $0.25/5 s; $0.50/5 s (480p) – $2.25/10 s (720p); $0.10/s (720p) – $0.15/s (1080p) |
| Public Kling v2.1 I2V Pro / Kling v2.6 Motion Control / Kling O1 R2V | video | 5 s / 10 s | 7-day URL | $0.45/5 s, $0.90/10 s; $0.21/3 s, $0.63/10 s; $0.112/s |
| Public Seedance 1.5 Pro I2V; SORA 2 I2V; SORA 2 Pro; Vidu Q3 T2V/I2V; Pruna Video; InfiniteTalk | video | 4/8/12 s (SORA) | 7-day URL | $0.024–0.052/s; $0.40/$0.80/$1.20; from $1.20; $0.15/s; $0.02/s (720p) $0.04/s (1080p); $0.25 (480p) $0.50 (720p) |
| Self-hosted `runpod/worker-comfyui:<ver>-flux1-dev` / `-flux1-schnell` / `-sdxl` / `-sd3` / `-base` | any ComfyUI workflow | whatever the workflow JSON defines | 10 MB `/run`, 20 MB `/runsync` payloads (base64 outputs count) | GPU-seconds (e.g. 48 GB A6000/A40 $0.00034/s) |
| Self-hosted `runpod-workers/worker-sdxl` | t2i / img2img | `prompt`, `negative_prompt`, `width`/`height` (1024), `seed`, `scheduler` (PNDM,KLMS,DDIM,K_EULER,DPMSolverMultistep), `num_inference_steps` (25), `refiner_inference_steps` (50), `guidance_scale` (7.5), `strength` (0.3), `image_url`, `num_images` (1–2), `high_noise_frac` | output base64 data URIs | GPU-seconds |
| Self-hosted `runpod-workers/worker-a1111` (Deliberate v6) | t2i only | any `/sdapi/v1/txt2img` field: `prompt`, `negative_prompt`, `steps`, `cfg_scale`, `width`, `height`, `sampler_name`, `seed`, `batch_size`, `styles`, `override_settings` | output shape not in README (A1111 returns `{images:[base64], parameters, info}`) — unverified | GPU-seconds |
| Self-hosted `runpod-workers/worker-vllm-omni` (`MODEL_NAME` = HF repo, e.g. `Tongyi-MAI/Z-Image-Turbo`, `Wan-AI/Wan2.2-TI2V-5B-Diffusers`, `Qwen/Qwen-Image-Edit-2511`) | t2i / t2v / i2v / edit | OpenAI-style `prompt`, `size` "1024x1024" / "1280x704", `seed`, `seconds`, `fps`, `num_inference_steps`, `guidance_scale`, `image_b64` | README says "Scaffold — builds untested in CI" | GPU-seconds |

## Endpoints (exact)
All under `https://api.runpod.ai/v2/{ENDPOINT_ID}`; JSON in/out; header `Authorization: Bearer …`.

- `POST /runsync` — synchronous. Body `{"input": {...}, "webhook"?: "https://…", "policy"?: {...}, "s3Config"?: {...}}`. Waits **90 s by default**, adjustable `?wait=<ms>` in **1000–300000**. Max payload **20 MB**. Result retained **1 minute** (up to 5 min with `?wait`). Response: `{"id": "sync-<uuid>-u1", "status": "COMPLETED", "output": <handler return>, "delayTime": 824, "executionTime": 3391, "workerId": "…"}`. If the job is not done within `wait`, the docs do not spell out the body — expect `{"id", "status": "IN_QUEUE"|"IN_PROGRESS"}` and fall back to `/status` (unverified).
- `POST /run` — asynchronous. Same body. Max payload **10 MB**. Immediate response `{"id": "<uuid>", "status": "IN_QUEUE"}`. Result retained **30 minutes** after completion.
- `GET /status/{JOB_ID}` — `{"id", "status", "output"?, "error"?, "delayTime", "executionTime", "workerId"?}`; optional `?ttl=<ms>` to set the job TTL. Progress updates sent by the handler (`runpod.serverless.progress_update`) also appear here (field name not documented — unverified, commonly `output`).
- `GET /stream/{JOB_ID}` — incremental results for generator handlers; array of `{"output": …, "metrics"?: …}` chunks; single chunk ≤ **1 MB**.
- `POST /cancel/{JOB_ID}` → `{"id": "...", "status": "CANCELLED"}` (works for queued and in-progress jobs).
- `POST /retry/{JOB_ID}` — only for `FAILED`/`TIMED_OUT` jobs whose result has not expired → `{"id", "status": "IN_QUEUE"}`.
- `POST /purge-queue` → `{"removed": 2, "status": "completed"}` (queued jobs only).
- `GET /health` → `{"jobs": {"completed", "failed", "inProgress", "inQueue", "retried"}, "workers": {"idle", "running"}}`.
- `GET /requests` (listed only in the rate-limit table; 10 req / 10 s) — undocumented otherwise.
- OpenAI-compatible: `POST /openai/v1/chat/completions` etc. for vLLM workers; worker-vllm-omni maps `/openai/v1/images/generations` onto `{"input": {"openai_route": "/v1/images/generations", "openai_input": {...}}}`.
- Job status values (job-states.mdx): `IN_QUEUE`, `IN_PROGRESS`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`, `TIMED_OUT`. (`RUNNING` is listed but `/status` docs only show `IN_QUEUE|IN_PROGRESS|COMPLETED|FAILED`.) Python SDK sample also checks a legacy `"ERROR"` string.
- Request options: `policy.executionTimeout` ms (default 600000 = 10 min; 5 s–7 days; per-job override of the endpoint setting), `policy.ttl` ms (default 86400000 = 24 h; 10 s–7 days; hard delete → `/status` 404 even mid-run), `policy.lowPriority` (no scale-up); `webhook` URL receives a POST when the job completes (must answer 200; 2 retries, 10 s apart; **payload shape not documented — unverified**, assume the same JSON as `/status`); `s3Config: {accessId, accessSecret, bucketName, endpointUrl}` passed to the worker (worker must implement upload).
- Recommended polling: every 2 s on `/status` (official public-endpoint samples use `time.sleep(2)`); `/status` limit is 2000 req / 10 s per endpoint.
- Rate limits per endpoint (send-requests.mdx): `/runsync` 2000 req/10 s (400 concurrent), `/run` 1000/10 s (200), `/status` & `/stream` 2000/10 s (400), `/cancel` 100/10 s (20), `/purge-queue` 2/10 s, `/openai/*` 2000/10 s (400), `/requests` 10/10 s (2); scales up with `running_workers × requests_per_worker`; `429` on excess.
- HTTP errors: 400 bad request, 401 bad key, 404 wrong endpoint id (or expired/TTL-deleted job), 429, 500 worker crash.

### Official worker input/output schemas
- **worker-comfyui** (README, ≥ 5.0.0): request `{"input": {"workflow": <ComfyUI "Export (API)" JSON>, "images"?: [{"name": "input_image_1.png", "image": "<base64 or data:image/png;base64,…>"}], "comfy_org_api_key"?: "…"}}`; `images[].name` must be unique and is the filename a `LoadImage` node references. Response `output: {"images": [{"filename": "ComfyUI_00001_.png", "type": "base64"|"s3_url", "data": "<base64>|<presigned S3 URL>"}], "errors"?: [..]}`. S3 mode is enabled by endpoint env vars `BUCKET_ENDPOINT_URL`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY` (upload via `rp_upload.upload_image`, key `<job_id>/<filename>`). Other env: `REFRESH_WORKER`, `COMFY_ORG_API_KEY`, `COMFY_LOG_LEVEL`, `WEBSOCKET_RECONNECT_ATTEMPTS` (5), `WEBSOCKET_RECONNECT_DELAY_S` (3), `PUBLIC_KEY` (SSH). Video outputs (Wan workflows) are not covered by the README's "images" contract — unverified (custom nodes usually save mp4 to output; check the worker version).
- **worker-a1111**: `{"input": {<txt2img params>}}`; exposes only `txt2img`; bundled model Deliberate v6.
- **worker-sdxl**: params above; output `{"image_url": "data:image/png;base64,…", "images": ["data:image/png;base64,…"], "seed": 42}`.
- **worker-vllm-omni**: three input styles — `{"input": {"openai_route": "/v1/images/generations", "openai_input": {"prompt", "size"}}}`, generic proxy `{"input": {"route": "/v1/videos/vid_abc", "method": "GET"}}`, or shorthand `{"input": {"task"?: "image"|"video"|"video_async"|"image_edit"|…, "prompt", "size", "seed", "seconds", "fps", "image_b64"}}`. Output: OpenAI JSON `data[0].b64_json` + `metrics`; binary video `{"data_b64", "content_type", "size_bytes"}`.

### RunPod Hub / Quick Deploy
- Hub (https://console.runpod.io/hub): pick a repo → **Deploy → Create Endpoint** (Serverless) or **Deploy → Pod**. Repos are GitHub releases with `.runpod/hub.json` + `tests.json`. The official image/video workers there: `runpod-workers/worker-comfyui` (badge links to `console/hub/runpod-workers/worker-comfyui`), `worker-a1111`, `worker-sdxl`, `worker-vllm-omni`; the org also lists `worker-vllm`, `worker-faster_whisper`, `worker-ollama`. A full Hub catalogue (community Flux/Wan templates) could not be fetched (console blocked) — unverified.
- Pod deploy of a Hub worker exposes the worker's local API through the proxy: `POST https://{POD_ID}-80.proxy.runpod.net/v2/LOCAL/run` with `Authorization: Bearer <key>` (hub/overview.mdx sample).
- Public Endpoints tab of the Hub (`?tabSelected=public_endpoints`) has a playground that generates `/run` and `/runsync` code.

### Pods HTTP proxy
- URL `https://[POD_ID]-[INTERNAL_PORT].proxy.runpod.net` (e.g. `https://abc123xyz-4000.proxy.runpod.net`), up to 10 HTTP ports per Pod, HTTPS only, path `User → Cloudflare → RunPod LB → Pod`. **No RunPod authentication** on the proxy — "Your service becomes publicly accessible … implement proper authentication in your application". Cloudflare **100-second** timeout → `524` for slow responses; design long jobs as submit + poll. WebSockets: docs recommend TCP exposure instead. A "Running" Pod may not be ready yet; services bind to `0.0.0.0`.

## Input media
- Serverless: no upload API — inputs are JSON. Official workers take base64 (ComfyUI `images[].image`, vllm-omni `image_b64`) or URLs (sdxl `image_url`, public endpoints `image` URL). Whole request ≤ **10 MB** (`/run`) / **20 MB** (`/runsync`) including base64, so images > ~7 MB need a public URL or your own S3.
- Public Endpoints (Kontext, I2V models): input image as a **URL** (`input.image`), so the app must host user uploads somewhere fetchable.

## Output media
- Public Endpoints: `output.image_url` / `video_url` / `audio_url` on `https://image.runpod.ai/...`, **expire after 7 days**; `output.cost` in USD. Browser fetchability (CORS) of image.runpod.ai: unverified.
- worker-comfyui: base64 in JSON by default (subject to the 10/20 MB response limits — "If your results exceed these limits, consider stashing them in cloud storage and returning links"), or presigned S3 URLs when bucket env vars are set (expiry = your bucket's presign settings).
- worker-sdxl / a1111: base64 data URIs.
- Results are deleted 30 min (`/run`) or 1 min (`/runsync`) after completion — fetch and persist immediately.

## Rate limits, quotas, free tier
- No free tier; prepaid balance; default spend limit **$80/hour** across all resources.
- Serverless GPU price per second (snippets/serverless-gpu-pricing-table.mdx; flex workers, billed from worker start to stop, rounded up to the second): 16 GB (A4000/A4500/RTX 4000) **$0.00016**; 24 GB (L4/A5000/3090) **$0.00019**; 24 GB 4090 PRO **$0.00031**; 48 GB (A6000/A40) **$0.00034**; 48 GB (L40/L40S/6000 Ada PRO) **$0.00053**; 80 GB A100 **$0.00076**; 80 GB H100 PRO **$0.00116**; 96 GB 6000s PRO **$0.00111**; 141 GB H200 PRO **$0.00155**; 180 GB B200 **$0.00240**. Active (always-on) workers: discounted via sales. Storage: container disk ~$0.10/GB/mo, network volume $0.07/GB/mo (<1 TB) / $0.05 (>1 TB).
- Pods: billed per second; on-demand hourly GPU prices are only shown in the console at deploy time (not in docs — unverified); savings plans 3/6 months; container/volume disk $0.10/GB/mo running ($0.20 volume when stopped).
- Endpoint defaults: max workers 3, active workers 0, idle timeout 5 s, execution timeout 600 s, job TTL 24 h, FlashBoot on, queue-delay autoscaling (4 s). Idle endpoints are auto-scaled down: after **3 days** without requests max workers → 2, after **7 days** → **0** (endpoint stops working until you raise it in the console).
- Public Endpoints: usage-based per output; failed generations are not charged.

## Gotchas
- Two different auth header spellings in official docs; send `Authorization: Bearer <key>` (documented for public endpoints) — bare key also documented.
- `/runsync` blocks up to 90 s by default and its result is kept only 1 minute; for image generation on a cold endpoint (cold start + model load can exceed 90 s) prefer `/run` + `/status`.
- Payload caps (10/20 MB) apply to **responses** too: a 4-image base64 SDXL batch or any video will blow through `/run`'s 10 MB — configure S3 output (worker-comfyui bucket env vars or `s3Config`).
- TTL is a hard kill: a job still running when `ttl` elapses is deleted and `/status` returns 404.
- Idle endpoints silently drop to max workers 0 after 7 days — surface "endpoint has no workers" from `/health` (`workers.running == 0 && jobs.inQueue > 0`).
- Job `id` for sync jobs is prefixed `sync-`; ids often carry a `-u1`/`-e1` suffix — treat as opaque.
- ComfyUI workflows must be the **API export** (`Workflow > Export (API)`), not the UI JSON; node ids are strings; prompts live inside node inputs, so the adapter needs per-template JSON-path mappings.
- Public Endpoint output URLs expire in 7 days; Serverless results in 30 min.
- Pod proxy: 100 s Cloudflare limit and no auth — never point the browser at a raw ComfyUI Pod without an auth layer.
- Legacy API keys (pre-2024-11-11) have full "AI API" access regardless of GraphQL scope; new keys should be Restricted per endpoint.

## Adapter mapping notes
- Three sub-modes behind one adapter: (1) **Public Endpoints** (zero setup, fixed schemas per slug — ship presets for flux-1-dev, flux-1-schnell, flux-1-kontext-dev, and the WAN I2V/T2V slugs once verified); (2) **Own Serverless endpoint** (user pastes `ENDPOINT_ID` + picks a worker schema: comfyui / sdxl / a1111 / vllm-omni / custom JSON template); (3) **Pod proxy URL** (user pastes `https://{pod}-{port}.proxy.runpod.net`; forwarded through our Worker, 100 s limit → only for short jobs).
- text→image: public flux: `prompt, negative_prompt, width, height, num_inference_steps, guidance, seed, image_format`; sdxl: `guidance_scale`, `scheduler`, `num_images` ≤ 2; comfyui: template workflow JSON with `{{prompt}}`, `{{seed}}`, `{{width}}`, `{{height}}`, `{{steps}}`, `{{cfg}}` substitutions; vllm-omni: OpenAI `size: "WxH"`.
- image→image/edit: kontext `size: "W*H"` (asterisk!) + `image` URL → we must upload the user's image to a public URL first (our own storage) — special UI/flow; comfyui: `input.images[]` base64 + `LoadImage` node name.
- text→video / image→video: public WAN/Kling slugs (poll `/status` every 2 s; typical 1–5 min); comfyui Wan templates need S3 output configured — show a setup checklist.
- Job flow: `POST /run` → poll `GET /status/{id}` (2 s, backoff to 5 s) → terminal `COMPLETED|FAILED|CANCELLED|TIMED_OUT`; support `POST /cancel/{id}`; optional `webhook` to our Worker (payload shape to be confirmed live).
- Cost display: Public Endpoints return `output.cost`; for own endpoints estimate `executionTime + delayTime` × GPU $/s from the table.
- Transport `proxy` for api.runpod.ai; stream binary/base64 through the Worker and decode client-side; consider decoding base64 → Blob in the browser to avoid double memory in the Worker.
