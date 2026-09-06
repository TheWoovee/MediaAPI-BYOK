# fal.ai

- Website / docs: https://fal.ai · Queue API: https://docs.fal.ai/model-apis/model-endpoints/queue · Sync: https://docs.fal.ai/model-apis/model-endpoints/synchronous-requests · Reliability/retries: https://docs.fal.ai/model-apis/model-endpoints/reliability · Webhooks: https://docs.fal.ai/model-apis/model-endpoints/webhooks · Auth: https://docs.fal.ai/model-apis/authentication and https://fal.ai/docs/documentation/setting-up/authentication · Errors: https://docs.fal.ai/model-apis/errors · Model search (Platform API): https://docs.fal.ai/platform-apis/v1/models · Media expiration: https://fal.ai/docs/documentation/model-apis/media-expiration · Concurrency: https://fal.ai/docs/documentation/model-apis/concurrency-limits · FAQ/rate limits: https://fal.ai/docs/model-apis/faq · Pricing: https://fal.ai/docs/documentation/model-apis/pricing and https://fal.ai/pricing · JS client: https://docs.fal.ai/clients/javascript, source https://github.com/fal-ai/fal-js · Server proxy: https://docs.fal.ai/model-endpoints/server-side, source https://github.com/fal-ai/fal-js/tree/main/libs/proxy · Python client source: https://github.com/fal-ai/fal/blob/main/projects/fal_client/src/fal_client/client.py · Per-model API pages: `https://fal.ai/models/<endpoint-id>/api`
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter). NOTE: docs.fal.ai, fal.ai, fal.run, queue.fal.run and rest.fal.ai were **blocked by the research sandbox's egress proxy**, so facts below come from search-engine snippets of the official docs plus the official `fal-js` and `fal_client` (Python) sources on GitHub. Items marked "unverified" could not be confirmed against the page itself.
- Adapter id: `fal`  ·  Transport: `proxy` (direct is probably possible, see CORS)  ·  Priority wave: 1

## Account and authentication
- Get a key: sign up at https://fal.ai, create a key at https://fal.ai/dashboard/keys. Keys have a **scope**: `API` (model calls, discovery, pricing, analytics) or `Admin` (sensitive Platform APIs) — use `API` scope for this app (https://fal.ai/docs/reference/platform-apis/authentication). The key is shown once. Free credits: new accounts get "promotional credits on signup" (amount unverified); free credits/coupons expire after 1 week–1 year depending on grant, purchased credits expire 365 days after purchase (https://fal.ai/docs/model-apis/faq).
- Auth header (exact): `Authorization: Key <FAL_KEY>` — the word `Key`, not `Bearer`. `fal-js` builds it as `` `Key ${credentials}` `` (`libs/client/src/request.ts`). The credential string is `<key_id>:<key_secret>`; both clients also accept `FAL_KEY_ID` + `FAL_KEY_SECRET` and join them with `:` (`libs/client/src/config.ts`, proxy `getFalKey()`).
- Base URLs (all global, no regions documented):
  - `https://queue.fal.run` — asynchronous queue (recommended).
  - `https://fal.run` — synchronous.
  - `https://rest.fal.ai` — REST/storage API used by current clients (`REST_URL = "https://rest.fal.ai"` in `fal_client/client.py`; `getRestApiUrl()` in fal-js). Older docs/mirrors use `https://rest.alpha.fal.ai`; the webhook JWKS is still documented at `https://rest.alpha.fal.ai/.well-known/jwks.json`. Whether both hosts serve `/storage/upload/initiate` is unverified — use `rest.fal.ai` and keep the other allowlisted.
  - `https://api.fal.ai/v1` — Platform APIs (model catalog/search).
  - `https://v3.fal.media` — output/input CDN (`CDN_URL` in the Python client).
  - `wss://realtime.fal.run` — realtime WebSocket (not needed here).

## Browser (CORS) behaviour
- Result: **unknown by test, very likely allowed**. `OPTIONS https://queue.fal.run/fal-ai/flux/dev`, `https://fal.run/fal-ai/flux/dev` and `https://rest.fal.ai/storage/upload/initiate` with `Origin: https://www.thewoovee.com` could not be executed: the sandbox egress proxy refused the CONNECT (`HTTP/1.1 403 Forbidden` from the proxy, not from fal). Evidence that browser calls work: `@fal-ai/client` officially supports running in the browser with `fal.config({ credentials })` and only *warns* `"The fal credentials are exposed in the browser's environment. That's not recommended for production use cases."` (`libs/client/src/config.ts`); it also drops the `User-Agent` header when `isBrowser()` (`request.ts`). That client would not work without CORS on `fal.run`/`queue.fal.run`/`rest.fal.ai`. Re-test from a real browser/curl before choosing `direct`:
  `curl -s -o /dev/null -D - -X OPTIONS -H "Origin: https://www.thewoovee.com" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type" https://queue.fal.run/fal-ai/flux/dev`
