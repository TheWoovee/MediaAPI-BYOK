# Hugging Face Inference Providers

- Website / docs: https://huggingface.co/docs/inference-providers/index · pricing https://huggingface.co/docs/inference-providers/pricing · Hub API https://huggingface.co/docs/inference-providers/hub-api · tasks https://huggingface.co/docs/inference-providers/tasks/text-to-image , /tasks/image-to-image , /tasks/text-to-video · providers https://huggingface.co/docs/inference-providers/providers/hf-inference , /providers/fal-ai · security https://huggingface.co/docs/inference-providers/security · tokens https://huggingface.co/docs/hub/security-tokens · Hub rate limits https://huggingface.co/docs/hub/rate-limits
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter). NOTE: huggingface.co is blocked by this sandbox's egress proxy, so every statement below was verified against the docs' source of truth on GitHub (`huggingface/hub-docs` @ main, `docs/inference-providers/*.md`, `docs/hub/*.md`) and against the official JS SDK source (`huggingface/huggingface.js` @ main, `packages/inference/src/**`). Nothing was tested live against the router.
- Adapter id: `hf-inference-providers`  ·  Transport: `proxy` (CORS unverified, see below; switch to `direct` if a live preflight succeeds)  ·  Priority wave: 2

## Account and authentication
- Key: any Hugging Face account → https://huggingface.co/settings/tokens . Docs recommend a **fine-grained** token with the permission **"Make calls to Inference Providers"** (deep link used in the docs: `https://huggingface.co/settings/tokens/new?ownUserPermissions=inference.serverless.write&tokenType=fineGrained`). The quick-start also says a plain `read` token works (`hf auth login # get a read token from hf.co/settings/tokens`). Source: inference-providers/index.md "Authentication"; tasks/text-to-image.md header table ("personal user access token with 'Inference Providers' permission").
- Auth header: `Authorization: Bearer hf_xxxxxxxx` (the task pages literally write `'Bearer: hf_****'` but the code samples and the SDK use `Bearer hf_...` without the colon).
- Optional header `X-HF-Bill-To: <org-name-or-resource-group-id>` to bill a Team/Enterprise org instead of the user (pricing.md "Billing for Team and Enterprise organizations").
- Free credits: $0.10/month for free accounts (see "Rate limits, quotas, free tier").
- Base URLs (huggingface.js `packages/inference/src/config.ts`):
  - Router: `https://router.huggingface.co`
  - Per-provider prefix: `https://router.huggingface.co/{provider}/...` where `{provider}` is one of the provider slugs (`hf-inference`, `fal-ai`, `replicate`, `together`, `nscale`, `novita`, `wavespeed`, `nebius`, `fireworks-ai`, …). The SDK builds `makeBaseUrl = HF_ROUTER_URL + "/" + provider` whenever the key starts with `hf_`; with a provider's own key it calls the provider's own base URL directly (e.g. `https://queue.fal.run`, `https://api.replicate.com`) — providerHelper.ts `makeBaseUrl`.
  - OpenAI-compatible (chat only): `https://router.huggingface.co/v1` (`/v1/chat/completions`, `/v1/models`, `/v1/models/{id}`).
  - Hub (discovery): `https://huggingface.co/api/...`
- Regions: none selectable; HF proxies to the provider.

