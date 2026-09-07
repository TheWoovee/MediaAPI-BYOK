# fal.ai Provider Adapter

Last verified: 2026-09-07

## Implemented Capabilities

- **text2image** - FLUX Schnell/Dev/Pro/Pro Ultra/2, Ideogram v3, Recraft v3
- **image2image** - FLUX Dev/2, FLUX Pro Kontext
- **upscale** - AuraSR
- **text2video** - Kling v2.5 Turbo, Veo 3, Wan v2.2 14B, HunyuanVideo, LTX-Video 2
- **image2video** - Kling v2.5 Turbo, Veo 3, Wan v2.2 14B

## API Surface

- Submit: `POST https://queue.fal.run/{model_id}` (async queue)
- Poll: `GET {status_url}` returned by submit
- Result: `GET {response_url}` when status is COMPLETED
- Cancel: `PUT {cancel_url}`
- Auth test: `GET https://api.fal.ai/v1/models?limit=1`

## Auth

Header: `Authorization: Key {id}:{secret}` - key pair from fal.ai/dashboard/keys.

## Unverified / Future Work

- Live model list enrichment from `GET /v1/models` (currently fetched but not merged into static list)
- Webhook-based completion (fal supports webhooks; adapter uses polling)
- Streaming/progressive output for supported models
- LoRA and ControlNet parameter passthrough
- File upload via fal's own upload endpoint (`storage.fal.ai`)

## Cost Hints

| Model | Approximate Cost |
|-------|-----------------|
| FLUX Schnell | ~$0.003/image |
| FLUX Dev | ~$0.025/image |
| FLUX Pro v1.1 | ~$0.05/image |
| FLUX Pro Ultra | ~$0.06/image |
| Kling v2.5 Turbo | ~$0.14/5s video |
| Veo 3 | ~$0.50/video |
| Wan v2.2 14B | ~$0.09/video |
| HunyuanVideo | ~$0.11/video |
| LTX-Video 2 | ~$0.03/video |

Prices are estimates and vary by resolution/duration. Check fal.ai/pricing for current rates.