- fal's own recommendation for browsers is the **server proxy** pattern (below); for a BYOK app the key is the user's, so `direct` is acceptable if CORS confirms.

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | yes | FLUX family (`fal-ai/flux/*`, `fal-ai/flux-pro/*`, `fal-ai/flux-2*`), Seedream (`fal-ai/bytedance/seedream/*`, `bytedance/seedream/v5/*`), Ideogram (`fal-ai/ideogram/v3`), Recraft (`fal-ai/recraft/v3/text-to-image`), Qwen (`fal-ai/qwen-image`), Nano Banana (`fal-ai/nano-banana*`), GPT Image (`fal-ai/gpt-image-*`), many more — all `POST queue.fal.run/<id>` |
| image→image / edit / inpaint | yes | `fal-ai/flux-pro/kontext`, `/kontext/max`, `fal-ai/flux-2/edit`, `fal-ai/flux/dev/image-to-image`, `fal-ai/flux-general/inpainting`, `fal-ai/bytedance/seedream/v4.5/edit`, `fal-ai/nano-banana/edit`, `fal-ai/nano-banana-2/edit`, `fal-ai/qwen-image-edit`, `fal-ai/recraft/v3/image-to-image`, `fal-ai/ideogram/v3/edit` … (inputs `image_url` / `image_urls`, `mask_url`) |
| upscale | yes | `fal-ai/aura-sr`, `fal-ai/clarity-upscaler`, `fal-ai/creative-upscaler`, `fal-ai/esrgan`, `fal-ai/ccsr` (ids from fal-js/Vercel model list) |
| text→video | yes | Seedance, Kling, Veo 3/3.1, Wan 2.2/2.5/2.7/3, Hunyuan, LTX-2/2.3, MiniMax Hailuo, Sora 2, Grok Imagine (see Models) |
| image→video | yes | same families, `.../image-to-video` sub-endpoints, input `image_url` (+ `end_image_url` on some) |
| video→video / extend | yes | `fal-ai/wan/v2.2-a14b/video-to-video`, `fal-ai/ltx-2.3/extend-video`, Wan 2.7 "instruction-based video editing", Kling motion-control variants |
| audio in video | yes | Veo 3/3.1 (`generate_audio`), Kling 2.6/3 (native audio), Seedance 1.5/2.x (audio billed separately), Wan 2.5+/2.7/3 (native audio), Sora 2 |

## Models
Endpoint ids are the path after `queue.fal.run/`. Prices are what fal shows on the model page ("$/MP" = per output megapixel, rounded up). Anything not confirmed in an official fal snippet is marked *unverified*. Input field names are the common fal conventions (`prompt`, `image_url`, `image_size`, `num_images`, `seed`, `enable_safety_checker`, `output_format`, `sync_mode`); check `https://fal.ai/models/<id>/api` (or `GET api.fal.ai/v1/models?endpoint_id=<id>&expand=openapi-3.0`) for the exact schema.

