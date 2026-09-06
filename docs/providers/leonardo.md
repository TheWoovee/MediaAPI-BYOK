# Leonardo.Ai (Production API)

- Website / docs: https://docs.leonardo.ai (guides), https://docs.leonardo.ai/reference (API reference, readme.io), commonly used values https://docs.leonardo.ai/docs/commonly-used-api-values, pricing https://leonardo.ai/pricing and https://docs.leonardo.ai/docs/payg-guide, official SDKs `@leonardo-ai/sdk` (npm) / `leonardo-ai-sdk` (PyPI)
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter)
- Adapter id: `leonardo`  ·  Transport: `proxy`  ·  Priority wave: 2

> **Provenance note.** `docs.leonardo.ai`, `leonardo.ai` and `cloud.leonardo.ai` were egress-blocked in the research sandbox. Primary sources: the **official** `@leonardo-ai/sdk` 4.21.3 npm package (published 2026-04-21; Speakeasy-generated from Leonardo's OpenAPI — field names, enums and paths are exact) and the readme.io OpenAPI exports mirrored in github.com/api-evangelist/leonardo-ai `openapi/_original/*.json` (2026-09-04; include Leonardo's own field descriptions). Pricing/limit statements come from the mirror's reconciled plan/rate-limit sheets (citing docs.leonardo.ai pages) and search snippets.

## Account and authentication
- Sign up at app.leonardo.ai → **API Access** page → create a *Production API key* (up to 10 keys per account; the legacy "User API key" is deprecated). The API is **pay-as-you-go**: top up a USD balance (starter credit reported as $5, no expiry — third-party snippet, unverified); consumer app subscriptions do **not** grant API access.
- Auth header: `Authorization: Bearer <api_key>` (official spec `bearerAuth`).
- Base URL: `https://cloud.leonardo.ai/api/rest/v1` (single region).
- `GET /me` → `{"user_details": [{"user": {"id", "username"}, "apiPaidTokens", "apiSubscriptionTokens", "apiConcurrencySlots", "apiPlanTokenRenewalDate", "paidTokens", "subscriptionTokens", ...}]}` — use `apiPaidTokens` (balance in API credits) and `apiConcurrencySlots`.

## Browser (CORS) behaviour
- **Unknown / not testable.** `OPTIONS https://cloud.leonardo.ai/api/rest/v1/generations` with `Origin: https://www.thewoovee.com` was answered `403 Forbidden` by the sandbox egress proxy (CONNECT rejected — `recentRelayFailures` lists `cloud.leonardo.ai:443`), so no `Access-Control-Allow-Origin` observation was possible. Docs contain no CORS statement. Assume `proxy`; verify from a browser. The init-image upload goes to an S3 presigned POST URL whose bucket CORS policy is also unverified.

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | yes | `POST /generations` (Phoenix 1.0/0.9, Lucid Origin, Lucid Realism, FLUX Dev/Schnell/Kontext/FLUX.2 Pro, Ideogram 3.0, GPT Image, Nano Banana, Seedream, SDXL fine-tunes, custom models) |
| image→image / edit / inpaint | yes | `POST /generations` with `init_image_id`+`init_strength`, `init_generation_image_id`, `imagePrompts[]`, `controlnets[]` (Canny/Depth/Pose via `preprocessorId`); Canvas inpaint via `canvasRequest`+`canvasInitId`/`canvasMaskId` (upload via `POST /canvas-init-image`) |
| upscale | yes | `POST /variations/upscale` (creative upscale), `POST /variations/universal-upscaler` (+ Ultra style), `POST /generations-video-upscale` (video) |
| text→video | yes | `POST /generations-text-to-video` (`MOTION2`, `MOTION2FAST`, `VEO3`, `VEO3FAST`, `KLING2_1`, `KLING2_5`) |
| image→video | yes | `POST /generations-image-to-video` (same models; `endFrameImage` on KLING2_1), `POST /generations-motion-svd` (Motion 1.0 / SVD) |
| video→video / extend | partial | `POST /generations-video-upscale` (`sourceGenerationId`, `resolution`); no extend endpoint documented |
| audio in video | yes (Veo 3) | `VEO3` / `VEO3FAST` generate native audio (Leonardo Veo 3 page); Motion 2.0 and Kling are silent |
| other | yes | `POST /variations/unzoom`, `POST /variations/nobg`, `POST /prompt/improve`, `POST /prompt/random`, `POST /pricing-calculator`, Blueprints, Elements/LoRA, model training, 3D texture endpoints |

