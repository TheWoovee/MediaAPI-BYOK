# AUTOMATIC1111 Stable Diffusion WebUI / Forge (local server)

- Website / docs: https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/API · https://github.com/AUTOMATIC1111/stable-diffusion-webui/wiki/Command-Line-Arguments-and-Settings · live Swagger at `http://127.0.0.1:7860/docs` · Forge: https://github.com/lllyasviel/stable-diffusion-webui-forge · ControlNet API: https://github.com/Mikubill/sd-webui-controlnet/wiki/API · SD.Next API: https://github.com/vladmandic/sdnext/wiki/API
- Last verified: 2026-09-06 (wiki pages + `master` sources `modules/cmd_args.py`, `modules/api/api.py`, `modules/api/models.py`, `modules/initialize_util.py`; Forge `main` sources `modules/processing.py`, `modules/api/api.py`, `modules/cmd_args.py`, `modules_forge/main_entry.py`; re-verify before shipping the adapter)
- Adapter id: `a1111`  ·  Transport: `direct`  ·  Priority wave: 1 (A1111 + Forge share one adapter; SD.Next as a "compatible" option)

Project status (important for prioritisation): A1111's last release is **v1.10.1 (2024-07)** (github releases page) and the repo is effectively dormant. lllyasviel's Forge last commit on `main` was **2025-06-26** (commits page). The actively maintained continuation is **Haoming02/sd-webui-forge-classic** with two branches: `classic` (SD1/SDXL) and `neo` ("Forge Neo": Flux/Flux.2-Klein, Z-Image, Wan 2.2, Qwen etc.); Neo removed SD2/SD3/hypernetworks/TI training but **keeps `--api`** (README). The `/sdapi/v1/*` surface is the same across all of them, so one adapter covers A1111, Forge, Forge Classic/Neo, and (mostly) SD.Next.

