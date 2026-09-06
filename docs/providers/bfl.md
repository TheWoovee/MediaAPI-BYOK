# Black Forest Labs (FLUX API)

- Website / docs: https://docs.bfl.ai (API reference; OpenAPI at https://api.bfl.ai/openapi.json), pricing https://bfl.ai/pricing, dashboard https://dashboard.bfl.ai, help https://help.bfl.ai, status https://status.bfl.ml
- Last verified: 2026-09-06 (by web research; re-verify before shipping the adapter)
- Adapter id: `bfl`  ·  Transport: `proxy`  ·  Priority wave: 1

> **Provenance note.** `docs.bfl.ai`, `docs.bfl.ml`, `help.bfl.ai`, `bfl.ai` and `api.bfl.ai` were all egress-blocked in the research sandbox. Primary source used instead: the **official** `github.com/black-forest-labs/skills` repository (author "Black Forest Labs"; commit 8907d51, 2026-08-26; `skills/bfl-api/**` dated January 2026 and `skills/flux-3-*` dated August 2026), cross-checked with the `bfl-api` npm wrapper (aself101, 2025-12-05), the api-evangelist/black-forest-labs mirror (2026-09-04) and search snippets. Where the official files contradict each other it is called out.

## Account and authentication
- Get a key: https://dashboard.bfl.ai/get-started → "Create Key" → select organization. Keys start with `bfl_` (official skill `api-key-setup.md`). Credits are prepaid; 1 credit = US$0.01.
- Auth header: **`x-key: <api key>`** on every request, including polling GETs (official).
- Base URLs (official `endpoints.md`):
  | Region | Base URL | Notes |
  |---|---|---|
  | Global | `https://api.bfl.ai` | default, automatic failover |
  | EU | `https://api.eu.bfl.ai` | GDPR / EU residency |
  | US | `https://api.us.bfl.ai` | US residency |
  Legacy hosts `api.bfl.ml`, `api.us1.bfl.ai`, `api.eu1.bfl.ai` appear in older third-party code; treat as deprecated/unverified.
- Utility: `GET /v1/credits` → `{"credits": <number>}` (mirror + wrapper); `GET /v1/my_finetunes`, `GET /v1/finetune_details?finetune_id=`, `POST /v1/delete_finetune`.

## Browser (CORS) behaviour
- **Unknown / not testable.** `OPTIONS https://api.bfl.ai/v1/flux-kontext-pro` with `Origin: https://www.thewoovee.com` returned `403 Forbidden` from the sandbox egress proxy (CONNECT rejected), so no `Access-Control-Allow-Origin` could be observed. No CORS statement exists in the official skill docs. Design for `proxy` transport; re-test the preflight from a browser before enabling `direct`.
- Result files are served from Azure Blob (`https://bfldeliveryprod.blob.core.windows.net/results/...`, official example) as signed URLs; whether that host emits CORS headers for `fetch()` is also unverified — `<img src>` works regardless, but re-uploading the bytes from the SPA may need the proxy.

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | yes | `/v1/flux-2-pro`, `/v1/flux-2-max`, `/v1/flux-2-flex`, `/v1/flux-2-klein-4b`, `/v1/flux-2-klein-9b`, `/v1/flux-pro-1.1`, `/v1/flux-pro-1.1-ultra`, `/v1/flux-dev`, `/v1/flux-pro` |
| image→image / edit / inpaint | yes | all FLUX.2 endpoints via `input_image`…`input_image_8`; `/v1/flux-kontext-pro`, `/v1/flux-kontext-max`; inpaint `/v1/flux-pro-1.0-fill` (+ `-finetuned`); outpaint `/v1/flux-pro-1.0-expand`; `/v1/flux-pro-1.0-canny`, `/v1/flux-pro-1.0-depth` (unverified, see below) |
| upscale | no | no upscale endpoint documented |
| text→video | yes (new) | `/v1/flux-3-video` mode `t2v` (FLUX 3 Video, Aug 2026) |
| image→video | yes (new) | `/v1/flux-3-video` mode `i2v` with `keyframes` |
| video→video / extend | yes (new) | `/v1/flux-3-video` mode `v2v` with `start_video` (continues from final frames) |
| audio in video | yes (new) | `/v1/flux-3-video` `generate_audio: true` |

