# Ideogram (API v3)

- Website / docs: https://developer.ideogram.ai (API reference, OpenAPI 3.1 published there), https://docs.ideogram.ai, key management https://ideogram.ai/manage-api, pricing https://about.ideogram.ai/api-pricing
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter)
- Adapter id: `ideogram`  ·  Transport: `proxy`  ·  Priority wave: 1

> **Provenance note.** `developer.ideogram.ai`, `docs.ideogram.ai`, `ideogram.ai` and `api.ideogram.ai` were egress-blocked in the research sandbox. Endpoint/field facts below come from `openapi/_original/ideogram-openapi.yml` in github.com/api-evangelist/ideogram (harvested 2026-09-04; the file carries the Fern-generated component names `ResolutionV3`, `StyleTypeV3`, `RenderingSpeed`, etc. that match the published spec, so it is treated as the official OpenAPI). Pricing comes from search snippets of third-party pricing pages and is flagged where sources disagree.

## Account and authentication
- Sign up at ideogram.ai → API keys at https://ideogram.ai/manage-api (the wrapper README points to https://ideogram.ai/api). API credit is prepaid, separate from consumer subscription plans; no free API tier is documented (unverified).
- Auth header: **`Api-Key: <key>`** (official spec: `securitySchemes.ApiKeyAuth: {in: header, name: "Api-Key"}`; the header is also declared as a required per-operation header parameter).
- Base URL: `https://api.ideogram.ai` (single region).

## Browser (CORS) behaviour
- **Unknown / not testable.** `OPTIONS https://api.ideogram.ai/v1/ideogram-v3/generate` with `Origin: https://www.thewoovee.com` was answered `403 Forbidden` by the sandbox egress proxy (CONNECT rejected); no `Access-Control-Allow-Origin` observation possible. The spec contains no CORS statement. Assume `proxy` transport; verify the preflight from a real browser.

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | yes | `POST /v1/ideogram-v3/generate`, `POST /v1/ideogram-v3/generate-transparent` |
| image→image / edit / inpaint | yes | `POST /v1/ideogram-v3/remix` (i2i with `image_weight`), `POST /v1/ideogram-v3/inpaint` (mask; `/v1/ideogram-v3/edit` is the same thing marked "legacy"), `POST /v1/ideogram-v3/reframe` (outpaint to a new resolution), `POST /v1/ideogram-v3/replace-background`, `POST /v1/remove-background`, `POST /v1/ideogram-v3/layerize-text` |
| upscale | yes | `POST /upscale` (model-agnostic; note: no `/v1` prefix in the spec) |
| text→video | no | — |
| image→video | no | — |
| video→video / extend | no | — |
| audio in video | no | — |
| image→text | yes | `POST /describe` (`describe_model_version` `V_2` \| `V_3`) |

## Models
There is one model family (Ideogram 3.0) selected by endpoint; quality/speed is chosen with `rendering_speed`. Custom fine-tuned models are addressed through `custom_model_uri` (`model/<model_name>/version/<version_name>`, trained via `/v1/ideogram-v3/train-model`, `/datasets`, `/models`).

| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| Ideogram 3.0 `rendering_speed=TURBO` | t2i / edit / remix / reframe / replace-bg | `aspect_ratio` (15 values) or `resolution` (69 fixed sizes, 512–1536 px sides, ≈1 MP) | `num_images` default 1 (docs: 1–8, unverified max) | $0.03 / image (third-party pricing snippets; $0.10 with a character reference) |
| Ideogram 3.0 `rendering_speed=DEFAULT` (spec default) | same | same | | $0.06 / image (developer.puter.com); api-evangelist plan sheet says $0.075 — **verify** ($0.15 with character reference) |
| Ideogram 3.0 `rendering_speed=QUALITY` | same | same | | $0.09 / image ($0.20 with character reference) |
| Ideogram 3.0 `rendering_speed=FLASH` | t2i / edit / remix (not transparent) | same | | price unverified |
| Upscale (`/upscale`) | upscale | `resemblance`, `detail` 0–100 | `num_images` default 1 (≤4 per wrapper) | $0.06 / image |
| Describe (`/describe`) | vision | `describe_model_version` V_2 \| V_3 | | $0.01 / input |
| Remove background (`/v1/remove-background`) | utility | — | returns exactly 1 image | price unverified |

