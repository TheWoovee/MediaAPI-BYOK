# Recraft (Images API v1 — Recraft V2 / V3 / V4 / V4.1)

- Website / docs: https://www.recraft.ai/docs (getting started, endpoints, appendix, pricing at https://www.recraft.ai/docs/api-reference/pricing), Swagger at https://external.api.recraft.ai/doc/, pricing https://www.recraft.ai/pricing?tab=api
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter)
- Adapter id: `recraft`  ·  Transport: `proxy`  ·  Priority wave: 2

> **Provenance note.** `recraft.ai`, `webflow.recraft.ai` and `external.api.recraft.ai` were egress-blocked in the research sandbox. Sources used: the api-evangelist/recraft-ai profile (2026-05-25; its plans sheet is explicitly "reconciled … Source: recraft.ai/docs/api-reference/pricing", its rate-limit sheet cites the docs appendix; its OpenAPI is a reconstruction, not the vendor file), the community `recraft-mcp-server` (BartWaardenburg, 2026-03-16; typed against the live API), and search snippets quoting the official docs/appendix. Endpoints that appear only in the reconstructed OpenAPI are flagged.

## Account and authentication
- Sign up at recraft.ai → profile → **API** tab → generate token; buy API units there (US$1.00 = 1 000 API units; prepaid, separate from Studio subscription credits). A small free unit grant on first API use has been reported but is unverified.
- Auth header: `Authorization: Bearer <token>` (official; OpenAI-compatible request shape — the OpenAI SDK can be pointed at the base URL).
- Base URL: `https://external.api.recraft.ai/v1` (single region).
- Account/balance: `GET /v1/users/me` → `{"id", "email", "name", "credits": <remaining API units>}`.

## Browser (CORS) behaviour
- **Unknown / not testable.** `OPTIONS https://external.api.recraft.ai/v1/images/generations` with `Origin: https://www.thewoovee.com` was answered `403 Forbidden` by the sandbox egress proxy (CONNECT rejected — `recentRelayFailures` lists `external.api.recraft.ai:443`), so no `Access-Control-Allow-Origin` observation was possible; no CORS statement found in docs. Assume `proxy`; re-test from a browser.

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image (raster + true SVG vector) | yes | `POST /v1/images/generations` (`style=vector_illustration` or a vector model id yields SVG) |
| image→image / edit / inpaint | yes | `POST /v1/images/imageToImage`, `/v1/images/inpaint`, `/v1/images/replaceBackground`, `/v1/images/generateBackground`, `/v1/images/eraseRegion`, `/v1/images/removeBackground`, `/v1/images/vectorize`, `/v1/images/variateImage`; `/v1/images/outpaint` (mirror-only, unverified) |
| upscale | yes | `POST /v1/images/crispUpscale`, `POST /v1/images/creativeUpscale` |
| text→video | no | — |
| image→video | no | — |
| video→video / extend | no | — |
| audio in video | no | — |
| custom styles | yes | `POST /v1/styles`, `GET /v1/styles`, `GET /v1/styles/basic`, `GET`/`DELETE /v1/styles/{style_id}` |

## Models
| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| `recraftv4_1` (mirror default) | t2i raster/vector | `size` from the 15-value list or aspect ratio; `style`, `substyle`, `style_id`, `controls`, `text_layout` | prompt ≤10 000 chars | raster 40 units ($0.04); vector 80 units ($0.08) |
| `recraftv4_1_pro` | t2i | same | | raster 250 ($0.25); vector 300 ($0.30) |
| `recraftv4_1_utility`, `recraftv4_1_utility_pro` | t2i (utility variants) | same | | 40 / 250 units (vector 80 / 300) |
| `recraftv4`, `recraftv4_pro` | t2i | same; `style` reportedly not supported on V4 i2i (MCP note) | prompt ≤10 000 | 40 / 250 units |
| `recraftv4_vector` | t2i vector (seen in MCP typings, Mar 2026) | | | 80 units |
| `recraftv4_styles`, `recraftv4_styles_pro` | style-consistent family (third-party listings, unverified) — require `style_id` or reference images, not both | | | unverified |
| `recraftv3` | t2i raster/vector | `style` incl. `vector_illustration`; ≤1 000-char prompt | | raster 40 ($0.04); vector 80 ($0.08) |
| `recraftv2` | t2i legacy | ≤1 000-char prompt | | raster 22 ($0.022); vector 44 ($0.044) |
| `recraft20b`, `refm1` | seen in MCP typings; meaning unverified | | | unverified |

