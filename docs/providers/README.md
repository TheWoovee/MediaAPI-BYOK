# Provider research

One file per provider, all following `_TEMPLATE.md`. Each file states how it was verified (official
docs, official OpenAPI specs, official SDK sources) and marks anything unconfirmed as "unverified".
Cross-provider conclusions are summarised in `../PLAN.md` section 2 and the matrix in section 3.6.

| File | Provider | Wave | Transport |
|------|----------|------|-----------|
| `xai.md` | xAI Grok Imagine (image 2.0, video 1.5) | 1 | proxy |
| `fal.md` | fal.ai queue API and model catalogue | 1 | proxy (direct candidate) |
| `google.md` | Gemini API: native image models, Veo 3.1 | 1 | direct (CORS verified) |
| `openai.md` | OpenAI Images (gpt-image-2 and older); Sora deprecated | 1 | proxy |
| `replicate.md` | Replicate predictions, files, search | 1 | proxy |
| `comfyui.md` | ComfyUI HTTP API and CORS flags | 1 | direct |
| `byteplus-ark.md` | BytePlus ModelArk: Seedream, Seedance | 2 | proxy |
| `venice.md` | Venice.ai images, edits, video queue | 2 | proxy |
| `kling.md` | Kling open API (JWT auth) | 2 | proxy |
| `stability.md` | Stability AI v2beta | 2 | proxy |
| `bfl.md` | Black Forest Labs Flux API | 2 | proxy |
| `huggingface-inference.md` | HF Inference Providers router | 2 | proxy |
| `huggingface-spaces.md` | HF Spaces / Gradio API | 2 | direct |
| `runpod.md` | RunPod serverless, public endpoints, pods | 2 | proxy / direct (pods) |
| `a1111-forge.md` | AUTOMATIC1111 / Forge API | 2 | direct |
| `minimax.md` | MiniMax Hailuo | 3 | proxy |
| `runway.md` | Runway dev API | 3 | proxy |
| `luma.md` | Luma Dream Machine | 3 | proxy |
| `ideogram.md` | Ideogram v3 | 3 | proxy |
| `recraft.md` | Recraft v3/v4 | 3 | proxy |
| `leonardo.md` | Leonardo.Ai | 3 | proxy |
| `wavespeed.md` | WaveSpeedAI | 3 | proxy |
| `together.md` | Together AI and Fireworks | 3 | proxy |
| `swarmui-invoke.md` | SwarmUI and InvokeAI | 3 | direct |
| `local-access.md` | Browser → local server rules, Cloudflare Tunnel, Access, Tailscale | – | – |
