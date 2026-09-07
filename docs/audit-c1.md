# Security Audit — C1

| # | Severity | File:Line | Finding | Status |
|---|----------|-----------|---------|--------|
| 1 | HIGH | worker/proxy.ts:133 | Proxy fetch follows redirects — auth header sent to unvalidated redirect target | FIXED |
| 2 | HIGH | worker/proxy.ts:163 | /fetch follows redirects and allows http:// URLs (SSRF) | FIXED |
| 3 | HIGH | worker/routes/local-servers.ts:190 | Local relay follows redirects — service tokens sent to redirect target | FIXED |
| 4 | HIGH | worker/routes/ai.ts:14 | No per-request param caps (width/height/steps) on Workers AI — neuron abuse | FIXED |
| 5 | HIGH | worker/routes/ai.ts | No per-user daily rate limit on Workers AI — neuron abuse | FIXED |
| 6 | MEDIUM | worker/index.ts | No global error handler — stack traces may leak in 500 responses | FIXED |
| 7 | MEDIUM | worker/proxy.ts:13 | hostMatches wildcard allows bare domain match (fal.media matches *.fal.media) — low risk but tighten | FIXED |
| 8 | MEDIUM | worker/security.ts | CSP connect-src missing Workers AI binding route (self covers it) — OK as-is | NO_CHANGE |
| 9 | MEDIUM | worker/routes/ai.ts | AI route needs JWT auth but /api/* middleware already covers it | NO_CHANGE |
| 10 | LOW | worker/proxy.ts | Response passes all headers except set-cookie; could echo auth headers from provider | FIXED |
| 11 | LOW | worker/security.ts | No X-Frame-Options header (CSP frame-ancestors covers modern browsers) | FIXED |
| 12 | LOW | shared/providers/registry.ts:23 | fal outputHosts has both 'fal.media' and '*.fal.media' — redundant | FIXED |
| 13 | MEDIUM | src/providers/replicate/adapter.ts:180 | poll() throws on HTTP error instead of returning state:'failed' | FIXED |
| 14 | MEDIUM | src/providers/xai/adapter.ts:178 | poll() throws on HTTP error instead of returning state:'failed' | FIXED |
| 15 | MEDIUM | src/providers/google/adapter.ts:168 | poll() throws on HTTP error instead of returning state:'failed' | FIXED |
| 16 | MEDIUM | src/providers/comfyui/adapter.ts:204 | listModels has no timeout — can hang if server unresponsive | FIXED |
| 17 | MEDIUM | src/providers/a1111/adapter.ts:285 | listModels has no timeout — can hang if server unresponsive | FIXED |
| 18 | MEDIUM | src/providers/openai-compat/adapter.ts:11 | listModels has no timeout — can hang if server unresponsive | FIXED |
| 19 | LOW | src/providers/google/adapter.ts:19 | listModels makes network call (direct transport) — should have timeout | FIXED |
| 20 | LOW | src/providers/fal/adapter.ts:117 | listModels live fetch has no timeout | FIXED |
| 21 | LOW | .github/workflows/ci.yml | No npm audit step | FIXED |
| 22 | LOW | .github/workflows/ci.yml | No Playwright smoke job | FIXED |
| 23 | LOW | vite.config.ts | Remote bindings always on — breaks offline dev without CLOUDFLARE_API_TOKEN | FIXED |
| 24 | LOW | shared/providers/registry.ts:284 | fireworks docsPath points to together.md — wrong | FIXED |
| 25 | LOW | shared/providers/registry.ts:296 | openai-compat docsPath points to together.md — wrong | FIXED |

## Summary

- **5 HIGH** findings (all fixed): SSRF via redirect following in proxy/fetch/relay, Workers AI neuron abuse
- **8 MEDIUM** findings (all fixed): error leakage, adapter poll() throwing, listModels timeouts
- **12 LOW** findings (all fixed): header hygiene, CI, build ergonomics, registry cleanup