## Models
Model ids for `POST /generations` are **UUIDs**. The authoritative list is `GET /platformModels` → `{"custom_models": [{"id", "name", "description", "nsfw", "featured", "generated_image": {"id", "url"}}]}` — fetch it at runtime rather than hardcoding. Values found in reachable sources:

| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| `b24e16ff-06e3-43eb-8d33-4416c2d75876` (spec default for `modelId`; "Leonardo Creative" SD1.5 in docs) | t2i / i2i | `width`/`height` 32–1536 (multiple of 8), default 1024×768 | `num_images` 1–8 (1–4 if any side >768) | via `/pricing-calculator` |
| Phoenix 1.0 — `de7d3faf-762f-48e0-b3b7-9d0ac3a3fcf3` (third-party listing, developer.puter.com; **unverified**) | t2i / i2i | `contrast` ∈ {1.0, 1.3, 1.8, 2.5, 3, 3.5, 4, 4.5} (≥2.5 when `alchemy=true`), `alchemy`, `ultra`, `enhancePrompt`, `styleUUID` (docs; not in SDK 4.21.3 — unverified) | | Phoenix billed higher than SDXL (calculator flag `isPhoenix`) |
| Lucid Origin — `7b592283-e8a7-4c5a-9ba6-d18c31f258b9` (third-party listing; **unverified**) | t2i / i2i | Leonardo's 2025 flagship; supports `contrast`, `enhancePrompt`, `ultra` | | via calculator |
| Lucid Realism, FLUX Dev / Schnell / Kontext, FLUX.2 Pro, Ideogram 3.0, GPT Image, Nano Banana, Seedream, SDXL family (Kino XL, Vision XL, Anime XL, Lightning XL…) | t2i (+ i2i where supported) | `sd_version` enum in responses: `v1_5, v2, v3, SDXL_0_8, SDXL_0_9, SDXL_1_0, SDXL_LIGHTNING, PHOENIX, FLUX, FLUX_DEV, KINO_2_0` | | calculator flags `isFluxDev`, `isFluxSchnell`, `isFluxKontext`, `isSDXL`, `isSDXLLightning`, `isUltra` |
| `MOTION2` (Motion 2.0, default) / `MOTION2FAST` | t2v / i2v | `resolution` `RESOLUTION_480` \| `RESOLUTION_720` (calculator); ~5 s clips; `width`/`height` model-dependent; `frameInterpolation`; `elements` (Motion 2 only); seed ≤2147483637 | | `MOTION_VIDEO_GENERATION` in calculator |
| `VEO3` / `VEO3FAST` (Google Veo 3 via Leonardo) | t2v / i2v with audio | `duration` 4 \| 6 \| 8 s (default 8); `resolution` `RESOLUTION_720` only (calculator); seed ≤4294967293 | | `VEO3_MOTION_VIDEO_GENERATION` |
| `KLING2_1` / `KLING2_5` | t2v / i2v | KLING2_5 `duration` 5 \| 10 (default 5); KLING2_1 supports `endFrameImage`; `RESOLUTION_1080` accepted on some models | | via calculator |
| SVD Motion 1.0 (`/generations-motion-svd`) | i2v | `motionStrength` (int) | | `MOTION_SVD_GENERATION` |
| Universal Upscaler / Ultra | upscale | `upscaleMultiplier` 1.0–2.0 (1.5), `creativityStrength` 1–10 (5), `upscalerStyle` `GENERAL` \| `CINEMATIC` \| `2D ART & ILLUSTRATION` \| `CG ART & GAME ASSETS`, `ultraUpscaleStyle` `ARTISTIC` \| `REALISTIC`, `detailContrast` 1–10, `similarity` 1–10 (ultra only) | output ≤20 MP | `UNIVERSAL_UPSCALER(_ULTRA)` |

