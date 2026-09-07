# Google Gemini / Veo Adapter

**Last verified:** 2026-09-07

## Implemented

- **text2image** via `generateContent` on Nano Banana models (sync)
- **image2image** via `generateContent` with inline_data image parts (sync)
- **text2video** and **image2video** via `predictLongRunning` on Veo 3.1 (async, poll)
- **video_extend** via `predictLongRunning` with video URI (async)
- 6 models: gemini-3.1-flash-image, gemini-3.1-flash-lite-image, gemini-2.5-flash-image, veo-3.1-generate-preview, veo-3.1-fast-generate-preview, veo-3.1-lite-generate-preview
- Live model listing from `GET /v1beta/models` merged with static list
- Video polling: `done:false→processing`, `done:true+response→succeeded`, `done:true+error→failed`
- RAI filtering detection (raiMediaFilteredCount/Reasons)
- Video output expires_at: 48h (from docs)
- Transport: `direct` (CORS confirmed working)
- `testCredential` via `GET /v1beta/models`

## Retired models (not shipped)

- Imagen 4 (shutdown 2026-08-17)
- Veo 3.0/2.0 (shutdown 2026-06-30)

## Unverified / needs live check

- gemini-3-pro-image-preview availability (deprecation page listed 2026-06-25 shutdown)
- Nano Banana 2 Lite exact pricing
- Free tier availability for gemini-3.1-flash-image
- personGeneration regional restrictions (EU/UK/CH/MENA)
- Interactions API migration (using legacy generateContent, still supported)
- Video extension math: 141s vs 148s max total
- Cancel/webhook support for API-key users

## Cost hints

- Images: ~$0.039–$0.151 per image depending on model and size
- Veo 3.1: $0.40/s (720p/1080p), $0.60/s (4K)
- Veo 3.1 Fast: $0.10–$0.30/s
- Veo 3.1 Lite: $0.05–$0.08/s