## Models
| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|
| `flux-2-klein-4b` | t2i / i2i (≤4 refs) | `width`/`height` multiples of 16, min 64×64, max 4 MP total; `input_image[_2..8]`; no prompt upsampling | 24 concurrent | 1.4 c first MP + 0.1 c/extra MP (+ input MP × 0.1 c) ≈ $0.014 per 1 MP T2I |
| `flux-2-klein-9b` | t2i / i2i (≤4 refs) | as above | 24 concurrent | 1.5 c + 0.2 c/MP ≈ $0.015 |
| `flux-2-pro` | t2i / i2i (≤8 refs) | as above; `prompt_upsampling` | 24 concurrent | 3 c + 1.5 c/MP ≈ $0.03 T2I / $0.045 1 MP I2I |
| `flux-2-max` | t2i / i2i (≤8 refs, 10 in playground) | as above; grounding search | 24 concurrent | 7 c + 3 c/MP ≈ $0.07 / $0.10 |
| `flux-2-flex` | t2i / i2i (≤8 refs), typography | + `steps` 1–50 (50), `guidance` 1.5–10 (4.5) | 24 concurrent | 5 c + 5 c/MP ≈ $0.05 / $0.10 |
| `flux-pro-1.1` | t2i | `width`/`height` 256–1440, multiples of 32; `image_prompt` (Redux) | | $0.04 |
| `flux-pro-1.1-ultra` | t2i (up to 4 MP) | `aspect_ratio` 21:9…9:21, `raw` bool, `image_prompt` + `image_prompt_strength` | | $0.06 |
| `flux-pro-1.1-raw` | t2i | listed as its own path in the official pricing table; historically `raw:true` on ultra | | $0.06 |
| `flux-pro` (1.0) | t2i | `steps` 1–50, `guidance` 1.5–5, `width`/`height` 256–1440 | | $0.05 |
| `flux-dev` | t2i | `steps`, `guidance`, 256–1440 | | ~$0.025 (unverified) |
| `flux-kontext-pro` | i2i edit | `input_image` (+ up to 3 refs per wrapper), `aspect_ratio`, `prompt_upsampling` | 24 concurrent | $0.04 |
| `flux-kontext-max` | i2i edit | same | **6 concurrent** (official) | $0.08 |
| `flux-pro-1.0-fill` | inpaint | `image`, `mask` (or PNG alpha), `steps` 15–50, `guidance` 1.5–100 | | $0.05 |
| `flux-pro-1.0-expand` | outpaint | `image`, `top`/`bottom`/`left`/`right` 0–2048, `steps` 15–50 (50), `guidance` 1.5–100 (60) | | price unverified |
| `flux-pro-1.0-canny` / `-depth` | control | `control_image` or `preprocessed_image` (unverified) | | unverified |
| FLUX 3 Video (draft / HD / FHD) | t2v, i2v, v2v, audio | `aspect_ratio` auto, 21:9, 2:1, 16:9, 4:3, 1:1, 3:4, 9:16; `duration` int 5–20 or `"auto"`; `resolution` `hd`|`fhd`; `generate_audio`; `draft`; `version` | keyframes ≥256×256; concurrency ceiling → 429 on submit | text/image→video $0.06/s draft, $0.17/s HD, $0.29/s FHD; video→video $0.12 / $0.41 / $0.53 per s |

Pricing formula (official): `(firstMP + (outputMP-1) * mpPrice) + (inputMP * mpPrice)` in cents. Use https://bfl.ai/pricing for exact numbers.

## Endpoints (exact)
All generation endpoints: `POST https://api.bfl.ai/v1/<model>` with `Content-Type: application/json`, header `x-key`. **Every endpoint is asynchronous.**

Submit response (official):
```json
{ "id": "abc123", "polling_url": "https://api.bfl.ai/v1/get_result?id=abc123" }
```
(regional base URLs return a `polling_url` on the same region host — always use the returned URL, never build it).