Pricing is per generation in **API credits** (responses carry `apiCreditCost` — "will be deprecated" — and `cost: {"amount": "...", "unit": "CREDITS" | "DOLLARS"}`). Pre-flight quotes: `POST /pricing-calculator`. Third-party 2026 summaries put typical costs at roughly $0.008–$0.02+ per image depending on model/Alchemy; use the calculator for real numbers.

## Endpoints (exact)
All JSON (`Content-Type: application/json`), all generation endpoints **asynchronous**: they return an id immediately; poll `GET /generations/{id}` (or the variation getters) until `status` is `COMPLETE` or `FAILED`. Status enum (official SDK `JobStatus`): **`PENDING`, `COMPLETE`, `FAILED`**. Webhook callbacks can be configured per API key in the API Access dashboard (docs recommend webhooks over polling; payload details unverified). No cancel endpoint; `DELETE /generations/{id}` deletes a finished generation.

**Image generation**
- `POST https://cloud.leonardo.ai/api/rest/v1/generations` — minimal: `{"prompt": "...", "modelId": "<uuid>", "width": 1024, "height": 768, "num_images": 1}`. Notable optional fields (exact names): `alchemy` (default **true**), `contrast`, `contrastRatio` (0–1, Alchemy), `presetStyle` (enum below), `photoReal` + `photoRealVersion` (`v1`|`v2`) + `photoRealStrength`, `promptMagic` + `promptMagicStrength` + `promptMagicVersion`, `enhancePrompt` + `enhancePromptInstruction`, `ultra` (not with Alchemy), `guidance_scale` (1–20, 7 recommended), `num_inference_steps` (10–60, default 15), `negative_prompt`, `seed`, `sd_version`, `scheduler`, `init_image_id` + `init_strength` (0.1–0.9), `init_generation_image_id`, `imagePrompts` (array of image ids) + `imagePromptWeight`, `controlnets: [{"initImageId", "initImageType": "GENERATED"|"UPLOADED", "preprocessorId": <int>, "strengthType": "Low"|"Mid"|"High"|"Ultra"|"Max", "weight"}]`, `elements: [{akUUID, weight}]`, `userElements`, `transparency` (`disabled`|`foreground_only`), `tiling`, `public`, `highResolution`, `highContrast`, `expandedDomain`, `fantasyAvatar`, `unzoom` + `unzoomAmount`, `upscaleRatio` (Enterprise), `canvasRequest` + `canvasRequestType` + `canvasInitId` + `canvasMaskId`. Response: `{"sdGenerationJob": {"generationId": "<uuid>", "apiCreditCost": 12, "cost": {"amount": "0.012", "unit": "DOLLARS"}}}`.
- `GET /generations/{id}` → `{"generations_by_pk": {"id", "status": "PENDING"|"COMPLETE"|"FAILED", "generated_images": [{"id", "url", "nsfw", "likeCount", "motionMP4URL", "generated_image_variation_generics": [{"id", "status", "transformType", "url"}]}], "modelId", "prompt", "negativePrompt", "imageWidth", "imageHeight", "seed", "presetStyle", "sdVersion", "createdAt", ...}}`. Poll every 3–5 s; images usually complete in 5–30 s.
- `GET /generations/user/{userId}?offset=&limit=`, `DELETE /generations/{id}`.
- `presetStyle` enum (official SDK): `ANIME, BOKEH, CINEMATIC, CINEMATIC_CLOSEUP, CREATIVE, DYNAMIC, ENVIRONMENT, FASHION, FILM, FOOD, GENERAL, HDR, ILLUSTRATION, LEONARDO, LONG_EXPOSURE, MACRO, MINIMALISTIC, MONOCHROME, MOODY, NONE, NEUTRAL, PHOTOGRAPHY, PORTRAIT, RAYTRACED, RENDER_3D, RETRO, SKETCH_BW, SKETCH_COLOR, STOCK_PHOTO, VIBRANT, UNPROCESSED`.

