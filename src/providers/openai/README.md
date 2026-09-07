# OpenAI Images Adapter

**Last verified:** 2026-09-07

## Implemented

- **text2image** via `/v1/images/generations` (sync)
- **image2image** via `/v1/images/edits` (JSON for GPT models, multipart for DALL-E 2)
- **inpaint** via `/v1/images/edits` with alpha mask
- 6 models: gpt-image-2, gpt-image-1.5, gpt-image-1, gpt-image-1-mini, dall-e-3, dall-e-2
- GPT models always return b64_json; DALL-E uses response_format b64_json
- `model` always sent explicitly (gotcha: default is dall-e-2 otherwise)
- `input_fidelity` excluded for gpt-image-1-mini (would 400)
- `testCredential` via `GET /v1/models`

## Not implemented (deliberately)

- Videos API (Sora 2): shuts down 2026-09-24, not worth building
- Streaming previews (SSE partial_images): future enhancement
- dall-e-2 variations endpoint

## Unverified / needs live check

- Exact per-image token pricing for GPT models
- gpt-image-2 arbitrary size validation (divisible-by-16, 1:3–3:1 aspect)
- background:transparent behavior with output_format constraints
- Organization verification requirements for gpt-image-2
- CORS behavior of api.openai.com

## Cost hints

- Token-based pricing varies by model and output size
- See OpenAI pricing calculator
