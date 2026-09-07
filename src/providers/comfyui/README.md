# ComfyUI adapter

- Provider id: `comfyui` · Transport: `local` (see `shared/providers/registry.ts`)
- Last verified: 2026-09-07 (against `docs/providers/comfyui.md`, itself researched against the `master` branch of ComfyUI's `server.py` / `execution.py` / `comfy_extras/nodes_video.py`; **no live ComfyUI instance was available to exercise this adapter** — everything below is derived from source/docs, not a live smoke test)
- Default base URL: `http://127.0.0.1:8188` (Desktop app default is `127.0.0.1:8000` — configured per `LocalServer.base_url`, not by this adapter)

## Implemented capabilities

| Capability | Model id | Notes |
|---|---|---|
| `text2image` | `comfyui-txt2img` | SD1.5/SDXL-style graph; any checkpoint the server has loaded. |
| `image2image` | `comfyui-img2img` | Adds `LoadImage` -> `ImageScale` -> `VAEEncode`; `denoise` controls strength. |
| `inpaint` | `comfyui-inpaint` | `LoadImage` + `LoadImageMask` -> `VAEEncodeForInpaint`. |
| `upscale` | `comfyui-upscale` | `LoadImage` -> `UpscaleModelLoader` -> `ImageUpscaleWithModel`. |
| `image2video` | `comfyui-image2video` | Wan 2.x-style graph — **unverified**, see below. |
| anything else | `comfyui-custom-workflow` | Paste a raw API-format workflow and submit it as-is. |

`comfyuiAdapter.capabilities` advertises the full `Capability` union (including `remove_bg`, `text2video`, `video2video`, `video_extend`) because ComfyUI is fully workflow-driven — any capability is reachable through the custom-workflow model even without a dedicated template.

## Templates shipped (`workflows/*.json`)

All are API-format graphs (`File > Export (API Format)` in the ComfyUI frontend), keyed by numeric-string node id, patched in place before `POST /prompt`:

- `txt2img.json` — `CheckpointLoaderSimple(4)` -> `CLIPTextEncode(6/7)` -> `EmptyLatentImage(5)` -> `KSampler(3)` -> `VAEDecode(8)` -> `SaveImage(9)`
- `img2img.json` — same, `EmptyLatentImage` replaced by `LoadImage(10)` -> `ImageScale(12)` -> `VAEEncode(11)` so `width`/`height` resize the source image before encoding
- `inpaint.json` — `LoadImage(10)` + `LoadImageMask(13)` -> `VAEEncodeForInpaint(14)` -> `KSampler(3)`
- `upscale.json` — `LoadImage(10)` -> `UpscaleModelLoader(15)` -> `ImageUpscaleWithModel(16)` -> `SaveImage(9)`
- `image2video.json` — `CLIPLoader` + `CLIPTextEncode` + `VAELoader` + `UNETLoader` + `LoadImage` -> `WanImageToVideo` -> `KSampler` -> `VAEDecode` -> `CreateVideo` -> `SaveVideo` (**unverified**, see below)

The param -> node/input mapping for each template lives in `models.ts` (`TEMPLATES[modelId].paramMap`), e.g.:

```ts
prompt:        { nodeId: '6', inputKey: 'text' }
ckpt_name:     { nodeId: '4', inputKey: 'ckpt_name' }
seed:          { nodeId: '3', inputKey: 'seed' }
```

`submit()` clones the template (`JSON.parse(JSON.stringify(...))`), uploads any `MediaInput`-shaped params (`image`, `mask`) via `POST /upload/image` first, patches every other provided param into its mapped node, randomizes `seed` client-side when it is `-1`/unset (ComfyUI's `control_after_generate` is a frontend-only convenience — the API always needs an explicit seed), and only then POSTs `/prompt`.

### Custom workflow model (`comfyui-custom-workflow`)

Accepts `params.workflow_json` (a full API-format graph) and submits it mostly unmodified. Optional `prompt`/`prompt_node_id`/`prompt_input_key` and `seed`/`seed_node_id`/`seed_input_key` let the caller point at which node/input to patch, since a raw pasted graph has no known param map. **Known limitation**: a `MediaInput` param (e.g. an uploaded reference image) is uploaded via `/upload/image` so the file exists on the server, but there is no way to auto-wire it into an arbitrary graph — the adapter logs the resulting filename and the caller must already reference it (or a placeholder they'll edit) inside `workflow_json`. There is no validation of the pasted JSON beyond `JSON.parse` and whatever `/prompt` itself rejects via `node_errors`.

## Required launch flags

- **`--enable-cors-header <origin>`** (or `--enable-cors-header` alone for `*`) — required for any browser fetch to ComfyUI's default `create_origin_only_middleware()` 403s cross-site requests (including plain `GET`s) unless this flag is set. Passing `*` together with `credentials: 'include'` is rejected by browsers; this adapter does not send credentials, so `*` is fine for local dev, but a single fixed origin is recommended for anything exposed beyond localhost.
- No auth flag exists for the ComfyUI HTTP API itself (`--multi-user` only namespaces storage, it is not authentication). `ProviderSpec.auth` on this provider exists only for the optional Cloudflare Access tunnel case, not for ComfyUI itself.

## Adapter internals

- **listModels**: fetches `/object_info/CheckpointLoaderSimple`, `/object_info/KSampler`, `/object_info/UpscaleModelLoader` in parallel (each independently try/caught) to populate `ckpt_name`/`sampler_name`/`scheduler`/`model_name` enum options; any failure (offline server) falls back to a static sampler/scheduler list and an empty checkpoint/upscale-model list (surfaced as `enum: []` — the UI should show "server offline, connect to see options").
- **submit**: uploads media params -> patches template -> randomizes seed -> `POST /prompt` -> throws with the server's `error.message` / `node_errors` keys on a non-2xx or `{error: ...}` response; returns `provider_ref: { promptId, clientId }`.
- **poll**: `GET /history/{promptId}`; an empty `{}` falls back to `GET /queue` to distinguish `queued` (in `queue_pending`) from `processing` (in `queue_running`); `status.status_str === 'error'` extracts the `execution_error` message from `status.messages`; `success` walks every output-node's `images[]`/`gifs[]` entries (skipping `audio[]` — there is no audio `NormalizedOutput.kind`, so audio-only outputs are currently dropped with a log line), fetches each via `GET /view?filename=&subfolder=&type=` as bytes, and classifies `kind: 'video'` when the file extension is `.mp4`/`.webm`/`.mkv`/`.gif` or the node's `animated` flag is set (this covers both the core `SaveVideo`/`SaveAnimatedWEBP` shape — which reports videos under `images[]` with `animated: [true]` — and the VHS `VideoCombine` custom node's `gifs[]` shape).
- **cancel**: `GET /queue`; if the prompt id is in `queue_running`, `POST /interrupt {prompt_id}`; if only in `queue_pending`, `POST /queue {delete: [prompt_id]}`; if in neither list, no-op (already finished).
- **testCredential**: `GET /system_stats`; `ok: true` with `ComfyUI <version> connected (GPU: <name>)` on 200, `ok: false` with the HTTP status (and a CORS hint on 403) or the network error message otherwise.

## Unverified / not implemented

- **Wan 2.x `image2video` template**: the node classes (`WanImageToVideo`, `UNETLoader`, `CreateVideo`/`SaveVideo`) and their exact input names were not checked against a live ComfyUI install with the relevant model files and custom nodes present. Expect `/prompt` to return `node_errors` if the node classes are missing or their input schema has since changed; the adapter surfaces those errors verbatim but does not pre-validate node availability.
- **WebSocket progress** (`GET /ws?clientId=`): not implemented. The adapter deliberately polls `GET /history/{id}` only, per the ComfyUI docs' own recommendation and because Cloudflare Tunnel/Access WS handshakes can't carry the service-token headers this app would need — see `docs/providers/comfyui.md`. A future iteration could open the socket for live `progress` events opportunistically while still treating history polling as the source of truth.
- **Custom-workflow validation**: no schema checking of pasted `workflow_json` beyond `JSON.parse`; a workflow exported in the non-API "Save" format (`nodes[]`/`links[]`) will be rejected by ComfyUI's `/prompt`, not by this adapter.
- **`/upload/mask`**: mask uploads currently go through the same `/upload/image` endpoint as image uploads (per this adapter's build instructions), not the dedicated `/upload/mask` route that additionally writes the mask into the source image's alpha channel under `clipspace/`. This is simpler but means the inpaint template's `LoadImageMask` reads whatever file was uploaded directly, rather than a server-composited clipspace mask.
- **Audio-only outputs** (`SaveAudio*` -> `audio[]`): detected but dropped, since `NormalizedOutput.kind` has no `'audio'` variant.
- **`n` (batch)**: only wired for `comfyui-txt2img`'s `batch_size` input; other templates ignore `GenerateRequest.n`.
