# <Provider name>

- Website / docs: <urls>
- Last verified: <YYYY-MM-DD> (by web research; re-verify before shipping the adapter)
- Adapter id: `<id>`  ·  Transport: `proxy` | `direct`  ·  Priority wave: 1 | 2 | 3

## Account and authentication
- How to get a key (signup URL, console path, free credits if any)
- Auth header exact format (e.g. `Authorization: Bearer <key>`, `x-api-key`, `Key <id>:<secret>`)
- Base URL(s) and regions

## Browser (CORS) behaviour
- Result of preflight test from origin https://www.thewoovee.com (allowed / blocked / unknown) and how it was tested

## Capabilities
| Capability | Supported | Models / endpoints |
|-----------|-----------|--------------------|
| text→image | | |
| image→image / edit / inpaint | | |
| upscale | | |
| text→video | | |
| image→video | | |
| video→video / extend | | |
| audio in video | | |

## Models
| Model id | Type | Key params (size/aspect/duration/resolution/fps) | Limits | Price |
|---------|------|-----------------------------------------------|--------|-------|

## Endpoints (exact)
For each: method + full URL, request JSON (minimal + notable optional fields), response JSON shape,
sync or async, how to poll (path, status values, recommended interval), webhooks if any, cancel if any.

## Input media
- How input images/videos/masks are passed (base64 data URI / public URL / provider upload API, with size limits)

## Output media
- URL (expiry) or base64; content types; whether output host allows browser fetch (CORS) or needs the proxy

## Rate limits, quotas, free tier

## Gotchas

## Adapter mapping notes
- Which of our capabilities map to which endpoint, param translation, anything that needs special UI