**Init images (image-to-image inputs) — presigned upload flow**
1. `POST /init-image` `{"extension": "png"|"jpg"|"jpeg"|"webp"}` → `{"uploadInitImage": {"id": "<initImageId>", "url": "<S3 presigned POST URL>", "fields": "<JSON string of form fields>", "key": "..."}}`.
2. `POST <url>` as `multipart/form-data` with every key/value from `JSON.parse(fields)` first and the binary as the final `file` part (S3 returns 204).
3. Use `id` as `init_image_id` (generations), `initImageId` (controlnets, universal upscaler), or `imageId` + `imageType: "UPLOADED"` (video).
- `GET /init-image/{id}` → `{"init_images_by_pk": {"id", "url", "createdAt"}}`; `DELETE /init-image/{id}`.
- `POST /canvas-init-image` `{"initExtension", "maskExtension"}` → two presigned uploads (`initImageId/initUrl/initFields`, `maskImageId/maskUrl/maskFields`) for canvas inpainting.

**Video**
- `POST /generations-text-to-video` — `{"prompt"*, "model": "MOTION2"|"MOTION2FAST"|"VEO3"|"VEO3FAST"|"KLING2_1"|"KLING2_5", "resolution": "RESOLUTION_480"|"RESOLUTION_720"|"RESOLUTION_1080", "width", "height", "duration", "frameInterpolation", "promptEnhance", "promptEnhanceInstruction", "negativePrompt", "seed", "styleIds": ["<uuid>"], "elements": [...], "isPublic"}` → `{"motionVideoGenerationJob": {"generationId", "apiCreditCost", "cost"}}`.
- `POST /generations-image-to-video` — as above plus `imageId`*, `imageType`* (`GENERATED`|`UPLOADED`), optional `endFrameImage: {"id", "type"}` (KLING2_1 only).
- `POST /generations-motion-svd` — `{"imageId"*, "isInitImage", "isVariation", "motionStrength", "isPublic"}` → `{"motionSvdGenerationJob": {...}}`.
- `POST /generations-video-upscale` — `{"sourceGenerationId"*, "resolution"*}` → `{"motionVideoGenerationJob": {"generationId", "variationId", ...}}`.
- Results: poll `GET /generations/{id}`; the MP4 is in `generated_images[].motionMP4URL` (official field). `GET /motion-variations/{id}` → `{"generated_image_variation_motion": [{"id", "status", "motionTransformType", "resolution", "url"}]}`.

**Variations / upscale**
- `POST /variations/upscale` `{"id": "<generated image id>"}` → `{"sdUpscaleJob": {"id", "apiCreditCost", "cost"}}`.
- `POST /variations/unzoom` `{"id", "isVariation"}` → `{"sdUnzoomJob": {...}}`; `POST /variations/nobg` `{"id", "isVariation"}` → `{"sdNobgJob": {...}}`.
- `POST /variations/universal-upscaler` `{"generatedImageId" | "initImageId" | "variationId", "upscalerStyle", "ultraUpscaleStyle", "creativityStrength", "detailContrast", "similarity", "upscaleMultiplier", "prompt"}` → `{"universalUpscaler": {"id", ...}}`.
- `GET /variations/{id}` → `{"generated_image_variation_generic": [{"id", "status", "transformType": "OUTPAINT"|"INPAINT"|"UPSCALE"|"UNZOOM"|"NOBG", "url", "createdAt"}]}`.

**Utilities**
- `POST /pricing-calculator` `{"service": "IMAGE_GENERATION"|"MOTION_VIDEO_GENERATION"|"VEO3_MOTION_VIDEO_GENERATION"|"MOTION_SVD_GENERATION"|"UNIVERSAL_UPSCALER"|"UNIVERSAL_UPSCALER_ULTRA"|"LCM_GENERATION"|"MODEL_TRAINING"|"TEXTURE_GENERATION"|"FANTASY_AVATAR_GENERATION", "serviceParams": {"IMAGE_GENERATION": {"imageHeight", "imageWidth", "numImages", "inferenceSteps", "alchemyMode", "photoRealMode", "highResolution", "loraCount", "isPhoenix", "isSDXL", "isFluxDev", ...}}}` → `{"calculateProductionApiServiceCost": {"cost": <credits>}}`.
- `GET /platformModels`, `GET /me`, `POST /prompt/improve` `{"prompt"}`, `POST /prompt/random`.