### Images
| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| `fal-ai/flux/schnell` | t2i | `prompt`, `image_size` (`square_hd`,`square`,`portrait_4_3`,`portrait_16_9`,`landscape_4_3`,`landscape_16_9` or `{width,height}`), `num_inference_steps` (4), `num_images`, `seed`, `enable_safety_checker` | — | per MP; exact rate unverified (~$0.003/MP) |
| `fal-ai/flux/dev` (+ `/image-to-image`, `/redux`) | t2i / i2i | as above + `guidance_scale`, `strength` (i2i), `image_url` | — | $0.025/MP (https://fal.ai/models/fal-ai/flux/dev; figure also quoted by pricepertoken.com — unverified against page) |
| `fal-ai/flux-pro/v1.1` | t2i | `prompt`, `image_size`, `safety_tolerance` 1–6, `output_format` jpeg/png | — | $0.04/MP (model page snippet; one aggregator lists $0.055) |
| `fal-ai/flux-pro/v1.1-ultra` | t2i (2K) | `aspect_ratio` (`21:9`…`9:21`), `raw` bool | — | $0.06/image (https://fal.ai/models/fal-ai/flux-pro/v1.1-ultra) |
| `fal-ai/flux-pro/kontext` · `fal-ai/flux-pro/kontext/max` | edit (single ref) | `prompt`, `image_url`, `aspect_ratio`, `guidance_scale`, `safety_tolerance`, `output_format` | 1 input image | $0.04 / $0.08 per image (unverified this session; "priced like the Pro tier") |
| `fal-ai/flux-2` (FLUX.2 [dev]) · `fal-ai/flux-2/edit` | t2i / multi-ref edit | `prompt`, `image_size`, `image_urls[]` (edit), LoRA support | — | $0.012/MP (https://fal.ai/models/fal-ai/flux-2) |
| `fal-ai/flux-2-pro` | t2i / edit | `prompt`, `image_size`/`aspect_ratio`, `image_urls[]` | — | $0.03 first output MP + $0.015 per extra MP of input+output (https://fal.ai/models/fal-ai/flux-2-pro) |
| `fal-ai/flux-2-flex` | t2i / edit | adds `num_inference_steps`, `guidance_scale` | — | $0.06/MP |
| `fal-ai/flux-2-max` | t2i / edit | — | — | $0.07 first MP, $0.03 per extra MP |
| FLUX.2 Flash / Turbo (ids unverified, probably `fal-ai/flux-2/flash`, `fal-ai/flux-2/turbo`) | t2i | — | — | $0.005/MP, $0.008/MP |
| `fal-ai/bytedance/seedream/v4/text-to-image` · `/v4/edit` | t2i / edit | `prompt`, `image_size` (up to 4K), `image_urls[]` (edit, multi-ref), `num_images`, `seed`, `enable_safety_checker` | up to 4 MP | ~$0.03/image (unverified) |
| `fal-ai/bytedance/seedream/v4.5/text-to-image` · `/v4.5/edit` | t2i / edit | as v4; edit `POST https://fal.run/fal-ai/bytedance/seedream/v4.5/edit` | up to 2048×2048 (4 MP) | $0.04/image (https://fal.ai/models/fal-ai/bytedance/seedream/v4.5/edit) |
| `bytedance/seedream/v5/pro/text-to-image` · `bytedance/seedream/v5/pro/edit` (**no `fal-ai/` prefix**) | t2i / edit | up to 2K, aspect ratios 1/16…16; `image_urls[]` | — | $0.0675/image ≤1536×1536, $0.135/image ≤2048×2048; edit: first input image included, +$0.0045 per extra reference (https://fal.ai/models/bytedance/seedream/v5/pro/text-to-image) |
| `fal-ai/bytedance/seedream/v5/lite/text-to-image` | t2i | — | — | $0.035/image (https://fal.ai/models/fal-ai/bytedance/seedream/v5/lite/text-to-image) |
| `fal-ai/ideogram/v3` (+ `/edit`, `/remix`, `/reframe`, `fal-ai/ideogram/character`) | t2i / edit | `prompt`, `image_size`, `rendering_speed` (`TURBO`/`BALANCED`/`QUALITY`), `style`, `expand_prompt`, `negative_prompt` | — | tiered by `rendering_speed`; Turbo ≈ $0.03–0.04/image (aggregator; unverified) |
| `fal-ai/recraft/v3/text-to-image` · `fal-ai/recraft/v3/image-to-image` | t2i / i2i, vector | `prompt`, `image_size`, `style` (incl. `vector_illustration`), `colors` | — | $0.04/image, $0.08 for vector styles (https://fal.ai/models/fal-ai/recraft/v3/text-to-image) |
| `fal-ai/qwen-image` · `fal-ai/qwen-image-edit` | t2i / edit (text rendering) | `prompt`, `image_size`, `num_inference_steps`, `guidance_scale`, `image_url` (edit), `acceleration` | — | ≈$0.03/MP class (unverified) |
| `fal-ai/nano-banana` · `fal-ai/nano-banana/edit` | t2i / edit (Gemini 2.5 Flash Image) | `prompt`, `image_urls[]` (edit), `num_images`, `output_format`, `aspect_ratio` | — | $0.039/image (https://fal.ai/models/fal-ai/nano-banana/edit) |
| `fal-ai/nano-banana-pro` · `/edit` | t2i / edit | adds `resolution` 1K/2K/4K | — | $0.15/image (https://fal.ai/models/fal-ai/nano-banana-pro) |
| `fal-ai/nano-banana-2` · `/edit` | t2i / edit | `resolution` 1K/2K/4K | — | $0.08/image; 2K ×1.5, 4K ×2 (https://fal.ai/models/fal-ai/nano-banana-2/edit) |
| GPT Image (`fal-ai/gpt-image-1.5`, `fal-ai/gpt-image-1/text-to-image/byok`, GPT Image 2 — ids unverified) | t2i / edit | `quality`, `image_size`, `background`, BYOK variants need your OpenAI key | — | token-metered, no flat per-image price (unverified) |

### Video
| Model id | Type | Key params | Limits | Price |
|---------|------|-----------|--------|-------|
| `fal-ai/bytedance/seedance/v1/pro/text-to-video` · `/v1/pro/image-to-video` | t2v / i2v | `prompt`, `image_url`, `aspect_ratio`, `resolution` `480p`/`720p`/`1080p`, `duration` (s), `camera_fixed`, `seed` | 5–12 s | token-based; exact rate unverified |
| `fal-ai/bytedance/seedance/v1/lite/text-to-video` · `/v1/lite/image-to-video` | t2v / i2v | as above (+ `end_image_url` on lite i2v) | — | unverified |
| `fal-ai/bytedance/seedance/v1.5/pro/text-to-video` · `/v1.5/pro/image-to-video` | t2v / i2v, audio | as above + `generate_audio` | — | ≈$0.26 per 5 s 720p with audio; $2.40 per 1M video tokens with audio, $1.20 without; tokens = (h×w×fps×duration)/1024 (https://fal.ai/models/fal-ai/bytedance/seedance/v1.5/pro/image-to-video) |
| `bytedance/seedance-2.0/text-to-video` · `bytedance/seedance-2.0/image-to-video` (**no `fal-ai/` prefix**, Fast and Standard tiers) | t2v / i2v, audio | `prompt`, `image_url`, `resolution`, `duration` 4–15 s | — | ≈$0.30/s; 10 s 720p ≈ $2.42 Fast / $3.02 Standard incl. audio (https://fal.ai/seedance-2.0) |
| `bytedance/seedance-2.5/image-to-video` (+ `/text-to-video`, unverified) | i2v / t2v, audio | `duration` 4–30 s, 24 fps, 480p/720p | — | ≈$0.2205/s at 480p, ≈$0.4730/s at 720p (https://fal.ai/models/bytedance/seedance-2.5/image-to-video) |
| `fal-ai/kling-video/v2.5-turbo/pro/text-to-video` · `/image-to-video` | t2v / i2v | `prompt`, `image_url`, `duration` `"5"`/`"10"`, `aspect_ratio`, `negative_prompt`, `cfg_scale`, `tail_image_url` | 5/10 s | $0.35 first 5 s, then $0.07/s (https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/text-to-video) |
| `fal-ai/kling-video/v2.6/pro/text-to-video` · `/image-to-video` | t2v / i2v, native audio | as above + `generate_audio`, voice control | — | $0.07/s (no audio), $0.14/s (audio), $0.168/s (audio + voice control) (https://fal.ai/models/fal-ai/kling-video/v2.6/pro/text-to-video) |
| `fal-ai/kling-video/v3/turbo/pro/{text-to-video,image-to-video}` (1080p) · `fal-ai/kling-video/v3/turbo/standard/...` (720p) | t2v / i2v, audio | — | — | per second; rates unverified |
| `fal-ai/veo3.1` (t2v) · `fal-ai/veo3.1/image-to-video` · `fal-ai/veo3.1/reference-to-video` · `fal-ai/veo3.1/fast`, `/fast/image-to-video`, `/fast/reference-to-video` · `fal-ai/veo3.1/lite`, `/lite/image-to-video` | t2v / i2v / ref2v, audio | `prompt`, `image_url`, `aspect_ratio` 16:9/9:16, `duration` (`"8s"`), `resolution` 720p/1080p/4k, `generate_audio`, `negative_prompt`, `seed`, `last_frame_url` | 8 s clips | Veo 3.1: $0.20/s no audio, $0.40/s audio (720p/1080p); 4K $0.40/$0.60. Fast: $0.10/$0.15; 4K $0.30/$0.35. Lite: unverified (https://fal.ai/models/fal-ai/veo3.1/image-to-video, /fast/image-to-video) |
| `fal-ai/veo3` · `fal-ai/veo3/fast` · `/image-to-video` | t2v / i2v, audio | as above | 8 s | $0.20/$0.40 per s; fast $0.10/$0.15 (https://fal.ai/models/fal-ai/veo3/fast/image-to-video) |
| `fal-ai/wan/v2.2-a14b/text-to-video` · `/image-to-video` · `/video-to-video` · `fal-ai/wan/v2.2-5b/text-to-video` | t2v / i2v / v2v | `prompt`, `image_url`, `resolution` 480p/580p/720p, `aspect_ratio`, `num_frames`, `frames_per_second`, `enable_prompt_expansion` | — | $0.08/s 720p, $0.06/s 580p, $0.04/s 480p (https://fal.ai/models/fal-ai/wan/v2.2-a14b/text-to-video) |
| Wan 2.5 / 2.6 / 2.7 (ids unverified: `fal-ai/wan-25-preview/...`, `fal-ai/wan/v2.6/...`, Wan 2.7 t2v/i2v/reference-to-video/video-edit) | t2v / i2v / ref2v / edit, native audio | 720p/1080p, 2–15 s | — | Wan 2.7: $0.10/s 720p, $0.15/s 1080p (https://fal.ai/wan-3 page comparison) |
| Wan 3 (id unverified, see https://fal.ai/wan-3) | t2v / i2v / ref2v, audio | 480p/720p/1080p | — | $0.05/s 480p, $0.10/s 720p, $0.20/s 1080p |
| `fal-ai/hunyuan-video` | t2v | `prompt`, `aspect_ratio`, `resolution`, `num_frames` | — | $0.40/video (https://fal.ai/models/fal-ai/hunyuan-video/playground); Hunyuan 1.5/2 ids unverified |
| `fal-ai/ltx-video` (preview) | t2v | — | — | $0.02/video |
| `fal-ai/ltx-2/text-to-video` · `/fast` · `fal-ai/ltx-2/image-to-video` · `/fast` | t2v / i2v, audio | `resolution` 1080p/1440p/2160p, `duration`, `fps`, `generate_audio` | — | Pro $0.06/s 1080p, $0.12/s 1440p, $0.24/s 2160p; Fast $0.04/$0.08/$0.16 (https://fal.ai/models/fal-ai/ltx-2/text-to-video) |
| `fal-ai/ltx-2.3/text-to-video` · `/fast` · `fal-ai/ltx-2.3/extend-video` | t2v / extend | as LTX-2 | — | same tiers as LTX-2 (https://fal.ai/models/fal-ai/ltx-2.3/text-to-video) |
| `fal-ai/minimax/hailuo-2.3/standard/image-to-video` (768p) · `fal-ai/minimax/hailuo-2.3/pro/image-to-video` (1080p) (+ text-to-video variants, `fal-ai/minimax/hailuo-02/...`) | i2v / t2v | `prompt`, `image_url`, `duration` 6/10, `prompt_optimizer` | 1080p 6 s or 768p 10 s | ≈$0.49/video (pro; snippet) — per-tier prices unverified |
| Grok Imagine video (`xai/grok-imagine-video/...`, id unverified) | t2v / i2v, audio | — | — | unverified |
| Sora 2 (`fal-ai/sora-2/text-to-video`, `/image-to-video`, `/pro` — ids unverified) | t2v / i2v, audio | — | — | unverified |

## Endpoints (exact)
All JSON (`Content-Type: application/json`, `Accept: application/json`), `Authorization: Key <key>`.

### Queue (recommended) — async
- **Submit:** `POST https://queue.fal.run/{endpoint_id}` (e.g. `POST https://queue.fal.run/fal-ai/flux/dev`, or with a sub-path `POST https://queue.fal.run/fal-ai/flux/dev/image-to-image`). Body = the model's input JSON. Optional query `?fal_webhook=https://your.host/hook` (fal-js: `query: { fal_webhook: webhookUrl }`).
  Response `200`: `{"request_id":"<uuid>","status":"IN_QUEUE","queue_position":0,"response_url":"https://queue.fal.run/fal-ai/flux/requests/<id>","status_url":"https://queue.fal.run/fal-ai/flux/requests/<id>/status","cancel_url":"https://queue.fal.run/fal-ai/flux/requests/<id>/cancel"}` (docs snippet lists `request_id`, `response_url`, `status_url`, `cancel_url`; a `gateway_request_id` field appears in some mirrors — unverified).
- **Status:** `GET https://queue.fal.run/{owner}/{alias}/requests/{request_id}/status[?logs=1]`. Response `{"status":"IN_QUEUE","queue_position":3,"response_url":"..."}` → `{"status":"IN_PROGRESS","logs":[{"timestamp":"...","message":"...","level":"INFO"}]}` → `{"status":"COMPLETED","logs":[...],"metrics":{"inference_time":1.23}}`. Status values in the official clients are exactly `IN_QUEUE` | `IN_PROGRESS` | `COMPLETED` (`fal_client.Queued/InProgress/Completed`; fal-js `status === 'COMPLETED'`). Failures surface when fetching the result (non-2xx with `{"detail": ...}`), and the Python `Completed` dataclass also carries optional `error` / `error_type`. Third-party mirrors list `FAILED`/`CANCELED` — treat unknown statuses as terminal-error and fetch the result to get the detail.
  `logs=1` adds `logs[]`; `logs=0` (default) omits them (fal-js sends `logs: "1"|"0"`).
- **Status stream (SSE):** `GET https://queue.fal.run/{owner}/{alias}/requests/{request_id}/status/stream` — emits status JSON until completed (fal-js `streamStatus`). Handy but optional; polling is fine.
- **Result:** `GET https://queue.fal.run/{owner}/{alias}/requests/{request_id}` → the model's output JSON, e.g. `{"images":[{"url":"https://v3.fal.media/files/.../out.png","width":1024,"height":768,"content_type":"image/png"}],"seed":271828,"timings":{"inference":0.83},"has_nsfw_concepts":[false],"prompt":"..."}`; video models return `{"video":{"url":"...mp4","content_type":"video/mp4","file_size":...}}`. Some outputs also carry `file_name`, `file_data` (inline base64 when `sync_mode: true`), `file_size`, `nsfw_content_detected`. Whether fetching before completion returns `202` or `400` is unverified — only fetch after `COMPLETED`.
- **Cancel:** `PUT https://queue.fal.run/{owner}/{alias}/requests/{request_id}/cancel` (PUT, not POST). Only effective while `IN_QUEUE`; response body/status codes unverified (mirror: `200 {"status":"CANCELED"}`, `409` if already finished).
- **Sub-path rule (gotcha):** the status/result/cancel paths use only `owner/alias` (first two segments) — fal-js builds them from `${appId.owner}/${appId.alias}` and drops the rest of the path. For `fal-ai/flux/dev/image-to-image` the submit URL is the full path but status/result live at `.../fal-ai/flux/requests/{id}/...`. Simplest: **use the `status_url` / `response_url` / `cancel_url` returned by submit verbatim.** Model ids without the `fal-ai/` owner (e.g. `bytedance/seedance-2.0/text-to-video`) follow the same rule.
- **Polling interval:** fal-js default `DEFAULT_POLL_INTERVAL = 500` ms; for video use 2–5 s with backoff.
- **Timeouts:** `X-Fal-Request-Timeout` header sets a *start* timeout (how long the request may wait in queue before failing) — documented on the reliability page; exact unit/format unverified (seconds). Queue requests are automatically retried by fal on 503/504/connection errors/429 (https://docs.fal.ai/model-apis/model-endpoints/reliability).
- **Output retention header:** `X-Fal-Object-Lifecycle-Preference: {"expiration_duration_seconds": 86400}` (or `null` for no expiration) controls how long generated files stay on `v3.fal.media` (https://fal.ai/docs/documentation/model-apis/media-expiration).

### Sync — `POST https://fal.run/{endpoint_id}`
Same body/headers; response is the output JSON directly. Documented drawbacks (https://docs.fal.ai/model-apis/model-endpoints/synchronous-requests): connection must stay open, cannot be interrupted, if the connection drops the result is lost, **you are charged even if you never receive it**, and there are no server-side retries. Use only for fast image models (schnell, nano-banana) behind a short client timeout; never for video.

### Webhooks (https://docs.fal.ai/model-apis/model-endpoints/webhooks)
- Register per request via `?fal_webhook=<https url>` on submit. fal `POST`s JSON when the request finishes:
  `{"request_id":"...","gateway_request_id":"...","status":"OK","payload":{...model output...}}` on success, or `{"request_id":"...","status":"ERROR","error":"...","payload":{...}}` / `payload_error` when the payload could not be delivered. Note `status` here is `OK`/`ERROR`, **not** the queue's `IN_QUEUE/IN_PROGRESS/COMPLETED`.
- Headers: `X-Fal-Webhook-Request-Id`, `X-Fal-Webhook-User-Id`, `X-Fal-Webhook-Timestamp`, `X-Fal-Webhook-Signature` (ED25519; verify against the JWKS at `https://rest.alpha.fal.ai/.well-known/jwks.json`, each key's `x` is a base64url ED25519 public key; cache ≤24 h). Signed message construction and the retry schedule are unverified — check the page.
- Not usable from a pure SPA; only relevant if the Worker ever gets a `/api/webhooks/fal` route.

### Storage upload (input files) — `rest.fal.ai`
From `fal-js` `libs/client/src/storage.ts` (Python client identical):
1. `POST https://rest.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3` with `Authorization: Key …`, body `{"file_name":"photo.png","content_type":"image/png"}` → `{"upload_url":"https://...signed...","file_url":"https://v3.fal.media/files/.../photo.png"}`.
2. `PUT <upload_url>` with the raw bytes and `Content-Type: <mime>` (no auth header).
3. Pass `file_url` as `image_url` etc. in the model input.
Files > 90 MB: `POST .../storage/upload/initiate-multipart?storage_type=fal-cdn-v3` → upload 10 MB parts → `POST .../complete` (fal-js). Size limits for single PUT are unverified. The docs mirror lists the same endpoint on `rest.alpha.fal.ai`.

### Model catalog / search — Platform API (https://docs.fal.ai/platform-apis/v1/models)
`GET https://api.fal.ai/v1/models` — auth optional (an `API`-scope key raises rate limits). Three modes: **list** (no params; paginated with `?cursor=<next_cursor>&limit=N`, response has `next_cursor` (string|null) and `has_more`), **find** (`?endpoint_id=fal-ai/flux/dev`, repeatable, 1–50 ids), **search** (free-text query, category, status filters — exact parameter names unverified; likely `q`/`search`, `category`, `status`). `?expand=openapi-3.0` includes the model's full OpenAPI 3.0 schema in an `openapi` field; `?expand=enterprise_status` adds `ready|pending`. Metadata includes capability tags and pricing per output per the API description — field names unverified. This is the endpoint to power a live model picker and per-model form generation.

## Input media
- **Public URL** (any https, including `v3.fal.media`), or **base64 data URI** in the same field (`"image_url": "data:image/png;base64,..."`) — officially supported ("You can pass a Base64 data URI as a file input… for large files this can impact request performance"), or **fal storage upload** (above). fal-js `fal.storage.upload(File)` auto-uploads binary inputs (`storage.transformInput`).
- Field names vary per model: `image_url` (single), `image_urls[]` (multi-ref: FLUX.2 edit, Seedream edit, Nano Banana edit), `mask_url` (inpainting), `end_image_url` / `tail_image_url` / `last_frame_url` (video end frames), `video_url`, `audio_url`.
- A documented `file_too_large` error exists with `max_size` context `10485760` (10 MB) on some endpoints (https://docs.fal.ai/model-apis/errors) — prefer the storage upload for anything above ~1–2 MB rather than inlining base64.

## Output media
- URLs on `https://v3.fal.media/files/...` (older `fal.media`), public to anyone with the link until expiry. Default expiry is not stated on the media-expiration page (it only documents the `X-Fal-Object-Lifecycle-Preference` override; expired files are deleted permanently). Request/response JSON is kept 30 days by default (dashboard history).
- Content types: `image/png`, `image/jpeg`, `image/webp` per `output_format`; video `video/mp4`. With `sync_mode: true` many image endpoints return `file_data` (base64) instead of a CDN URL.
- CORS on `v3.fal.media` for `fetch()` from the SPA: unverified. `<img src>` works regardless; for saving blobs route through the Worker `/api/fetch?url=` with `*.fal.media` allowlisted (already in PLAN.md).

## Rate limits, quotas, free tier
- **Concurrency** (not RPM) is the primary limit: new accounts 2 concurrent requests, scaling automatically up to 40 based on paid invoices in the last four weeks; excess requests wait in the queue and are never rejected for concurrency (https://fal.ai/docs/documentation/model-apis/concurrency-limits). Some models also have per-model limits.
- `429` = "Concurrency or per-key rate limit exceeded" (queue retries it automatically); `402` = insufficient credits (mirror; unverified code); `422` = input validation `{"detail":[{"loc":[...],"msg":"...","type":"..."}]}`; `401` = bad/missing `Authorization: Key`.
- Credits: prepaid; purchased credits expire after 365 days; promotional credits vary.

## Gotchas
- `Authorization: Key …` — a `Bearer` header is rejected with 401.
- Status/result/cancel URLs strip endpoint sub-paths (see above); don't build them from the full id.
- Two id conventions coexist: `fal-ai/<vendor>/<model>/...` and newer `<vendor>/<model>/...` without `fal-ai/` (Seedance 2.x, Seedream 5 Pro). Never assume the `fal-ai/` prefix.
- fal moves fast: e.g. Seedream 5.0 Pro (Jul 2026), Seedance 2.0/2.5, Kling 3, Wan 2.7/3, LTX-2.3, Nano Banana 2 all appeared in the last year. Use `GET api.fal.ai/v1/models` to keep the picker current instead of hard-coding.
- Sync `fal.run` bills even if the connection drops; the queue is the only safe path for video.
- Webhook `status` is `OK`/`ERROR`; queue status is upper-snake. Don't share an enum.
- Video pricing is per output second and often differs with/without audio and by resolution — the UI cost estimate must take `generate_audio` and `resolution` into account.
- `image_size` accepts named presets or `{width,height}`; aspect-ratio-only models (Veo, Kling, Ultra) use `aspect_ratio` strings instead.
- `has_nsfw_concepts[]` / `nsfw_content_detected[]` are returned per image; blurred/blocked outputs still bill.

## Adapter mapping notes
- Transport: Worker proxy route `/api/proxy/fal/*` allowlisting `queue.fal.run`, `fal.run`, `rest.fal.ai`, `rest.alpha.fal.ai`, `api.fal.ai`; forward `authorization`, `content-type`, `accept`, `x-fal-*` headers (mirrors what `@fal-ai/server-proxy` forwards: it whitelists `x-fal-*` request headers, injects `Authorization: Key $FAL_KEY`, validates the `x-fal-target-url` host against `*.fal.ai`/`fal.run` patterns, and strips `content-length`/`content-encoding` from responses). Our proxy differs only in taking the key from the request instead of an env var. If CORS confirms, `direct` mode can skip the proxy entirely.
- Optional shortcut: use `@fal-ai/client` in the SPA with `fal.config({ proxyUrl: '/api/proxy/fal', requestMiddleware })` — the client sends the real target URL in `x-fal-target-url` when `proxyUrl` is set, so the Worker can implement fal's proxy contract (`TARGET_URL_HEADER = "x-fal-target-url"`, default route `/api/fal/proxy`) and get `subscribe`, `queue.*`, `storage.upload` for free.
- Job model: submit → store `request_id` + `status_url`/`response_url`/`cancel_url` → poll status (500 ms images, 3 s video, backoff) → on `COMPLETED` GET result → collect `images[].url` / `video.url` → stream through `/api/fetch`. Cancel = `PUT cancel_url`.
- Capability → endpoint: t2i = family base id; edit = `/edit`, `/kontext`, `/image-to-image`, `/inpainting` sub-endpoints with `image_url`/`image_urls`/`mask_url`; i2v = `/image-to-video` with `image_url`; extend = `/extend-video`; upscale = upscaler ids.
- Param translation: our `size` → `image_size` `{width,height}` (or nearest preset) for FLUX/Seedream/Qwen; our `aspect` → `aspect_ratio` for Veo/Kling/Ultra/Ideogram; our `duration` → `duration` (number of seconds on Seedance/Wan/LTX, string `"5"|"10"` on Kling, `"8s"` on Veo); our `resolution` → `resolution` (`480p|720p|1080p|4k`); `seed`, `negative_prompt`, `guidance_scale`/`cfg_scale` pass through; `audio` toggle → `generate_audio`.
- Input blobs: ≤1 MB inline as data URI; otherwise storage initiate + PUT (needs the proxy or CORS on `rest.fal.ai` and the signed upload host — allowlist `*.fal.media`).
- Model picker: seed with the curated list above, refresh from `GET api.fal.ai/v1/models` (search mode + `expand=openapi-3.0`) to render per-model forms and show fal's price strings.
- Special UI: per-second video pricing with audio/resolution multipliers; multi-image reference inputs (`image_urls`, up to 8–10 on Seedream/FLUX.2); `rendering_speed` for Ideogram; vector style flag for Recraft.
