# RunPod Provider Adapter

RunPod serverless GPU inference provider for MediaAPI-BYOK.

## Supported Models

### Public Endpoints (fixed schemas)

| Model ID | Capability | Price |
|---|---|---|
| `black-forest-labs-flux-1-dev` | text2image | $0.02/megapixel |
| `black-forest-labs-flux-1-schnell` | text2image | $0.0024/megapixel |
| `black-forest-labs-flux-1-kontext-dev` | image2image | $0.025/image |

### Custom Serverless Endpoint

The `runpod-custom-endpoint` meta-model lets users connect any RunPod serverless endpoint by providing:
- **endpoint_id** - The endpoint slug from the RunPod dashboard
- **input_json** - Raw JSON object sent as the `input` field

## API Flow

RunPod uses an async job pattern:

1. **Submit**: `POST https://api.runpod.ai/v2/{endpoint_slug}/run` with `{"input": {...}}`
   - Returns `{"id": "uuid", "status": "IN_QUEUE"}`

2. **Poll**: `GET https://api.runpod.ai/v2/{endpoint_slug}/status/{job_id}`
   - Status values: `IN_QUEUE`, `IN_PROGRESS`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`, `TIMED_OUT`

3. **Cancel**: `POST https://api.runpod.ai/v2/{endpoint_slug}/cancel/{job_id}`

## Output Normalization

Public endpoints return output URLs on `image.runpod.ai` (7-day expiry):
- `{ image_url: "https://image.runpod.ai/..." }`
- `{ video_url: "https://image.runpod.ai/..." }`

Custom endpoints may return various shapes:
- Plain string URL
- `{ image_url: "..." }`
- `{ images: ["data:image/png;base64,..."] }` (worker-sdxl pattern)

## Authentication

RunPod API key via `Authorization: Bearer <key>`. Credential test hits the schnell endpoint's `/health` route.

## Payload Limit

RunPod has a **10 MB** payload limit on `/run`. For base64-encoded image inputs exceeding ~7 MB, use `ctx.uploadTemp()` to get a URL instead.

## Files

- `models.ts` - Static model catalogue
- `adapter.ts` - `ProviderAdapter` implementation
- `adapter.test.ts` - Vitest tests
- `index.ts` - Barrel export