Poll: `GET <polling_url>` (= `GET https://api.bfl.ai/v1/get_result?id={id}`), header `x-key`. Response states:
```json
{ "status": "Pending" }
{ "status": "Ready", "result": { "sample": "https://bfldeliveryprod.blob.core.windows.net/results/...", "prompt": "...", "seed": 1234567890 } }
{ "status": "Error", "error": "Error description" }
```
Full status set (official skills + wrapper types): `Pending`, `Ready`, `Error`, `Request Moderated`, `Content Moderated`, `Task not found`; FLUX 3 additionally emits `Reasoning` and `Generating` (keep polling). Terminal states never revert. Extra fields seen in poll bodies: `id`, `cost`, `input_mp`, `output_mp`; FLUX 3 returns `result.samples[]` (list) and `result.draft_caches[]`.
Recommended polling: start 0.5–1 s, back off ×1.5 to a 5–10 s cap, add jitter, overall timeout ~120 s for images; 429 on poll means back off and keep the same `polling_url` (task unaffected). Images are usually ready in 1–10 s.

Common request fields (image endpoints): `prompt` (required; FLUX.2 accepts very long prompts), `width`, `height` **or** `aspect_ratio` (e.g. `"16:9"`), `seed`, `safety_tolerance` (int 0 strict … 6 permissive, default 2; FLUX.2 docs say 0–5), `output_format` (`jpeg` default | `png`; `webp` listed in mirror), `prompt_upsampling` (bool), `webhook_url`, `webhook_secret`.
- `POST /v1/flux-2-pro` | `/v1/flux-2-max` | `/v1/flux-2-flex` | `/v1/flux-2-klein-4b` | `/v1/flux-2-klein-9b` — T2I or I2I in one endpoint: add `input_image` (+ `input_image_2` … `input_image_8`; klein max 4). flex adds `steps`, `guidance`.
- `POST /v1/flux-pro-1.1` — `prompt`, `width`, `height`, `image_prompt`, `prompt_upsampling`, `seed`, `safety_tolerance`, `output_format`.
- `POST /v1/flux-pro-1.1-ultra` — `prompt`, `aspect_ratio`, `raw`, `image_prompt`, `image_prompt_strength`, `seed`, `safety_tolerance`, `output_format`.
- `POST /v1/flux-kontext-pro` and `POST /v1/flux-kontext-max` — `prompt`, `input_image` (base64 or URL), `aspect_ratio`, `prompt_upsampling`, `seed`, `safety_tolerance`, `output_format`. ⚠ The official skills repo writes the Kontext pro path as **`/v1/flux-kontext`** in two places and never `-pro`; every other source (wrapper, api-evangelist, prior docs) uses `/v1/flux-kontext-pro`. Verify on docs.bfl.ai; support both in the adapter table.
- `POST /v1/flux-pro-1.0-fill` — `prompt`, `image` (base64), `mask` (base64; required for JPEG inputs, optional for PNG with alpha), `steps`, `guidance`, `seed`, `safety_tolerance`, `output_format`, `prompt_upsampling`. (Official `endpoints.md` also writes `/v1/flux-fill`; the pricing table in the same repo says `/v1/flux-pro-1.0-fill`.) `POST /v1/flux-pro-1.0-fill-finetuned` adds `finetune_id`, `finetune_strength` 0–2.
- `POST /v1/flux-pro-1.0-expand` — `image`, `prompt`, `top`/`bottom`/`left`/`right` (0–2048, at least one >0), `steps`, `guidance`, `seed`, `safety_tolerance`, `output_format`, `prompt_upsampling`.
- `POST /v1/flux-pro-1.0-canny` / `/v1/flux-pro-1.0-depth` — **unverified** in reachable sources (present in prior official docs with `control_image`, `preprocessed_image`, `canny_low_threshold`/`canny_high_threshold`, `steps`, `guidance`).
- `POST /v1/flux-3-video` — strict schema (unknown field → 422 "Extra inputs are not permitted"). `mode` selects the media field: `t2v` (none), `i2v` → `keyframes` (bare images or `[seconds, image]` pairs; ≥3 keyframes or any timestamped keyframe requires integer `duration`), `v2v` → `start_video`, `draft_enhance` → `draft_cache` (no other fields, not even `prompt`). Settings: `prompt`, `aspect_ratio`, `duration`, `resolution`, `generate_audio`, `draft`, `version`. Same submit/poll contract; results in `result.samples[]` (MP4) and `result.draft_caches[]`.
- `GET /v1/get_result?id=` — see above. `GET /v1/credits`.