## Input media
- **No inline images anywhere**: every image input is an id of something already on Leonardo — an uploaded init image (`POST /init-image` presigned S3 upload, png/jpg/jpeg/webp; size limit not stated in spec) or a previously generated image id. Video takes `imageId` + `imageType`.
- Masks only via the Canvas flow (`/canvas-init-image` init + mask uploads, then `canvasRequest: true`, `canvasRequestType: "INPAINT"|"OUTPAINT"|...`).
- Reference/ControlNet images: `controlnets[].initImageId` + `preprocessorId` (ids listed on the docs "commonly used API values" page — not reachable; unverified).

## Output media
- Hosted URLs on `https://cdn.leonardo.ai/...` (`generated_images[].url`, `motionMP4URL`, variation `url`). Content types PNG/JPG for images, MP4 for video. Retention is long-lived (assets stay in the user's library until deleted) — expiry not documented; still copy to our storage.
- CORS on `cdn.leonardo.ai` for `fetch()` unverified; `<img>`/`<video>` fine.

## Rate limits, quotas, free tier
- Per-key **concurrency slots** (`apiConcurrencySlots` in `/me`) with a queue: excess generation requests are queued rather than 429'd, up to a queue depth; synchronous utility endpoints have a separate RPM ceiling that can 429 (docs "Concurrency, rate limits and queue" via mirror sheet). Exact numbers not published; increases via support.
- PAYG USD balance; starter credit reported ($5); free consumer tokens (150/month) do **not** work for the API.

## Gotchas
- `alchemy` defaults to **true** and `num_images` to **4** — an unadorned request costs 4 Alchemy images. Always send both explicitly.
- Phoenix + Alchemy requires `contrast ≥ 2.5`; `ultra` cannot be combined with Alchemy; images >768 px on a side cap `num_images` at 4.
- Model ids are UUIDs that differ per platform model and change with releases — fetch `GET /platformModels` and cache; the two Phoenix/Lucid UUIDs above are from third-party pages and must be confirmed.
- Two-step (three-request) upload flow for any user image; the S3 form fields come back as a **JSON string** that must be parsed and sent before the `file` part.
- Video results are read from the *image* generation getter (`generated_images[].motionMP4URL`), and allowed `width`/`height`/`resolution`/`duration` combinations vary by model (Veo 3 = 720p, 4/6/8 s; Kling 2.5 = 5/10 s; Motion 2 = 480/720p).
- Cost appears in two shapes (`apiCreditCost` deprecated vs `cost {amount, unit}`); unit may be `CREDITS` or `DOLLARS`.
- Video generations take minutes (Veo 3 often 2–5 min) — long poll timeout.

## Adapter mapping notes
- text→image → `POST /generations`; UI: model picker from `/platformModels` (default to Lucid Origin / Phoenix once ids verified), width/height presets (multiples of 8, ≤1536), `num_images` (1–4/8), `presetStyle`, `alchemy` toggle, Phoenix `contrast` select, `enhancePrompt`, negative prompt, seed, guidance; call `/pricing-calculator` before submit for the estimate.
- image→image → upload via `/init-image` flow (proxy performs both steps), then `init_image_id` + `init_strength`; ControlNet/pose/depth as an advanced panel; inpaint via canvas ids (wave 3).
- upscale → `variations/universal-upscaler` (style + multiplier UI) with `variations/upscale` as the cheap legacy path; bg removal → `variations/nobg`; poll `GET /variations/{id}`.
- text→video / image→video → `generations-text-to-video` / `generations-image-to-video` with model radio (Motion 2 fast/std, Veo 3 fast/std with audio badge, Kling 2.1/2.5), duration/resolution constrained per model; poll `GET /generations/{id}` for `motionMP4URL`.
- Job model: uniform `{generationId}` → poll `/generations/{id}` (`PENDING`→`COMPLETE`|`FAILED`), 3–5 s interval, ≥5 min timeout for video; variations use `/variations/{id}`.
- Proxy: forward `Authorization: Bearer`; implement the presigned S3 upload server-side so the browser never has to deal with the bucket's CORS; optionally register the Worker URL as the API-key webhook.
