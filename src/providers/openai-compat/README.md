# OpenAI-Compatible Adapter

**Last verified:** 2026-09-07

## Implemented

- **text2image** via `/v1/images/generations` (OpenAI-compatible endpoint)
- Dynamic model listing from `/v1/models` with fallback to a generic default
- Sends `response_format: "b64_json"` for direct rendering
- Transport: `local` (connects to user-configured local server)

## Usage

Works with any server that implements the OpenAI images API:
- Together AI, Fireworks, etc. (via saved local server)
- Local inference servers (vLLM, LocalAI, etc.)

## Unverified / needs live check

- Image editing support varies by server
- Response shape differences across implementations
- URL vs b64_json support per server

## Cost hints

- Depends on the target server/provider