Webhooks: pass `webhook_url` (+ `webhook_secret`); BFL POSTs `{id, status, result|error, timestamp}` and signs with `X-BFL-Signature: sha256=<hmac-hex>` when a secret is set (official `webhook-integration.md`). No cancel endpoint documented.

HTTP errors: 400 validation (`{"error": "validation_error", "message": ..., "details": {...}}`), 401 invalid key, 402 insufficient credits, 403, 404, 422 schema, 429 (`{"error": "rate_limit_exceeded", "message": ..., "retry_after": 5}`, plus `Retry-After` and `X-RateLimit-Limit/Remaining/Reset` headers), 500/502/503.

## Input media
- Images are JSON string fields: either a **public URL** (official: "Preferred: Use URLs directly … the API fetches URLs automatically") or a **raw base64 string** (no `data:` prefix in examples). Limit per image: 20 MB / 20 MP (search snippet from docs.bfl.ai Fill page). Formats jpeg/png/webp.
- Masks (`fill`): base64 image, white = area to regenerate; PNG alpha accepted instead.
- Multi-reference: `input_image`, `input_image_2` … `input_image_8` (FLUX.2), `reference_image_1..3` on Kontext (wrapper).
- FLUX 3: media "travels as a public URL or inline base64"; keyframe images ≥256×256.

## Output media
- `result.sample` is a **signed URL on Azure Blob that expires after 10 minutes** (official, repeated in every skill) — download/re-host immediately; never persist the URL. FLUX 3 video URLs expire "roughly one hour"; the `se=` query parameter on the URL is the authoritative expiry.
- Content type per `output_format` (`image/jpeg` default, `image/png`); video `video/mp4`.
- CORS on the blob host unverified (see above). No base64 output option.

## Rate limits, quotas, free tier
- Concurrency: 24 in-flight requests per account for standard endpoints; **Kontext Max 6** (official). 429 on submit means no task was created (resubmit after waiting); 429 on poll means keep polling.
- Prepaid credits only (no free tier documented; dashboard sign-up may grant trial credits — unverified). 402 when exhausted.
- Regional endpoints are separate clusters; the official doc says to verify whether their limits are independent before load-balancing.

## Gotchas
- **10-minute result URL expiry** — the proxy (or SPA) must fetch the bytes right after `Ready`, not store the link.
- Path naming drift: `flux-kontext` vs `flux-kontext-pro`, `flux-fill` vs `flux-pro-1.0-fill` inside the same official repo. Keep endpoint paths in a config table and validate against `https://api.bfl.ai/openapi.json` at build time.
- Moderation shows up as **poll statuses** (`Request Moderated`, `Content Moderated`), not HTTP errors, and is still terminal; `safety_tolerance` 0–6 (image) but 0–5 documented for FLUX.2.
- FLUX.2 billing is per megapixel **including input images** — I2I with several references costs more than T2I at the same output size.
- `polling_url` must be used verbatim (regional hosts); the GET also needs `x-key`.
- 429 semantics differ between submit and poll (see above).
- FLUX 3 result arrays: read `result.samples[]`/`result.draft_caches[]`, not the singular keys.

## Adapter mapping notes
- text→image → default `flux-2-pro`; quality `flux-2-max`; cheap `flux-2-klein-9b`; typography `flux-2-flex` (expose `steps`/`guidance`); legacy `flux-pro-1.1` / `-ultra` (`raw`, `aspect_ratio`).
- image→image → same FLUX.2 endpoint with `input_image[_n]` (multi-reference picker, ≤8 / ≤4 klein); Kontext as legacy option. inpaint → `flux-pro-1.0-fill` (mask painter, PNG alpha shortcut); outpaint → `flux-pro-1.0-expand` (four px inputs).
- video → `flux-3-video` with `mode` radio (t2v / i2v keyframes / v2v start_video), `draft` toggle for cheap previews then `draft_enhance` replay; audio toggle; longer poll timeout (minutes) and 1-h URL handling.
- Job model: uniform submit→`polling_url`→poll; store `{id, polling_url, region}`; treat `Ready` as success, the four failure strings as terminal errors; surface `cost` from the poll body when present.
- Input images: prefer uploading user images to our own public URL (R2) and passing the URL rather than base64 (smaller JSON, official preference).
- Proxy: forward `x-key` + JSON body; also proxy the blob download so the 10-minute link is consumed server-side; optional `webhook_url` pointing at the Worker for production.