Enums (official spec):
- `RenderingSpeed`: `FLASH`, `TURBO`, `DEFAULT` (default), `QUALITY`.
- `StyleTypeV3`: `AUTO`, `GENERAL` (default), `REALISTIC`, `DESIGN`, `FICTION`.
- `MagicPromptOption`: `AUTO`, `ON`, `OFF`.
- `AspectRatioV3`: `1x3, 3x1, 1x2, 2x1, 9x16, 16x9, 10x16, 16x10, 2x3, 3x2, 3x4, 4x3, 4x5, 5x4, 1x1` (note `x`, not `:`; default `1x1`; cannot be combined with `resolution`).
- `ResolutionV3` (69 values): `512x1536, 576x1408, 576x1472, 576x1536, 640x1344, 640x1408, 640x1472, 640x1536, 704x1152, 704x1216, 704x1280, 704x1344, 704x1408, 704x1472, 736x1312, 768x1088, 768x1216, 768x1280, 768x1344, 800x1280, 832x960, 832x1024, 832x1088, 832x1152, 832x1216, 832x1248, 864x1152, 896x960, 896x1024, 896x1088, 896x1120, 896x1152, 960x832, 960x896, 960x1024, 960x1088, 1024x832, 1024x896, 1024x960, 1024x1024, 1088x768, 1088x832, 1088x896, 1088x960, 1120x896, 1152x704, 1152x832, 1152x864, 1152x896, 1216x704, 1216x768, 1216x832, 1248x832, 1280x704, 1280x768, 1280x800, 1312x736, 1344x640, 1344x704, 1344x768, 1408x576, 1408x640, 1408x704, 1472x576, 1472x640, 1472x704, 1536x512, 1536x576, 1536x640`.
- `StylePresetV3` (62 values): `80S_ILLUSTRATION, 90S_NOSTALGIA, ABSTRACT_ORGANIC, ANALOG_NOSTALGIA, ART_BRUT, ART_DECO, ART_POSTER, AURA, AVANT_GARDE, BAUHAUS, BLUEPRINT, BLURRY_MOTION, BRIGHT_ART, C4D_CARTOON, CHILDRENS_BOOK, COLLAGE, COLORING_BOOK_I, COLORING_BOOK_II, CUBISM, DARK_AURA, DOODLE, DOUBLE_EXPOSURE, DRAMATIC_CINEMA, EDITORIAL, EMOTIONAL_MINIMAL, ETHEREAL_PARTY, EXPIRED_FILM, FLAT_ART, FLAT_VECTOR, FOREST_REVERIE, GEO_MINIMALIST, GLASS_PRISM, GOLDEN_HOUR, GRAFFITI_I, GRAFFITI_II, HALFTONE_PRINT, HIGH_CONTRAST, HIPPIE_ERA, ICONIC, JAPANDI_FUSION, JAZZY, LONG_EXPOSURE, MAGAZINE_EDITORIAL, MINIMAL_ILLUSTRATION, MIXED_MEDIA, MONOCHROME, NIGHTLIFE, OIL_PAINTING, OLD_CARTOONS, PAINT_GESTURE, POP_ART, RETRO_ETCHING, RIVIERA_POP, SPOTLIGHT_80S, STYLIZED_RED, SURREAL_COLLAGE, TRAVEL_POSTER, VINTAGE_GEO, VINTAGE_POSTER, WATERCOLOR, WEIRD, WOODBLOCK_PRINT`.
- `ColorPalettePresetName`: `EMBER, FRESH, JUNGLE, MAGIC, MELON, MOSAIC, PASTEL, ULTRAMARINE`.
- `UpscaleFactor` (generate-transparent only): `X1` (default), `X2`, `X4` (extra cost).