## Browser (CORS) behaviour
- Result: **unknown / untested**. `curl -X OPTIONS https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-dev -H "Origin: https://www.thewoovee.com" -H "Access-Control-Request-Method: POST" -H "Access-Control-Request-Headers: authorization,content-type"` returned `HTTP/1.1 403 Forbidden` **from the sandbox egress proxy** (CONNECT to huggingface.co / router.huggingface.co is policy-denied here), so no `Access-Control-Allow-Origin` header could be observed. Same for `https://huggingface.co/api/models?...` (Hub API used for discovery).
- Circumstantial only: the official `@huggingface/inference` JS client is documented as usable "in browser-based projects" and has an `includeCredentials` fetch option, and Hub inference widgets call the router from the browser (but from the huggingface.co origin). Treat as `proxy` until a real preflight from https://www.thewoovee.com is captured. The Hub API (`huggingface.co/api/*`) is also untested for CORS.

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | Yes | task `text-to-image`; providers per partner table (index.md): fal-ai, hf-inference, nscale, replicate, together, wavespeed (nebius also appears in Hub filters). `POST https://router.huggingface.co/{provider}/...` |
| image→image / edit / inpaint | Yes | task `image-to-image` (FLUX.1-Kontext-dev, Qwen-Image-Edit, FLUX.2-dev via fal-ai/replicate/wavespeed). Mask-based inpaint: no dedicated task documented — unverified |
| upscale | Partial | Only via image-to-image models that upscale ("Increasing the resolution of an image" is listed as an example application) — no dedicated task; unverified |
| text→video | Yes | task `text-to-video`; providers fal-ai, novita, replicate, together, wavespeed (partner table). Async on the provider side but the router+SDK hide the polling (fal queue) |
| image→video | Yes (SDK) | huggingface.js has `FalAIImageToVideoTask` (task `image-to-video`, payload `image_url` data-URI + `prompt`) and `image-text-to-video`; Hub filter `pipeline_tag=image-to-video`. No dedicated docs page fetched — unverified |
| video→video / extend | No | not a documented task |
| audio in video | No | not a documented parameter |

## Models
Prices are pass-through from the provider ("no markup"); HF does not publish a per-model image/video price table, so the Price column is left "provider rate (unverified)". Provider model ids come from `inferenceProviderMapping` (see Endpoints).

| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| `black-forest-labs/FLUX.1-dev` | text→image | fal-ai `fal-ai/flux/dev`, replicate `black-forest-labs/flux-dev`, wavespeed `wavespeed-ai/flux-dev`; params `width`,`height`,`guidance_scale`,`num_inference_steps`,`seed`,`negative_prompt` (task spec) | provider-defined | provider rate (unverified) |
| `black-forest-labs/FLUX.1-schnell` | text→image | nscale (`black-forest-labs/FLUX.1-schnell`), fal-ai; 1–4 steps | provider-defined | provider rate (unverified) |
| `black-forest-labs/FLUX.1-Krea-dev` | text→image | recommended model on the task page | — | provider rate (unverified) |
| `Qwen/Qwen-Image` | text→image | recommended model on the task page | — | provider rate (unverified) |
| `stabilityai/stable-diffusion-3-medium-diffusers` | text→image | the only text-to-image example for provider `hf-inference` | hf-inference is mostly CPU since July 2025; expect cold/slow | compute-time × hardware price, e.g. 10 s × $0.00012/s = $0.0012 (pricing.md example) |
| `black-forest-labs/FLUX.1-Kontext-dev` | image→image | recommended edit model; `parameters.prompt`, `guidance_scale`, `num_inference_steps`, `target_size{width,height}` | — | provider rate (unverified) |
| `Qwen/Qwen-Image-Edit` | image→image | used in the official image-editor guide with provider `fal-ai` (`client.image_to_image(model="Qwen/Qwen-Image-Edit")`) | — | provider rate (unverified) |
| `black-forest-labs/FLUX.2-dev` | image→image (+t2i) | replicate `black-forest-labs/flux-2-dev`; fal endpoints expect `image_urls` (array) — SDK sends both `image_url` and `image_urls` | — | provider rate (unverified) |
| `Wan-AI/Wan2.2-TI2V-5B` | text→video | fal-ai `fal-ai/wan/v2.2-5b/text-to-video`, replicate `wan-video/wan-2.2-5b-fast`; params `num_frames`, `guidance_scale`, `num_inference_steps`, `seed`, `negative_prompt[]` | — | provider rate (unverified) |
| `tencent/HunyuanVideo`, `Lightricks/LTX-Video-0.9.8-13B-distilled` | text→video | recommended on the task page | — | provider rate (unverified) |

## Endpoints (exact)
All routed requests are `POST`, `Authorization: Bearer hf_…`, `Content-Type: application/json` unless a raw binary body is sent. The router prefix selects the provider; the model id in the path/body must be the **provider's** id (`providerId`), not necessarily the HF repo id. There is **no** documented "provider/model" model-id syntax for these task endpoints; the `:provider` / `:fastest` / `:cheapest` / `:preferred` suffixes are documented only for the OpenAI-compatible chat endpoint's `model` field (index.md "Provider Selection"; "This OpenAI-compatible endpoint is currently available for chat completion tasks only").

