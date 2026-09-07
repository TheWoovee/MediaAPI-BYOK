# Replicate Provider Adapter

Adapter for the [Replicate](https://replicate.com) prediction API, supporting both image and video generation models.

## Authentication

Requires a Replicate API token from <https://replicate.com/account/api-tokens>.
The token is sent as `Authorization: Bearer <token>` (handled by the proxy layer).

## Supported models

### Image generation

| Model | Capabilities | Price hint |
|---|---|---|
| `black-forest-labs/flux-schnell` | text2image | ~$0.003/image |
| `black-forest-labs/flux-dev` | text2image, image2image | ~$0.025/image |
| `black-forest-labs/flux-1.1-pro` | text2image | ~$0.04/image |
| `black-forest-labs/flux-1.1-pro-ultra` | text2image | ~$0.06/image |
| `black-forest-labs/flux-kontext-pro` | image2image | ~$0.04/image |
| `black-forest-labs/flux-kontext-max` | image2image | ~$0.08/image |
| `black-forest-labs/flux-fill-pro` | inpaint | price unverified |
| `black-forest-labs/flux-2-pro` | text2image, image2image | ~$0.055/image |
| `bytedance/seedream-5-lite` | text2image | ~$0.035/image |

### Video generation

| Model | Capabilities | Price hint |
|---|---|---|
| `google/veo-3.1` | text2video, image2video | $0.20-0.40/s |
| `google/veo-3.1-fast` | text2video, image2video | $0.10-0.15/s |
| `wan-video/wan-2.7-t2v` | text2video | ~$0.10/s |
| `kwaivgi/kling-v2.5-turbo-pro` | text2video, image2video | ~$0.35/5s |
| `bytedance/seedance-1-pro` | text2video, image2video | price varies |

## API flow

1. **Submit** -- `POST /v1/models/{owner}/{name}/predictions` with `{"input": {...}}`.
   For image models, sends `Prefer: wait=55` to attempt synchronous completion.
2. **Poll** -- `GET /v1/predictions/{id}`.
   Maps Replicate status to app states: `starting` -> `queued`, `processing` -> `processing`, `succeeded`/`failed`/`canceled`.
3. **Cancel** -- `POST /v1/predictions/{id}/cancel`.
4. **Test credential** -- `GET /v1/account`.

## Output handling

Replicate outputs are URLs on `replicate.delivery` that expire after approximately 1 hour.
The adapter normalizes these to `NormalizedOutput` with `source: 'url'` and `expires_at` set to 1 hour from poll time.

Output type is inferred from the capability (video capabilities produce `kind: 'video'`) and file extension.