Enumerations (MCP typings, Mar 2026; verify against live docs):
- `style`: `realistic_image` (default), `digital_illustration`, `vector_illustration`, `icon`, `logo_raster`.
- `substyle` (subset): `b_and_w, enterprise, hdr, natural_light, studio_portrait, hard_flash, motion_blur, evening_light, hand_drawn, pixel_art, grain, kawaii, watercolor, pop_art, noir, bold_stroke, chemistry, cutout, editorial, mosaic, emblem_graffiti, emblem_pop_art, emblem_punk, emblem_stamp, emblem_vintage` (the full, per-style list is in the docs appendix; fetch `GET /v1/styles/basic`).
- `size`: `1024x1024` (default), `1365x1024`, `1024x1365`, `1536x1024`, `1024x1536`, `1820x1024`, `1024x1820`, `1024x2048`, `2048x1024`, `1434x1024`, `1024x1434`, `1024x1280`, `1280x1024`, `1024x1707`, `1707x1024`. The 2026 mirror also lists 14 aspect-ratio strings (`1:1, 2:1, 1:2, 3:2, 2:3, 4:3, 3:4, 5:4, 4:5, 6:10, 14:10, 10:14, 16:9, 9:16`) as accepted `size` values — unverified.
- `response_format`: `url` (default) | `b64_json`. `image_format`: `webp` | `png` (MCP) — unverified on live API.

## Endpoints (exact)
All endpoints are **synchronous** (heavy requests can take tens of seconds to minutes); no polling, webhooks, or cancel. Errors: 401 bad token, 402 no units, 429 rate limit (`Retry-After`), 4xx validation with a JSON message. Units are deducted only on success.

**Generation (JSON body)**
- `POST https://external.api.recraft.ai/v1/images/generations` — `Content-Type: application/json`:
  ```json
  { "prompt": "...", "model": "recraftv4_1", "style": "realistic_image", "substyle": "hdr",
    "style_id": "<uuid, alternative to style/substyle>", "size": "1024x1024", "n": 1,
    "response_format": "url", "negative_prompt": "...",
    "controls": { "colors": [{"rgb": [255,0,0], "weight": 0.5}], "background_color": {"rgb": [255,255,255]}, "no_text": true, "artistic_level": 3 },
    "text_layout": [{ "text": "SALE", "bbox": [[x,y],[x,y],[x,y],[x,y]] }],
    "random_seed": 42 }
  ```
  `n` 1–6; `artistic_level` 0–5; `style_id` and `style`/`substyle` are mutually exclusive. Response:
  ```json
  { "created": 1757150000, "credits": 40,
    "data": [ { "image_id": "<uuid>", "url": "https://img.recraft.ai/...", "b64_json": null, "revised_prompt": "..." } ] }
  ```
- `POST /v1/images/generations/raster`, `POST /v1/images/generations/vector`, `POST /v1/images/explore`, `POST /v1/images/explore/similar`, `POST /v1/prompts/enhance` — present only in the reconstructed api-evangelist OpenAPI (2026-05); **unverified**.

**Image inputs (multipart/form-data; file part named `image`, mask part `mask`)** — all return `{"created", "credits", "image": {"image_id", "url"|"b64_json"}}` for single-output processing endpoints, or the `data[]` shape for generative ones (MCP typings).
- `POST /v1/images/imageToImage` — `image`*, `prompt`*, `strength`* (0.0–1.0; 0 = closest to source), `model`, `style`, `substyle`, `style_id`, `n`, `response_format`, `negative_prompt`, `controls`, `random_seed`. 40 units raster / 80 vector.
- `POST /v1/images/inpaint` — `image`*, `mask`* (grayscale PNG, **white = regenerate**, black = keep), `prompt`*, same optional fields. 40 / 80 units.
- `POST /v1/images/replaceBackground` — `image`*, `prompt`*, `model`, `style`, `substyle`, `style_id`, `n`, `response_format`, `negative_prompt`. 40 / 80 units.
- `POST /v1/images/generateBackground` — `image`*, `mask`*, `prompt`*, same optional fields. 40 / 80 units.
- `POST /v1/images/eraseRegion` — `image`*, `mask`*, `response_format`. 2 units ($0.002).
- `POST /v1/images/removeBackground` — `image`*, `response_format`. 10 units ($0.01); returns transparent PNG.
- `POST /v1/images/vectorize` — `image`*, `response_format` → SVG. 10 units ($0.01).
- `POST /v1/images/crispUpscale` — `image`* (≤4 MP input), `response_format`. 4 units ($0.004).
- `POST /v1/images/creativeUpscale` — `image`* (≤16 MP input), `response_format`. 250 units ($0.25).
- `POST /v1/images/variateImage` — `image`*, (optional prompt/style fields). 40 units.
- `POST /v1/images/outpaint` — `image`*, `prompt`, `outpaint_top/bottom/left/right` (mirror only, unverified). 40 / 80 units.

