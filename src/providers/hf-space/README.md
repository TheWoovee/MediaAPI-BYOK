# hf-space — Hugging Face Spaces Provider

Direct-transport adapter that connects to any Gradio-based Space on Hugging Face.

## Transport

`direct` — the SPA calls `*.hf.space` origins directly from the browser. This
preserves per-IP ZeroGPU quota (requests are not proxied through the Worker).

## How it works

1. **Host resolution** — `GET https://huggingface.co/api/spaces/{space_id}/host`
   returns the runtime subdomain (e.g. `https://owner-name.hf.space`).

2. **Submit** — `POST {host}/gradio_api/call/{api_name}` with a JSON `data`
   array. Returns `{ event_id }`.

3. **Poll** — `GET {host}/gradio_api/call/{api_name}/{event_id}` returns a
   Server-Sent Events stream with `heartbeat`, `generating`, `complete`, and
   `error` events.

4. **Cancel** — `POST {host}/gradio_api/cancel` with `event_id`,
   `session_hash`, and `fn_index`.

## Authentication

An optional Hugging Face access token (`Bearer`) is sent on all requests via
the direct-transport layer. Public Spaces work without a token; gated or
private Spaces require one.

## Model

A single meta-model (`hf-space-custom` / "Space by URL") is registered. The
user supplies the Space ID and API endpoint name at generation time. In the
future, parameter discovery via `/gradio_api/info` may auto-populate the
parameter form.

## Capabilities

`text2image`, `image2image`, `text2video`, `image2video` — the actual
capability depends on what the target Space provides.