## Endpoints (exact)
All image endpoints are **synchronous** `POST` with **`multipart/form-data`** (even text-only generate — every field is a form part; arrays are repeated parts; `color_palette` is a JSON-encoded part). No polling, no webhooks, no cancel. Typical latency: a few seconds (TURBO) to ~20 s (QUALITY).

Success response (all v3 image endpoints), `ImageGenerationResponseV3`:
```json
{
  "created": "2026-09-06T10:00:00Z",
  "data": [
    { "url": "https://ideogram.ai/api/images/ephemeral/....png", "prompt": "<possibly rewritten prompt>",
      "resolution": "1024x1024", "upscaled_resolution": "2048x2048", "is_image_safe": true,
      "seed": 12345, "style_type": "GENERAL" }
  ]
}
```
`url` is `null` and `is_image_safe` is `false` for images that failed the safety check. Errors: 400 invalid input, 401/403 not authorized, 422 prompt/image failed safety (`{"error": "..."}`), 429 too many requests.

- `POST https://api.ideogram.ai/v1/ideogram-v3/generate` — parts: `prompt`* (string), `seed` (int), `resolution` **or** `aspect_ratio`, `rendering_speed`, `magic_prompt`, `negative_prompt`, `num_images` (default 1), `color_palette` (JSON: `{"name": "EMBER"}` or `{"members": [{"color_hex": "#FF0000", "color_weight": 0.5}]}`, weights 0.05–1.0), `style_codes[]` (8-hex codes; exclusive with `style_reference_images` and `style_type`), `style_type`, `style_preset`, `custom_model_uri`, `style_reference_images[]` (files; ≤10 MB total; docs: up to 3), `character_reference_images[]` (files; **currently only 1 supported**, ≤10 MB; premium pricing), `character_reference_images_mask[]` (grayscale, same count/dimensions).
- `POST .../v1/ideogram-v3/generate-transparent` — `prompt`*, `seed`, `upscale_factor`, `aspect_ratio`, `rendering_speed` (FLASH → 400), `magic_prompt`, `negative_prompt`, `num_images`. Output PNG with alpha.
- `POST .../v1/ideogram-v3/inpaint` (current) / `POST .../v1/ideogram-v3/edit` (legacy alias) — `image`* (≤10 MB jpeg/webp/png), `mask`* (**black = region to edit**, same size), `prompt`*, `magic_prompt`, `num_images`, `seed`, `rendering_speed`, `style_type`, `style_preset`, `color_palette`, `style_codes`, `style_reference_images[]`, `character_reference_images[]`, `character_reference_images_mask[]`.
- `POST .../v1/ideogram-v3/remix` — `image`*, `prompt`*, `image_weight` (int, default 50; 1–100), `seed`, `resolution` or `aspect_ratio`, `rendering_speed`, `magic_prompt`, `negative_prompt`, `num_images`, `color_palette`, `style_codes`, `style_type`, `style_preset`, `style_reference_images[]`, `character_reference_images[]` (+ mask).
- `POST .../v1/ideogram-v3/reframe` — `image`*, `resolution`* (target size from `ResolutionV3`), `num_images`, `seed`, `rendering_speed`, `style_preset`, `color_palette`, `style_codes`, `style_reference_images[]`. (Wrapper notes reframe requires a square input image — unverified.)
- `POST .../v1/ideogram-v3/replace-background` — `image`*, `prompt`*, `magic_prompt`, `num_images`, `seed`, `rendering_speed`, `style_preset`, `color_palette`, `style_codes`, `style_reference_images[]`.
- `POST .../v1/remove-background` — `image`* → `{created, data: [one RemoveBackgroundImageObject]}`.
- `POST .../v1/ideogram-v3/layerize-text` — splits text layers from an image (fields not extracted; see spec).
- `POST https://api.ideogram.ai/upscale` — parts: `image_file`* (binary) and `image_request`* (**JSON string**: `{"prompt": "...", "resemblance": 50, "detail": 50, "magic_prompt_option": "AUTO", "num_images": 1, "seed": 1}`). Same response shape.
- `POST https://api.ideogram.ai/describe` — `image_file`*, `describe_model_version` (`V_2` | `V_3`, default `V_3`) → `{"descriptions": [{"text": "..."}]}`.
- Legacy v1/v2 endpoints still in the spec (`/generate`, `/edit`, `/remix`, `/reframe` with a JSON `image_request`) — do not use for new work.

