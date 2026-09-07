# hf-inference provider adapter

Routes generation requests through the **Hugging Face Inference Router**
(`router.huggingface.co`). The router fans out to different inference
providers (fal-ai, replicate, hf-inference native, etc.) depending on the
model.

## Architecture

```
User request
  |
  v
hfInferenceAdapter.submit()
  |
  +-- providerMapping lookup
  |
  +-- hf-inference native (synchronous)
  |     POST /hf-inference/models/{model_id}
  |     Returns raw image bytes immediately
  |
  +-- fal-ai via router (queue-based)
        POST /fal-ai/{providerId}?_subdomain=queue
        Returns { request_id, status_url, response_url }
        Poll status -> fetch result when COMPLETED
```

## Supported models

| Model | Capability | Backend |
|---|---|---|
| `black-forest-labs/FLUX.1-dev` | text2image | fal-ai |
| `black-forest-labs/FLUX.1-schnell` | text2image | fal-ai |
| `stabilityai/stable-diffusion-3-medium-diffusers` | text2image | hf-inference (native) |
| `black-forest-labs/FLUX.1-Kontext-dev` | image2image | fal-ai |
| `Wan-AI/Wan2.2-TI2V-5B` | text2video | fal-ai |
| `tencent/HunyuanVideo` | text2video | fal-ai |

## Auth

Requires a Hugging Face access token with Inference API permissions.
The token is sent as `Authorization: Bearer <token>` to the router.

## Proxy notes

Only `router.huggingface.co` is in the allowlist. The Hub API
(`huggingface.co/api/...`) is not reachable through the proxy, so
model discovery uses a static catalogue rather than a live API call.

## Adding models

1. Add the model spec to `models.ts` (params, capabilities).
2. Add the provider mapping entry to `providerMapping` in the same file.
3. If the backend uses a pattern not yet handled (e.g. replicate via HF
   router), add the submit/poll logic in `adapter.ts`.