### 0. Resolve model → provider (Hub API, GET, no auth needed for public models; add the token to get your own rate limits)
- `GET https://huggingface.co/api/models/{hf_model_id}?expand[]=inferenceProviderMapping`
  Response (hub-api.md): `{"_id":…, "id":"google/gemma-3-27b-it", "inferenceProviderMapping": {"featherless-ai": {"status":"live","providerId":"google/gemma-3-27b-it","task":"conversational","isModelAuthor":false}, "scaleway": {...}}}`. `status` is `live` or `staging`; `task` is the pipeline tag (`text-to-image`, `image-to-image`, `text-to-video`, …); optional `adapter: "lora"` + `adapterWeightsPath` for LoRA repos (huggingface.js normalizes both the object form and a future array form `[{provider, providerId, status, task, adapter, adapterWeightsPath}]`).
- `GET https://huggingface.co/api/models/{id}?expand[]=inference` → `"inference":"warm"` or the key is absent.
- List: `GET https://huggingface.co/api/models?inference_provider=fal-ai&pipeline_tag=text-to-image` ; multiple providers `inference_provider=nscale,novita` ; any provider `inference_provider=all` ; combine with `&sort=trending&limit=…`. Example output for `inference_provider=all&pipeline_tag=text-to-video`: `Wan-AI/Wan2.1-T2V-14B`, `Lightricks/LTX-Video`, `tencent/HunyuanVideo`, …
- Default model per task: `GET https://huggingface.co/api/tasks` (SDK `loadDefaultModel`).
- Chat-only listing with pricing/latency: `GET https://router.huggingface.co/v1/models` (fields `providers[].provider|status|pricing{input,output}|context_length|throughput|is_model_author`).

### 1. Text-to-image, provider `hf-inference` (sync, binary response)
- `POST https://router.huggingface.co/hf-inference/models/{hf_model_id}`
- Body: `{"inputs": "a serene lake at sunset", "parameters": {"guidance_scale": 3.5, "negative_prompt": "blurry", "num_inference_steps": 28, "width": 1024, "height": 1024, "scheduler": "…", "seed": 42}}` (all `parameters` optional; tasks/text-to-image.md).
- Response: **raw image bytes** in the body ("The generated image returned as raw bytes in the payload"). huggingface.js additionally tolerates JSON `{"data":[{"b64_json":…}]}` or `{"output":[url]}` from hf-inference; `outputType: "url"` is explicitly not supported for hf-inference.
- Sync; no polling, no webhook, no cancel. Expect long first-call latency (model load) and 503 while loading (legacy behaviour; unverified for the router).

### 2. Text-to-image, provider `fal-ai` (queue, polled)
- Submit: `POST https://router.huggingface.co/fal-ai/{providerId}?_subdomain=queue` e.g. `https://router.huggingface.co/fal-ai/fal-ai/flux/dev?_subdomain=queue` (fal-ai.ts `FalAiQueueTask.makeRoute`).
- Body: fal-native JSON — the SDK flattens `parameters` and renames `inputs`→`prompt`: `{"prompt": "...", "num_inference_steps": 28, "guidance_scale": 3.5, "seed": 42, "image_size": {"width":1024,"height":1024} /* fal param names */ , "loras":[{"path":"https://huggingface.co/{repo}/resolve/main/{file}","scale":1}]}` (loras only when the mapping has `adapter:"lora"`).
- Response: `{"request_id": "...", "status": "IN_QUEUE", "response_url": "https://queue.fal.run/fal-ai/flux/dev/requests/<id>", "status_url": "..."}` (type `FalAiQueueOutput`).
- Poll: the SDK rebuilds URLs on the router: `statusUrl = https://router.huggingface.co/fal-ai + pathname(response_url) + "/status?_subdomain=queue"`, `resultUrl = https://router.huggingface.co/fal-ai + pathname(response_url) + "?_subdomain=queue"`; `GET statusUrl` every **500 ms** until `status === "COMPLETED"`, then `GET resultUrl` → `{"images":[{"url":"https://…","width":…,"height":…}], "seed":…}`. Client then downloads `images[0].url`.
- Cancel/webhooks: not exposed through the router (unverified).