## Input media
- Files only, as multipart parts (no URLs, no base64). Formats JPEG, WebP, PNG; **≤10 MB per file** (image/mask) and ≤10 MB total for each reference-image set.
- Masks: black/white image identical in size to `image`; **black marks the area to regenerate** (opposite of Stability/Recraft/Leonardo conventions).
- Character reference: exactly 1 image today; optional per-image grayscale mask.

## Output media
- Hosted URL per image (`data[].url`), PNG (transparent endpoint) or the service default; **no base64 option**. The spec only says "Images links are available for a limited period of time; if you would like to keep the image, you must download it" — the exact TTL is **unverified** (community reports suggest under an hour). Copy the bytes to our storage immediately.
- Whether the image host sends CORS headers for `fetch()` is unverified; `<img>` embedding works. Route re-hosting through the proxy.

## Rate limits, quotas, free tier
- 429 documented but numeric limits are **not published** (api-evangelist rate-limit sheet: "not publicly documented"; contact developer support for increases). Implement exponential backoff honouring `Retry-After`.
- Prepaid API credit; no documented free API allowance (unverified).

## Gotchas
- **Mask polarity is inverted** relative to most providers (black = edit).
- Aspect ratios use `x` (`16x9`), not `:`; `aspect_ratio` and `resolution` are mutually exclusive; `style_codes` is exclusive with `style_type` and `style_reference_images`.
- `/upscale` and `/describe` have **no `/v1` prefix** and `/upscale` wants its parameters as a JSON string inside the `image_request` part.
- `magic_prompt` may rewrite the prompt; the returned `data[].prompt` is the final prompt — show it to the user.
- Character-reference requests are billed at a much higher rate ($0.10–$0.20 vs $0.03–$0.09) — surface this in the cost estimate.
- Per-image safety failures return `url: null` inside a 200 rather than an error; billing for those is unverified.
- Synchronous requests can take 10–30 s at QUALITY — the Worker proxy needs a request timeout comfortably above that (Cloudflare Workers allow long fetches, but keep the SPA's abort at ≥60 s).

## Adapter mapping notes
- text→image → `/v1/ideogram-v3/generate`; UI: prompt, negative prompt, `rendering_speed` tier (map to our quality selector: TURBO/DEFAULT/QUALITY), aspect-ratio picker (15 values, translate `16:9` → `16x9`) or explicit resolution, `num_images`, `style_type`, optional `style_preset`, `magic_prompt`, seed, color palette (preset or hex list), style-reference uploads (≤3), single character-reference upload with cost warning; transparent-background toggle → `generate-transparent`.
- image→image → `remix` (strength ≈ `image_weight`); inpaint → `inpaint` (**invert our white-means-edit mask before sending**); outpaint/reframe → `reframe` with target `resolution`; background replace → `replace-background`; background remove → `/v1/remove-background`.
- upscale → `/upscale` with `resemblance`/`detail` sliders (build the `image_request` JSON string).
- Job model: synchronous — no polling state; handle 422 safety as a user-facing "blocked" state.
- Proxy: forward `Api-Key` and the multipart body verbatim; optionally fetch `data[].url` server-side to persist before it expires.