## Account and authentication
- No account. Local Gradio+FastAPI server, default `http://127.0.0.1:7860` (`--port`: "launch gradio with given server port … defaults to 7860 if available"; `--listen`: "launch gradio with 0.0.0.0 as server name, allowing to respond to network requests"; `--server-name`: "Sets hostname of server").
- **API must be enabled**: `--api` ("use api=True to launch the API together with the webui (use --nowebui instead for only the API)"). `--nowebui` = API only. Put flags in `webui-user.bat`: `set COMMANDLINE_ARGS=--api --cors-allow-origins=https://www.thewoovee.com`.
- Optional HTTP Basic auth for the API: `--api-auth user:pass` ("Set authentication for API like `username:password`; or comma-delimit multiple like `u1:p1,u2:p2,u3:p3`"). Implementation (`modules/api/api.py`): FastAPI `HTTPBasic()` dependency injected into **every** `add_api_route` when `--api-auth` is set; failure → `401` with `WWW-Authenticate: Basic`. Browser usage: send `Authorization: Basic base64(user:pass)` header explicitly (never rely on the browser's native prompt with `fetch`). Note `--gradio-auth` protects the UI only, not the API.
- `--api-log` logs all API requests; `--api-server-stop` enables `/sdapi/v1/server-stop|restart|kill`.
- Remote exposure: see `local-access.md` (Cloudflare Tunnel `sd.thewoovee.com → http://localhost:7860`). Basic auth + Access can be combined; the `Authorization` header must be allowed by CORS — A1111 allows all headers (see below).

## Browser (CORS) behaviour
- `modules/initialize_util.py::configure_cors_middleware` (verified) always installs Starlette `CORSMiddleware` with:
  ```python
  cors_options = {"allow_methods": ["*"], "allow_headers": ["*"], "allow_credentials": True}
  if cmd_opts.cors_allow_origins:        cors_options["allow_origins"] = cmd_opts.cors_allow_origins.split(',')
  if cmd_opts.cors_allow_origins_regex:  cors_options["allow_origin_regex"] = cmd_opts.cors_allow_origins_regex
  ```
  - `--cors-allow-origins`: "Allowed CORS origin(s) in the form of a comma-separated list (no spaces)" → e.g. `--cors-allow-origins=https://www.thewoovee.com,http://localhost:5173`. **Multiple origins supported**; Starlette reflects the matching `Origin` back (so `Access-Control-Allow-Credentials: true` works).
  - `--cors-allow-origins-regex`: "Allowed CORS origin(s) in the form of a single regular expression" → e.g. `--cors-allow-origins-regex="https://(www\.)?thewoovee\.com"`.
  - With neither flag, `allow_origins` is Starlette's default `()` → **no origin allowed** (no `Access-Control-Allow-Origin` header; preflight 400). So the flag is mandatory for our app.
  - Preflight: Starlette answers `OPTIONS` itself (200) with `Access-Control-Allow-Methods: *`-derived list, `Access-Control-Allow-Headers` reflecting the request headers, `Access-Control-Max-Age: 600`, `Access-Control-Allow-Credentials: true`. Custom headers such as `Authorization` (Basic auth) and `CF-Access-Client-Id` pass A1111's preflight (all headers allowed).
- Forge has the **same** flags and the same middleware (`modules/cmd_args.py` in Forge: identical `--api`, `--api-auth`, `--cors-allow-origins`, `--cors-allow-origins-regex` lines).
- SD.Next: API enabled by default; auth `--auth user:pass` (HTTP Basic); CORS flags are `--cors-origins` / `--cors-regex` per its CLI (**unverified this session** — the SD.Next API wiki page does not list them; check `webui --help`).
- Result of preflight test from origin https://www.thewoovee.com: **not executed** (no live server in the sandbox); derived from source. Expected: allowed when `--cors-allow-origins=https://www.thewoovee.com` is set, blocked otherwise.
- Mixed content / Chrome Local Network Access apply exactly as for ComfyUI (`http://127.0.0.1:7860` from an https page: OK in Chrome/Edge/Firefox with the Chrome 142+ permission prompt; blocked in Safari). See `local-access.md`.

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | Yes | `POST /sdapi/v1/txt2img` (SD1.x/2.x/SDXL/SD3 in A1111 1.10; + Flux in Forge; + Flux.2/Z-Image/Qwen etc. in Forge Neo) |
| image→image / edit / inpaint | Yes | `POST /sdapi/v1/img2img` (`init_images`, `mask`, `denoising_strength`, `inpainting_fill`, …) |
| upscale | Yes | `POST /sdapi/v1/extra-single-image` (ESRGAN/RealESRGAN/SwinIR/… upscalers, GFPGAN/CodeFormer) and hires-fix inside txt2img |
| text→video | Forge Neo only (Wan 2.2) — **unverified API shape**; SD.Next has `/sdapi/v1/video` | skip in wave 1 |
| image→video | same as above | skip |
| video→video / extend | No | — |
| audio in video | No | — |
| ControlNet | Yes (extension in A1111, built-in in Forge) | `alwayson_scripts.controlnet.args[]` |

## Models
| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| whatever is in `models/Stable-diffusion` | checkpoint | `width`/`height` (multiples of 8; 512 SD1.5, 1024 SDXL/Flux), `steps`, `cfg_scale`, `sampler_name`, `scheduler` | local GPU | free |
Discover with `GET /sdapi/v1/sd-models` → `[{"title": "v1-5-pruned.safetensors [6ce0161689]", "model_name": "v1-5-pruned", "hash": "6ce0161689", "sha256": "...", "filename": "/abs/path.safetensors", "config": null}]`. Select with `POST /sdapi/v1/options {"sd_model_checkpoint": "<title | filename | hash>"}` (wiki: "The checkpoint value can be the model name, filename (with or without extension), or hash") or per-request `override_settings: {"sd_model_checkpoint": "..."}` (wiki). Forge Flux additionally needs VAE/text encoders via `override_settings.forge_additional_modules` (see Forge section).

## Endpoints (exact)
Base `http://127.0.0.1:7860`. All JSON. Synchronous: the HTTP call blocks until the image(s) are generated (poll `/sdapi/v1/progress` from a second request for progress).

### `POST /sdapi/v1/txt2img` (sync)
Request fields (models.py `StableDiffusionTxt2ImgProcessingAPI` = all fields of `StableDiffusionProcessingTxt2Img` made Optional, plus API extras; defaults from the processing class):
```json
{
  "prompt": "a cat", "negative_prompt": "", "styles": [],
  "seed": -1, "subseed": -1, "subseed_strength": 0, "seed_resize_from_h": -1, "seed_resize_from_w": -1,
  "sampler_name": "Euler a", "scheduler": "Automatic", "sampler_index": "Euler",
  "batch_size": 1, "n_iter": 1, "steps": 20, "cfg_scale": 7,
  "width": 512, "height": 512,
  "restore_faces": false, "tiling": false,
  "do_not_save_samples": false, "do_not_save_grid": false,
  "eta": null, "denoising_strength": null, "s_min_uncond": 0, "s_churn": 0, "s_tmax": null, "s_tmin": 0, "s_noise": 1,
  "override_settings": { "sd_model_checkpoint": "...", "CLIP_stop_at_last_layers": 2, "sd_vae": "..." },
  "override_settings_restore_afterwards": true,
  "refiner_checkpoint": null, "refiner_switch_at": null, "disable_extra_networks": false,
  "firstpass_image": null, "comments": {},
  "enable_hr": false, "firstphase_width": 0, "firstphase_height": 0, "hr_scale": 2, "hr_upscaler": "Latent", "hr_second_pass_steps": 0, "hr_resize_x": 0, "hr_resize_y": 0,
  "hr_checkpoint_name": null, "hr_sampler_name": null, "hr_scheduler": null, "hr_prompt": "", "hr_negative_prompt": "",
  "force_task_id": null, "sampler_index": "Euler",
  "script_name": null, "script_args": [],
  "send_images": true, "save_images": false,
  "alwayson_scripts": {}, "infotext": null
}
```
- API-only extras (models.py, verified): `sampler_index` (default `"Euler"`, legacy — prefer `sampler_name`), `script_name`, `script_args`, `send_images` (default true → base64 in response), `save_images` (default false → do not write to disk), `alwayson_scripts`, `force_task_id` (lets you correlate `/progress`), `infotext` (paste an infotext string; fields not explicitly set are filled from it).
- `scheduler` values from `GET /sdapi/v1/schedulers` (`Automatic`, `Uniform`, `Karras`, `Exponential`, `Polyexponential`, `SGM Uniform`, `Simple`, …); `sampler_name` from `GET /sdapi/v1/samplers` (`Euler a`, `Euler`, `DPM++ 2M`, `DPM++ SDE`, …). Since 1.9 sampler and scheduler are separate fields (old combined names like `DPM++ 2M Karras` still map via aliases).
- Response (models.py `TextToImageResponse`): `{"images": ["<base64 PNG/JPEG/WebP per opts.samples_format>", ...], "parameters": {<the request as processed>}, "info": "<JSON string>"}`. `info` is a **stringified JSON** with `seed`, `all_seeds`, `all_prompts`, `infotexts`, `width`, `height`, `sd_model_name`, `sd_model_hash`, `sampler_name`, `cfg_scale`, `steps`, etc. Images are **raw base64 without a data-URI prefix**; decode with `atob` or prefix `data:image/png;base64,`.
- With `n_iter>1` or `batch_size>1` the grid image is included last unless `do_not_save_grid`/… (grid is included in `images` when `opts.return_grid` is on — default on; set `override_settings: {"return_grid": false}` to avoid it).
- Errors: 422 (pydantic validation), 404 for unknown script, 500 with `{"error","detail","body","errors"}` on exceptions.

### `POST /sdapi/v1/img2img` (sync)
Same fields as txt2img plus (models.py `StableDiffusionImg2ImgProcessingAPI`, verified):
```json
{
  "init_images": ["<base64 or data:image/png;base64,...>"],
  "resize_mode": 0,
  "denoising_strength": 0.75,
  "image_cfg_scale": null,
  "mask": "<base64 or data URI>",
  "mask_blur": 4, "mask_blur_x": 4, "mask_blur_y": 4, "mask_round": true,
  "inpainting_fill": 0,
  "inpaint_full_res": true, "inpaint_full_res_padding": 0,
  "inpainting_mask_invert": 0,
  "initial_noise_multiplier": null,
  "latent_mask": null,
  "include_init_images": false,
  "force_task_id": null
}
```
- `init_images` is a **list**; `resize_mode` 0 just resize / 1 crop and resize / 2 resize and fill / 3 just resize (latent upscale). `inpainting_fill` 0 fill / 1 original / 2 latent noise / 3 latent nothing. `inpainting_mask_invert` 0 = inpaint masked, 1 = inpaint not masked. `mask` is a grayscale/white-on-black PNG the same size as the init image.
- Decoding (api.py `decode_base64_to_image`): accepts raw base64 **or** a `data:image/...;base64,` prefix (prefix is stripped). `http(s)://` URLs are accepted **only** with `--api-enable-requests` (fetched server-side with a 30 s timeout; `--api-forbid-local-requests` blocks private ranges). Send base64.
- Response: `{"images": [...], "parameters": {...}, "info": "..."}` (init images excluded unless `include_init_images: true`).

### `POST /sdapi/v1/extra-single-image` (sync) — upscale / face restore
```json
{ "resize_mode": 0, "show_extras_results": true,
  "gfpgan_visibility": 0, "codeformer_visibility": 0, "codeformer_weight": 0,
  "upscaling_resize": 2, "upscaling_resize_w": 512, "upscaling_resize_h": 512, "upscaling_crop": true,
  "upscaler_1": "R-ESRGAN 4x+", "upscaler_2": "None", "extras_upscaler_2_visibility": 0,
  "upscale_first": false, "image": "<base64 or data URI>" }
```
`resize_mode` 0 = by factor (`upscaling_resize`), 1 = to size (`upscaling_resize_w/h`). Upscaler names from `GET /sdapi/v1/upscalers` → `[{"name": "R-ESRGAN 4x+", "model_name": "...", "model_path": "...", "model_url": null, "scale": 4}]`. Response `{"html_info": "...", "image": "<base64>"}`. Batch variant: `POST /sdapi/v1/extra-batch-images` with `imageList: [{"data": "<b64>", "name": "x.png"}]` → `{"html_info", "images": [...]}`.

### `GET /sdapi/v1/progress?skip_current_image=false` — progress of the running job
`{"progress": 0.0–1.0, "eta_relative": <seconds>, "state": {"skipped", "interrupted", "job", "job_count", "job_timestamp", "job_no", "sampling_step", "sampling_steps"}, "current_image": "<base64 preview or null>", "textinfo": "..."}` (api.py `progressapi`). Progress is global (one job at a time); use `force_task_id` in the generate request and compare with `state.job`? — **unverified** that `state.job` exposes the task id; treat progress as global.

### `POST /sdapi/v1/interrupt` and `POST /sdapi/v1/skip`
Empty body → 200. `interrupt` aborts the current job (the pending generate request returns with whatever was produced, possibly a partially-denoised image).

### `GET /sdapi/v1/options` / `POST /sdapi/v1/options`
GET returns the full settings dict (hundreds of keys, e.g. `sd_model_checkpoint`, `sd_vae`, `CLIP_stop_at_last_layers`, `samples_format`, `return_grid`, `img2img_color_correction`). POST with a partial dict sets them persistently (server writes `config.json`); setting `sd_model_checkpoint` triggers a (slow) model load and the POST blocks until done.

### Lists
- `GET /sdapi/v1/sd-models` (checkpoints; see Models), `POST /sdapi/v1/refresh-checkpoints`
- `GET /sdapi/v1/sd-vae` (A1111) → `[{"model_name","filename"}]`; **Forge replaces this with `GET /sdapi/v1/sd-modules`** (VAE + text encoders from `modules_forge.main_entry.module_list`, same item shape) — verified by diffing `add_api_route` lists (`sd-modules` present in Forge, `sd-vae` absent; Forge also lacks `train/embedding` and `train/hypernetwork`).
- `GET /sdapi/v1/samplers` → `[{"name": "Euler a", "aliases": ["k_euler_a", ...], "options": {...}}]`
- `GET /sdapi/v1/schedulers` → `[{"name": "karras", "label": "Karras", "aliases": [...], "default_rho": 7.0, "need_inner_model": false}]` — use `label` in `scheduler`
- `GET /sdapi/v1/upscalers`, `GET /sdapi/v1/latent-upscale-modes`, `GET /sdapi/v1/face-restorers`, `GET /sdapi/v1/realesrgan-models`, `GET /sdapi/v1/prompt-styles`, `GET /sdapi/v1/embeddings`, `GET /sdapi/v1/hypernetworks`, `GET /sdapi/v1/scripts`, `GET /sdapi/v1/script-info`, `GET /sdapi/v1/extensions`, `GET /sdapi/v1/cmd-flags`, `GET /sdapi/v1/memory` (RAM/VRAM), `POST /sdapi/v1/png-info {"image": "<b64>"}` → `{"info": "<infotext>", "items": {...}, "parameters": {...}}`, `POST /sdapi/v1/interrogate {"image","model":"clip"|"deepdanbooru"}` → `{"caption"}`, `POST /sdapi/v1/unload-checkpoint`, `POST /sdapi/v1/reload-checkpoint`.
- Full OpenAPI: `GET /openapi.json`; Swagger UI at `/docs` (wiki).

### ControlNet via `alwayson_scripts` (Mikubill wiki "API", verified)
```json
"alwayson_scripts": { "controlnet": { "args": [ {
  "enabled": true, "image": "<base64>", "mask": null,
  "module": "canny", "model": "control_v11p_sd15_canny [d14c016b]",
  "weight": 1.0, "resize_mode": 1, "lowvram": false, "processor_res": 512,
  "threshold_a": 100, "threshold_b": 200, "guidance_start": 0.0, "guidance_end": 1.0,
  "control_mode": 0, "pixel_perfect": false
} ] } }
```
Field is `image` (older docs/examples use `input_image`; both are accepted by the extension's `ControlNetUnitRequest`). `resize_mode` 0 Just Resize / 1 Crop and Resize / 2 Resize and Fill; `control_mode` 0 Balanced / 1 My prompt is more important / 2 ControlNet is more important. Discovery: `GET /controlnet/model_list`, `GET /controlnet/module_list`, `POST /controlnet/detect`, `GET /controlnet/version`. In **Forge** ControlNet is built in and the same `alwayson_scripts.controlnet` key works (Forge README lists "ControlNets: Normal" in its status table); Flux ControlNets were "not implemented yet" as of Forge's last status update.

## Forge differences (lllyasviel/stable-diffusion-webui-forge; also Forge Classic/Neo)
- Same launch flags (`--api`, `--listen`, `--api-auth`, `--cors-allow-origins`, `--cors-allow-origins-regex`) and same `/sdapi/v1` routes, except `sd-vae` → `sd-modules` and no training routes (verified by source diff).
- Supports Flux (BNB NF4, GGUF, fp8), SD3, SDXL, SD1.5 (README). UI preset radio `forge_preset` ∈ `['sd','xl','flux','all']` (`modules_forge/main_entry.py` line 65) — it is a stored option, settable via `override_settings`/`POST /options` as `forge_preset`; it mostly toggles UI defaults.
- **Flux-specific generation params** (`modules/processing.py`, verified): `distilled_cfg_scale: float = 3.5` on the base processing class (so it is a top-level txt2img/img2img request field, auto-included in the API model) and `hr_distilled_cfg: float = 3.5` for hires-fix. For Flux send `cfg_scale: 1` and `distilled_cfg_scale: 3.5` (community-confirmed in discussion #2258; a working payload also set `sampler_name: "Euler"`, `scheduler: "Simple"` to avoid black images).
- **Forge-specific options** (settable via `override_settings` or `POST /sdapi/v1/options`): `forge_additional_modules` (list of VAE / text-encoder filenames, e.g. `["ae.safetensors", "clip_l.safetensors", "t5xxl_fp8_e4m3fn.safetensors"]` — required for split Flux checkpoints; names from `GET /sdapi/v1/sd-modules`), `forge_unet_storage_dtype` ("Diffusion in Low Bits": `Automatic`, `Automatic (fp16 LoRA)`, `bnb-nf4`, `float8-e4m3fn`, `gguf`…), `forge_inference_memory` (the "GPU Weights" slider, in MB kept for inference), `forge_async_loading`, `forge_pin_shared_memory`, `forge_preset`. Infotext keys written: `Distilled CFG Scale`, `Diffusion in Low Bits`, `Module 1..n`.
- Forge one-click Windows package: `webui_forge_cu121_torch231.7z` (README, "run `update.bat` then `run.bat`"); flags go in `webui\webui-user.bat` `COMMANDLINE_ARGS`. Forge's own README status table says "API endpoints (txt2img, img2img, etc): Normal, but pending improved Flux support (2024 Aug 29)".
- Forge Neo (Haoming02) is the live fork; it keeps `--api` (README: "Enable API access") and the classic `/sdapi/v1` payloads for SD1/SDXL/Flux; video (Wan 2.2) via the API is **unverified**.

## SD.Next compatibility (vladmandic/sdnext, wiki "API")
- API is on by default (no `--api` needed); Swagger `/docs`, ReDoc `/redocs`; Basic auth via `--auth user:pass`.
- `/sdapi/v1/txt2img|img2img|extra-single-image|progress|interrupt|options|sd-models|samplers|upscalers` exist with A1111-shaped payloads and `{images, parameters, info}` responses, **but** sampler naming differs: A1111's combined `DPM++ 2M Karras` is `sampler_name: "DPM++ 2M"` + `schedulers_sigma: "karras"` in SD.Next (wiki). SD.Next also accepts most settings directly in the payload. Extra endpoints: `/sdapi/v1/control`, `/sdapi/v1/video`, `/sdapi/v1/history`. Treat SD.Next as "best-effort compatible": use `GET /sdapi/v1/samplers` to populate names and avoid hard-coding.

## Input media
- Base64 strings in JSON (`init_images[]`, `mask`, `image`, ControlNet `image`); data-URI prefix allowed. No upload endpoint. Practical limit: FastAPI has no body limit, but through Cloudflare the whole JSON request must be < 100 MB (free plan). A 4k PNG is ~10–30 MB base64 → fine.

## Output media
- Base64 in the JSON response (`images[]`), format per `samples_format` option (`png` default; `jpg`/`webp` possible — set `override_settings: {"samples_format": "jpeg", "jpeg_quality": 90}` to shrink responses). PNG contains the infotext in a tEXt chunk (`parameters`). No URLs, no expiry, nothing to CORS-fetch afterwards. Convert to `Blob` client-side.

## Rate limits, quotas, free tier
- None locally; one generation at a time (requests queue inside the server; concurrent HTTP calls block). Behind Cloudflare Tunnel the **synchronous** `txt2img`/`img2img` call is subject to the edge **Proxy Read Timeout (125 s → 524)** and **100 MB** request-body limit — a slow SDXL/Flux hires job on a small GPU can exceed 125 s. There is no async job mode in the A1111 API, so for remote use either keep jobs short or accept that a 524 does **not** cancel the job: the image is still generated and saved on the PC (`save_images: true`) but the response is lost. Mitigation: set `save_images: true` for remote sessions and poll `/sdapi/v1/progress` to know when it finishes; the result can then only be retrieved by the user from disk (no "latest image" endpoint) — document this as a known limitation and prefer ComfyUI for remote long jobs.

## Gotchas
- Without `--api` the `/sdapi/v1/*` routes do not exist (404 HTML). Without `--cors-allow-origins` every browser call fails at preflight.
- Gradio's own routes (`/config`, `/queue/...`) are irrelevant; only `/sdapi/v1/*` matter.
- `--listen` binds 0.0.0.0 and, per the wiki, disables the extensions tab unless `--enable-insecure-extension-access`; not needed for localhost/tunnel use.
- Seeds: `-1` means random; the actual seed is in `info.seed` / `info.all_seeds`.
- `override_settings` + `override_settings_restore_afterwards: true` (default) is the safe per-request way to switch checkpoint/VAE/CLIP skip without persisting; model switching itself takes seconds to minutes.
- `sampler_index` (legacy) and `sampler_name` both exist; send `sampler_name`.
- Basic auth via `fetch` needs `Authorization` header manually (`credentials` does not apply to Basic); with CORS the header is allowed (`allow_headers: ["*"]`).
- Forge Flux needs `distilled_cfg_scale` + `cfg_scale: 1` + correct `forge_additional_modules`; otherwise black/garbage images.
- SD.Next sampler names differ; A1111 combined names with `Karras` etc. are aliases in A1111 ≥1.9 but not in SD.Next.

## Adapter mapping notes
- Settings: base URL (`http://127.0.0.1:7860` default; or `https://sd.thewoovee.com`), optional Basic auth user/pass, flavour auto-detect: probe `GET /sdapi/v1/sd-modules` (200 → Forge family) else `GET /sdapi/v1/sd-vae` (A1111/SD.Next); `GET /sdapi/v1/cmd-flags` and `GET /sdapi/v1/options` keys (`forge_preset` present → Forge).
- Test: `GET /sdapi/v1/sd-models` (also fills the model dropdown). 404 → "start with `--api`"; CORS failure → "add `--cors-allow-origins=https://www.thewoovee.com`".
- text→image → `txt2img` with `prompt, negative_prompt, steps, sampler_name, scheduler, cfg_scale, width, height, batch_size, seed`, `override_settings.sd_model_checkpoint` (+ `distilled_cfg_scale`, `forge_additional_modules` when Forge+Flux). Hires-fix exposed as advanced toggle (`enable_hr, hr_scale, hr_upscaler, denoising_strength`).
- image→image / inpaint → `img2img` with `init_images:[b64]`, `denoising_strength`, `mask`, `inpainting_fill`, `inpaint_full_res`, `mask_blur`.
- upscale → `extra-single-image` (`upscaler_1`, `upscaling_resize` or `_w/_h`).
- ControlNet → optional panel that only appears if `GET /controlnet/version` returns 200; pass `alwayson_scripts.controlnet.args`.
- Progress: poll `GET /sdapi/v1/progress` every 1 s while the generate promise is pending; show `current_image` as live preview. Cancel → `POST /sdapi/v1/interrupt`.
- Remote (tunnel) mode: warn when estimated duration may exceed ~120 s; set `save_images: true` by default remotely.