### 3. Text-to-image, provider `replicate` (sync-ish)
- `POST https://router.huggingface.co/replicate/v1/models/{providerId}/predictions` (or `/replicate/v1/predictions` with `{"version": "<hash>"}` when providerId contains `:`), headers add `Prefer: wait` (replicate.ts).
- Body: `{"input": {"prompt": "...", ...parameters}, "version": undefined|hash}`; response `{"output": "https://…" | ["https://…"]}` (may still be a non-terminal prediction if `wait` times out — unverified through the router).

### 4. Text-to-image, providers `together` / `nscale`
- `POST https://router.huggingface.co/together/v1/images/generations` and `POST https://router.huggingface.co/nscale/v1/images/generations` (huggingface.js `together.ts`, `nscale.ts` `makeRoute`). These are **provider-side** OpenAI-style routes behind the provider prefix; body shape per provider (typically `{"model": providerId, "prompt": …, "response_format": "base64"}` — payload details unverified here).
- A router-level `https://router.huggingface.co/v1/images/generations` (auto-routing like chat) is **not documented** anywhere in hub-docs; the docs say the OpenAI-compatible endpoint is chat-only. Treat as unavailable (unverified).

### 5. Image-to-image
- hf-inference: `POST https://router.huggingface.co/hf-inference/models/{hf_model_id}`. Either raw image bytes as the body (only when no `parameters`), or JSON `{"inputs": "<base64 image, no data: prefix>", "parameters": {"prompt": "...", "guidance_scale": 2.5, "negative_prompt": "...", "num_inference_steps": 28, "target_size": {"width": 1024, "height": 1024}}}` (tasks/image-to-image.md; hf-inference.ts `HFInferenceImageToImageTask`). Response: raw image bytes.
- fal-ai: same queue flow as §2 at `POST https://router.huggingface.co/fal-ai/{providerId}?_subdomain=queue`; body `{"prompt": ..., "image_url": "data:image/png;base64,....", "image_urls": ["data:…"], ...parameters}` (SDK sends both keys because e.g. FLUX.2-dev expects the array). Result `{"images":[{"url":…}]}`.
- replicate: `POST …/replicate/v1/models/{providerId}/predictions` with `{"input": {"prompt": ..., "input_image": "data:…" /* field name provider-specific */}}` — exact field unverified.

### 6. Text-to-video
- Body (task spec): `{"inputs": "prompt", "parameters": {"num_frames": 81, "guidance_scale": 5, "negative_prompt": ["…"], "num_inference_steps": 30, "seed": 1}}`. Response for the SDK: **raw video bytes** ("The generated video returned as raw bytes in the payload") — in practice the SDK downloads `result.video.url`.
- fal-ai: queue flow as §2 (`FalAITextToVideoTask`, base `https://queue.fal.run`, router route `/fal-ai/{providerId}?_subdomain=queue`); final result `{"video": {"url": "https://…mp4"}}`.
- replicate / novita / together / wavespeed: provider-native async APIs behind the same prefix; novita returns `NovitaAsyncAPIOutput` (polled) — details unverified.
- image-to-video (fal-ai, SDK only): body `{"prompt": ..., "image_url": "data:<mime>;base64,…", ...parameters}`; result `{"video":{"url":…}}`.

### 7. OpenAI-compatible chat (for completeness)
- `POST https://router.huggingface.co/v1/chat/completions` with `"model": "openai/gpt-oss-120b:fastest|:cheapest|:preferred|:groq"`. Default policy `:fastest`. Not usable for images/video.

Polling interval recommendation: 500 ms (SDK default) for fal; back off to 1–2 s in the browser. Webhooks: none through the router. Cancel: none through the router.

## Input media
- hf-inference image-to-image: raw bytes body or base64 string in `inputs` (no size limit documented — unverified).
- fal-ai / replicate through the router: images are embedded as **data URIs** in JSON (`image_url`, `image_urls`); the SDK converts Blobs to base64 client-side. Public URLs also work for fal (`image_url: "https://…"`). No documented byte limit — keep inputs ≤ a few MB (unverified).
- No provider upload API is exposed by the router.