**Styles**
- `POST /v1/styles` — multipart `style`* (base style group, e.g. `digital_illustration`) + 1–5 `file` parts (reference images) → `{"id": "<style_id uuid>", "credits": 40}`. 40 units ($0.04).
- `GET /v1/styles` → `{"styles": [{"id", "model", "style", "substyle"}]}`; `GET /v1/styles/basic` (built-in style/substyle catalogue); `GET /v1/styles/{style_id}`; `DELETE /v1/styles/{style_id}` (MCP server; unverified in docs).

**Account**
- `GET /v1/users/me` → `{"id", "email", "name", "credits"}`.

## Input media
- Multipart file uploads for every image endpoint (the community MCP accepts URL/base64 but converts to a file before calling the API). Formats PNG, JPG/JPEG, WEBP. **Limits (docs appendix, via snippet):** ≤5 MB per file, ≤16 MP (≤4 MP for crisp upscale), longest side ≤4 096 px, shortest side ≥256 px.
- Masks: grayscale PNG same size as `image`; white = area to change.
- Custom-style references: 1–5 images per style.

## Output media
- Default `response_format=url`: public, unauthenticated signed URLs, **stored ~24 hours** (docs appendix/rate-limit sheet: `retention PT24H`). `response_format=b64_json` returns inline base64 (recommended for our pipeline to avoid a second fetch).
- Content types: PNG (default raster), WEBP (via `image_format`), JPG; **SVG** for vector styles/models and `vectorize`.
- CORS on `img.recraft.ai` unverified; prefer `b64_json` or proxy the download.

## Rate limits, quotas, free tier
- **5 requests/second and 100 images/minute per user** (docs appendix via api-evangelist rate-limit sheet); 429 with `Retry-After`.
- Requests are accepted only while the API-unit balance is positive; failures are not charged. No documented free API tier (unverified).

## Gotchas
- Two currencies: Studio "credits" and API "units" are different balances; the `credits` field in API responses/`/users/me` means **API units**.
- Vector output is chosen by style/model, not by endpoint — the same `generations` call may return SVG; the adapter must sniff the content type.
- Pro models are ~6× the price of standard (250 vs 40 units); creative upscale is 250 units while crisp is 4.
- Prompt length caps differ: 1 000 chars (V2/V3) vs 10 000 (V4/V4.1).
- `style_id` cannot be combined with `style`/`substyle`; V4 style-family models require either `style_id` or reference images.
- Multipart on all image endpoints, JSON on generation — the proxy must handle both.
- The model catalogue changed quickly in 2026 (V4 → V4.1, `_utility`, `_pro`, `_styles` variants); keep model ids in remote config and validate against `GET /v1/styles/basic` / live docs.

## Adapter mapping notes
- text→image → `/v1/images/generations` with `response_format: "b64_json"`; UI: model picker (V4.1 default, Pro tier flagged as expensive, V3 legacy), style + substyle dropdowns (populate from `/v1/styles/basic`), custom style picker (`/v1/styles`), size picker (15 fixed sizes), `n` 1–6, negative prompt, brand controls (palette colors, background color, `no_text`, `artistic_level`), optional text layout (advanced), seed. Vector toggle → `style=vector_illustration` (or a vector model id) and expect SVG.
- image→image → `imageToImage` (strength slider); inpaint → `inpaint` (white-mask convention matches ours); background replace/generate → `replaceBackground` / `generateBackground`; erase → `eraseRegion`; bg removal → `removeBackground`; vectorize → `vectorize`.
- upscale → `crispUpscale` (cheap, ≤4 MP in) vs `creativeUpscale` (250 units) as two tiers.
- Cost display: static units table above ÷ 1 000 = USD; live balance from `/v1/users/me`; show `credits` charged from each response.
- Proxy: forward `Authorization: Bearer` and body (JSON or multipart) unchanged; long timeout for creative upscale.
