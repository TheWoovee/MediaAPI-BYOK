# AUTOMATIC1111 / Forge adapter

Last verified: 2026-09-07

## Implemented capabilities

- `text2image` — `POST /sdapi/v1/txt2img` (`a1111-txt2img` model)
- `image2image` / `inpaint` — `POST /sdapi/v1/img2img` (`a1111-img2img` model; inpaint is the same
  endpoint with `mask` set)
- `upscale` — `POST /sdapi/v1/extra-single-image` (`a1111-upscale` model)

Not implemented: `remove_bg`, `text2video`, `image2video`, `video2video`, `video_extend` — the
stock A1111/Forge API has no equivalent endpoints.

## How it works

A1111/Forge's generation endpoints are **synchronous** — the HTTP call itself blocks until the
image is fully generated, there is no job-id-plus-poll flow like ComfyUI or most cloud providers.
To fit the adapter's async `submit()` / `poll()` contract:

1. `submit()` fires the `txt2img`/`img2img`/`extra-single-image` request but does **not** await
   it to completion. The in-flight `Promise` (and its eventual result or error) is kept in a
   module-level `Map` keyed by a generated job id; only that id and the endpoint path — both
   plain strings — go into the serializable `JobHandle.provider_ref`.
2. `poll()` looks the job id up in that map. While the request is still in flight it reports
   progress from `GET /sdapi/v1/progress` (sampling step / ETA). Once the original request has
   resolved, `poll()` parses the stored response (base64 images + the `info` JSON string for
   seeds/dimensions) and returns `succeeded`/`failed`.
3. `cancel()` posts `POST /sdapi/v1/interrupt` and marks the local job entry cancelled.

Because the job map lives in the browser tab's memory, it does **not** survive a page reload —
a job submitted before a refresh can no longer be polled to completion (A1111 has no
job-id-based status endpoint to reattach to). This is a known limitation of the underlying API,
not something this adapter can work around.

## Required launch flags

Start A1111/Forge with at least:

```
--api --cors-allow-origins=*
```

- `--api` enables the `/sdapi/v1/*` routes this adapter calls; without it every request 404s.
- `--cors-allow-origins` (or a more specific origin) is required for direct-mode browser fetches
  to succeed — otherwise use relay mode, where the Worker proxies requests and CORS doesn't
  matter.
- If the server was started with `--api-auth user:pass`, HTTP Basic auth is required on every
  `/sdapi/v1/*` call; this is wired up via the provider's `auth` config (`Authorization` header)
  but has not been exercised against a live `--api-auth` server as part of this change.

## Relay mode and timeouts

**In relay mode, the whole synchronous generation call must complete inside the platform's
~120s proxy timeout.** Because A1111 blocks until the image is done, a slow hires-fix pass, a
large batch, or a big/high-step SDXL/Flux render can easily exceed that window — the relay will
time out even though A1111 is still working, and the adapter has no way to recover the result
afterward (the underlying fetch will reject, and A1111 has no endpoint to fetch a "shatch" you
missed). Prefer direct local mode for anything but small/fast generations, or keep step counts
and resolutions modest when relaying.

## Forge compatibility notes

- Forge detection: `GET /sdapi/v1/sd-modules` returns 200 on Forge, 404 on stock A1111.
  `listModels()` uses this to note Forge support in the model description; it does not change
  request shape.
- `distilled_cfg_scale` (top-level field on `txt2img`/`img2img`) is a Forge-specific control for
  Flux's distilled CFG; it's exposed as an advanced param on both `txt2img` and `img2img` and is
  only included in the request body when set. Stock A1111 silently ignores unknown fields, so
  it's safe to send even when talking to a non-Forge server, but there's no benefit to doing so.
- `override_settings.forge_additional_modules` (for split Flux checkpoints, e.g. separate
  UNet/VAE/text-encoder files) is **not** currently exposed as a param — Forge users with split
  checkpoints need to pre-select modules via the Forge UI/settings before generating through this
  adapter.

## Output handling

- `images`/`image` come back as raw base64 PNG (no `data:` URI prefix) — outputs are returned as
  `NormalizedOutput` with `source: 'base64'`, `mime: 'image/png'`, and no `expires_at` (there's
  nothing to expire; the bytes are already in the response).
- Seed/width/height come from parsing the stringified `info` field on the JSON response, not
  from `parameters`. `all_seeds[i]` is used per-image when a batch/`n_iter` produced more than one
  image, falling back to the single `seed` field.
- When `batch_size > 1` or a multi-`n` request is made, `override_settings.return_grid: false` is
  always sent to avoid a trailing grid image mixed in with the real outputs.

## Unverified / known gaps

- **Forge Neo video capabilities** (if/when Forge ships txt2video-style endpoints) are not
  covered — this adapter only implements the classic image `sdapi/v1/*` surface.
- **SD.Next** (a A1111-API-compatible fork) has not been tested end-to-end; it aims for
  compatibility but may diverge on scheduler naming, `distilled_cfg_scale` handling, or extra
  required fields.
- **`force_task_id` correlation**: newer A1111/Forge builds accept a `force_task_id` field to let
  clients correlate an interrupt/progress call with a specific request when multiple queued jobs
  are possible. This adapter does not send or track `force_task_id` — `cancel()` interrupts
  whatever job A1111 currently has active, which is fine for the single-job-at-a-time model this
  adapter assumes, but would misbehave if multiple browser tabs fire concurrent jobs at the same
  server.
- HTTP Basic auth (`--api-auth`) is wired through the provider's auth header config but has not
  been tested against a live server with that flag enabled.
