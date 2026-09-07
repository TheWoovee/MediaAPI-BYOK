# Cloudflare Workers AI Adapter

**Last verified:** 2026-09-07

## Implemented

- **text2image** via AI binding (no credential) or REST API (with `accountId:token` credential)
- 9 models: FLUX.1 Schnell, FLUX.2 Klein 4B/9B, FLUX.2 Dev, Leonardo Lucid Origin/Phoenix, SDXL Base/Lightning, DreamShaper 8 LCM
- Synchronous generation (no polling needed)
- SD models return raw PNG bytes, Flux/Leonardo return base64 JSON
- `testCredential` generates a 256px test image with flux-1-schnell (4 steps)

## Credential format

- **Binding path (no credential):** Uses the site owner's AI binding — zero-cost, no key needed
- **REST path:** Credential stored as `accountId:token` (the adapter splits on `:`)

## Unverified / needs live check

- flux-2 multipart edit field names (image2image/inpaint not implemented until confirmed)
- SD v1.5 img2img/inpainting param shapes
- Exact neuron costs for Leonardo models
- bytedance/stable-diffusion-xl-lightning availability

## Cost hints

- flux-1-schnell: ~58 neurons/image at 1024², ~170 free images/day (10k neurons free)
- Leonardo models: ~2500–3000+ neurons/image
- Beyond free tier: $0.011 per 1,000 neurons
