# Cloudflare Workers AI

- Website / docs: https://developers.cloudflare.com/workers-ai/ · models: https://developers.cloudflare.com/workers-ai/models/ · pricing: https://developers.cloudflare.com/workers-ai/platform/pricing/ · REST: https://developers.cloudflare.com/workers-ai/get-started/rest-api/
- Last verified: 2026-09-06 (from the cloudflare-docs source repo, since the docs site is blocked from this sandbox; re-verify before shipping)
- Adapter id: `cf-workers-ai`  ·  Transport: Worker **binding** for the site owner, `proxy` (REST) for other users with their own Cloudflare token  ·  Priority wave: 1

## Account and authentication
- Nothing to sign up for: it is part of the Cloudflare account that already hosts the site.
- Owner path: add `"ai": { "binding": "AI" }` to `wrangler.jsonc` and call `env.AI.run(model, input)` in the Worker. No key at all.
- Other users (BYOK): a Cloudflare API token with **Workers AI – Read** and **Workers AI – Edit**, plus their Account ID. REST: `POST https://api.cloudflare.com/client/v4/accounts/{ACCOUNT_ID}/ai/run/{model}` with `Authorization: Bearer <token>`.
- Base URL: `https://api.cloudflare.com/client/v4`

## Browser (CORS) behaviour
- Not tested (sandbox egress blocked). Irrelevant for the owner path (binding). REST path goes through the proxy.

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | yes | flux-1-schnell, flux-2-klein-4b, flux-2-klein-9b, flux-2-dev, lucid-origin, phoenix-1.0, stable-diffusion-xl-base-1.0, stable-diffusion-xl-lightning, dreamshaper-8-lcm |
| image→image / edit / inpaint | yes | flux-2 family ("unifies generation and editing", multipart input), stable-diffusion-v1-5-img2img, stable-diffusion-v1-5-inpainting |
| upscale | no | – |
| text→video | no | – |
| image→video | no | – |
| video→video / extend | no | – |
| audio in video | no | – |

## Models
| Model id | Type | Key params | Limits | Price (neurons; 10,000/day free, then $0.011 per 1,000) |
|---------|------|-----------|--------|-------|
| `@cf/black-forest-labs/flux-1-schnell` | t2i | `prompt` (1–2048 chars), `steps` (default 4, max 8) | fixed output size | 4.80 per 512×512 tile + 9.60 per step → about 58 neurons for a 1024² image at 4 steps, roughly **170 free images/day** |
| `@cf/black-forest-labs/flux-2-klein-4b` | t2i + edit | multipart body (`prompt`, input images) | partner model, BFL terms | 5.37 per input tile, 26.05 per output tile → about 105 neurons per 1024² image |
| `@cf/black-forest-labs/flux-2-klein-9b` | t2i + edit | multipart | partner | 1,363.64 first megapixel, 181.82 per further MP |
| `@cf/black-forest-labs/flux-2-dev` | t2i + multi-reference edit | multipart | partner | 18.75 per input tile/step, 37.50 per output tile/step |
| `@cf/leonardo/lucid-origin` | t2i | `prompt`, `guidance` 0–10 (4.5), `seed`, `width`/`height` 0–2500 (1120), `num_steps` 1–40 | no image input | 636 per tile + 12 per step → about 3,000+ neurons per image; a few free per day |
| `@cf/leonardo/phoenix-1.0` | t2i | similar to lucid-origin | – | 530 per tile + 10 per step |
| `@cf/stabilityai/stable-diffusion-xl-base-1.0` | t2i, img2img | `prompt`, `negative_prompt`, `height`/`width` 256–2048, `image`/`image_b64`, `mask`, `num_steps` ≤20, `strength`, `guidance`, `seed` | returns PNG **bytes**, not JSON | not in the current pricing table (unverified) |
| `@cf/runwayml/stable-diffusion-v1-5-inpainting`, `-img2img` | edit | `image` (byte array), `mask`, `prompt`, `strength` | bytes out | unverified |

## Endpoints (exact)
- Binding: `const out = await env.AI.run('@cf/black-forest-labs/flux-1-schnell', { prompt, steps: 4 })` → `{ image: '<base64 png/jpeg>' }` for Flux and Leonardo models; a `ReadableStream` of PNG bytes for the Stable Diffusion models.
- REST: `POST /accounts/{ACCOUNT_ID}/ai/run/{model}` JSON body as above → `{ "result": { "image": "<base64>" }, "success": true, "errors": [], "messages": [] }` (SD models return `image/png` bytes).
- All synchronous; typical latency 2–10 s. No job ids, no polling, no cancel.
- flux-2 models take a multipart body (`multipart.body`, `multipart.contentType` in the schema); the exact field names for reference images are **unverified** and must be read from the live model page before implementing edits.

## Input media
- SD img2img/inpainting: `image` as byte array (binding) or base64 (`image_b64`); mask as byte array. flux-2: multipart. No URLs.

## Output media
- Base64 in JSON (Flux, Leonardo) or raw PNG bytes (SD). No hosted URL, nothing to expire.

## Rate limits, quotas, free tier
- **10,000 neurons per day free** on Free and Paid Workers plans, resets 00:00 UTC; beyond that $0.011 per 1,000 neurons (requires Workers Paid). Per-model rate limits are published on each model page (typically hundreds of requests per minute).

## Gotchas
- Neuron cost of Leonardo models is two orders of magnitude above flux-1-schnell; default the UI to schnell and show the neuron estimate.
- Partner models (BFL, Leonardo) carry the partner's terms of service.
- The binding path uses the site owner's quota for every logged-in user; make it owner-only or give each invited user the REST path with their own token.

## Adapter mapping notes
- `text2image` → binding/REST `run` with a per-model param schema; `image2image`/`inpaint` → SD 1.5 img2img/inpainting and flux-2 multipart once field names are confirmed.
- Output normalised as `{ source: 'base64' | 'bytes' }`; no `/fetch` step needed.
- This is the zero-cost smoke-test target for the whole pipeline (job runner, forms, download) before spending on any external provider.
