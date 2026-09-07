# xAI Grok Imagine Adapter

**Last verified:** 2026-09-07

## Implemented

- **text2image** via `/v1/images/generations` (sync, b64_json format)
- **image2image** via `/v1/images/edits` (sync, single image as data URI)
- **text2video** and **image2video** via `/v1/videos/generations` (async, poll)
- **video_extend** via `/v1/videos/extensions` (async, poll)
- 4 models: grok-imagine-image-2.0, grok-imagine-image, grok-imagine-video-1.5, grok-imagine-video
- Video polling maps `pending→processing`, `done→succeeded`, `failed→failed`, `expired→failed`
- Moderation detection: `done` without URL treated as moderated/failed
- `testCredential` via `GET /v1/models`

## Retired models (not shipped)

- grok-2-image-1212 (retired 2026-05-15)
- grok-imagine-image-quality (retiring 2026-11-02)

## Unverified / needs live check

- Exact REST field nesting for `/v1/images/edits` image object
- Multi-image editing (up to 5 images) array field name
- Video edit endpoint (`/v1/videos/edits`)
- Reference-to-video with reference_images array
- Audio voice_id presets list
- Image URL expiry time (assumed 1h from batch API docs)
- CORS behavior of api.x.ai

## Cost hints

- Images: $0.02–$0.08/image depending on model and resolution
- Video: $0.05–$0.25/s depending on model and resolution