## Output media
- hf-inference tasks: bytes in the response body (`image/*`, `video/*`); Content-Type comes from the backend — check the header rather than assuming JPEG (the SDK hard-codes `image/jpeg` only for the `b64_json` JSON variant).
- fal-ai / replicate: JSON with a **provider-hosted URL** (`images[].url`, `video.url`, replicate `output`); expiry not documented by HF (fal CDN URLs are generally short-lived — unverified). Whether those hosts allow browser fetch (CORS) is unverified; the proxy should stream them.
- Data retention: HF does not store request/response bodies; debug logs kept ≤ 30 days (security.md).

## Rate limits, quotas, free tier
- Monthly credits (pricing.md): Free users **$0.10/month (subject to change)**, PRO **$2.00/month**, Team/Enterprise **$2.00 per seat/month** (shared across the org). PRO/Team/Enterprise credits are general compute credits (also Spaces GPU, ZeroGPU overage, Inference Endpoints, Jobs).
- After credits: pay-as-you-go at the provider's rate, no HF markup; **free users must purchase credits** to continue. Usage dashboard: https://huggingface.co/settings/inference-providers/overview ; billing: https://huggingface.co/settings/billing .
- Custom provider keys (https://huggingface.co/settings/inference-providers): requests still go through the router with your HF token, HF swaps the auth, the provider bills you directly, HF credits **do not** apply. (For a BYOK app this means: a user can put their own fal/replicate key in HF settings and keep using a single `hf_` token.)
- Router request rate limits: not documented. Hub API rate limits (discovery calls to huggingface.co/api) per 5-minute window (rate-limits.md, Sept '25): anonymous 500, free 1,000, PRO 2,500, Team 3,000, Enterprise 6,000; 429 with `RateLimit` / `RateLimit-Policy` headers. Always send the token on Hub API calls.
- Model availability: "warm" models only; `staging` mappings are test-only.

## Gotchas
- The per-provider request/response formats differ ("the exact HTTP request may vary between providers"); the SDK hides this. A raw-HTTP adapter must implement at least the hf-inference and fal-ai shapes above and switch on `inferenceProviderMapping[provider].providerId`.
- `provider="auto"` in the SDK = first provider in the mapping, ordered by the user's preference list at hf.co/settings/inference-providers; there is no server-side auto endpoint for image/video tasks.
- hf-inference is now CPU-focused; image generation there is effectively limited to a few legacy models with slow cold starts. Real image/video work goes to fal-ai / replicate / wavespeed / nscale / together / novita.
- fal queue polling through the router requires the `?_subdomain=queue` query on every call (submit, status, result).
- Free credit is tiny ($0.10 ≈ a handful of FLUX images); expect 402-style errors once exhausted (exact status unverified).
- Token scopes: a fine-grained token without "Make calls to Inference Providers" gets 401/403 on the router (exact code unverified).
- `X-HF-Bill-To` only works for Team/Enterprise orgs the token belongs to.

## Adapter mapping notes
- text→image → resolve mapping once (Hub API, cache), then: `hf-inference` → §1 (binary); `fal-ai` → §2 (submit + poll); `replicate` → §3; `together`/`nscale` → §4. Param translation: our `width/height` → hf-inference `parameters.width/height`; fal `image_size:{width,height}` or fal presets (`landscape_4_3`, …); `steps` → `num_inference_steps`; `cfg` → `guidance_scale`; `seed` → `seed`; `negative_prompt` (string) — text-to-video expects an **array**.
- image→image/edit → §5; send the source image as data URI (fal) or base64 `inputs` (hf-inference). No mask parameter in the spec → hide inpaint UI for this provider.
- text→video / image→video → §6 (fal-ai first; require polling UI with ETA unknown). `duration/fps` → `num_frames` (model-specific; e.g. Wan 2.2 5B uses 81 frames @ 24 fps — verify per model).
- UI needs: provider picker per model (from `inferenceProviderMapping`), a "warm models" search box backed by `GET /api/models?inference_provider=all&pipeline_tag=…&sort=trending`, credit-exhausted messaging, optional `X-HF-Bill-To` org field.
- Transport: proxy the router and stream binary responses through; if a live preflight shows `Access-Control-Allow-Origin` for the router, image tasks could go direct, but provider-hosted result URLs may still need the proxy.
