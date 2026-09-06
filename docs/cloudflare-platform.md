# Cloudflare platform facts for `https://www.thewoovee.com/studio`

Researched 2026-09-06. Context: zone `thewoovee.com` on the Cloudflare Free plan; `www` already serves an
existing site (probably Cloudflare Pages, unconfirmed); the new app is a React/Vite SPA + Worker API for a
closed, invited group; provider API keys are stored server-side encrypted; the Worker proxies provider calls.

**How this was verified.** `developers.cloudflare.com` is blocked from this sandbox's egress proxy, so every
fact below was read from the docs *source* (the MDX files in `cloudflare/cloudflare-docs`, branch `production`,
which is what developers.cloudflare.com renders), plus the `cloudflare/workers-sdk` and
`cloudflare/wrangler-action` repos and the npm registry. Doc URLs are given in their public form. Items that
could not be confirmed from an official page are marked **unverified**.

---

## 1. Workers Static Assets

Docs:
- https://developers.cloudflare.com/workers/static-assets/
- https://developers.cloudflare.com/workers/static-assets/binding/
- https://developers.cloudflare.com/workers/static-assets/routing/single-page-application/
- https://developers.cloudflare.com/workers/static-assets/routing/worker-script/
- https://developers.cloudflare.com/workers/static-assets/routing/advanced/serving-a-subdirectory/
- https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/
- https://developers.cloudflare.com/workers/wrangler/configuration/#assets

### `assets` config keys (wrangler.jsonc)

| Key | Type / default | Meaning |
|---|---|---|
| `directory` | string, optional | Folder of built assets (`./dist/`). "Not required when using the Cloudflare Vite plugin" (the plugin fills it in). |
| `binding` | string, optional | Exposes the asset store as `env.ASSETS` (only meaningful when `main` is set). |
| `html_handling` | `"auto-trailing-slash"` (default) \| `"force-trailing-slash"` \| `"drop-trailing-slash"` \| `"none"` | Redirect/rewrite behaviour for HTML paths. |
| `not_found_handling` | `"none"` (default) \| `"single-page-application"` \| `"404-page"` | `single-page-application`: requests that match no asset get **`/index.html` with `200`**. |
| `run_worker_first` | `boolean \| string[]`, default `false` | `false`: matching asset served without invoking the Worker. `true`: Worker always runs first. Array: glob patterns (`*` deep-matches, `!` prefix = exception), **max 100 entries**, needs **Wrangler >= 4.20.0**. |

Reference SPA + API config from the docs:

```jsonc
{
  "name": "my-worker",
  "compatibility_date": "2026-09-06",
  "main": "./src/index.ts",
  "assets": {
    "directory": "./dist/",
    "not_found_handling": "single-page-application",
    "binding": "ASSETS",
    "run_worker_first": ["/api/*", "!/api/docs/*"]
  }
}
```

Routing order (default): "first attempt to serve static assets if one matches the incoming request", then
"invoke your Worker script" if no asset matches. Navigation requests are identified by `Sec-Fetch-Mode: navigate`.

`env.ASSETS.fetch(request | URL | string)` returns the asset response with `html_handling` / `not_found_handling`
applied; "the hostname is non-functional; only the pathname matches assets" (so `env.ASSETS.fetch(new URL("/index.html", request.url))` works).

### Billing on Free

"Requests to static assets are free and unlimited. Requests to the Worker script ... are billed according to
Workers pricing." Free-plan caveat: paths matched by `run_worker_first` **always** invoke the Worker, and once the
daily 100k Worker requests are exhausted "these requests will receive a 429 (Too Many Requests) response instead
of falling back to static asset serving."

Asset limits (from https://developers.cloudflare.com/workers/platform/limits/): 20,000 files per Worker (Free) /
100,000 (Paid); 25 MiB per file.

### Serving the SPA under `/studio/`

- `assets.directory` does **not** take a URL prefix. The documented pattern (Wrangler >= 3.98.0) is to mirror the
  path in the directory: put files in `dist/studio/index.html`, `dist/studio/assets/...`, set
  `"assets": { "directory": "dist" }`, and route the Worker to `www.thewoovee.com/studio/*`. Then
  `.../studio/` serves `dist/studio/index.html` and `.../studio/assets/x.js` serves `dist/studio/assets/x.js`.
- Vite: set `base: '/studio/'` so `index.html` references `/studio/assets/...`, and `build.outDir: 'dist/studio'`
  (plain Vite) so files land in the subfolder. Vite's `base` only rewrites URLs; it does not nest output.
- **SPA fallback gotcha:** `not_found_handling: "single-page-application"` serves **`/index.html` at the asset
  root**, not `/studio/index.html`. The subdirectory doc says files outside the routed path "won't be served unless
  they're part of SPA fallback handling or custom 404 pages", i.e. the fallback still comes from the root. Two
  working options:
  1. also emit a copy of the built `index.html` at `dist/index.html` (free asset serving for everything), or
  2. run the Worker for `/studio/*` (`run_worker_first: ["/studio/*"]`), handle `/studio/api/*` yourself, and for
     navigation requests return `env.ASSETS.fetch(new URL("/studio/index.html", request.url))`. Every such request
     is a billable Worker invocation (fine for a closed group; see 100k/day).
- If you use `@cloudflare/vite-plugin` (section 8) the client build goes to `dist/client` and the plugin writes
  `assets.directory` for you; nesting the output under `client/studio/` is not a plugin feature (**unverified** -
  no doc or playground fixture covers `base`). The Worker-side approach (option 2, or strip the `/studio` prefix
  before calling `env.ASSETS.fetch`) is the one that works regardless of layout.

---

## 2. Routing a Worker to `www.thewoovee.com/studio*` next to the existing `www` site

Docs:
- https://developers.cloudflare.com/workers/configuration/routing/routes/
- https://developers.cloudflare.com/workers/configuration/routing/custom-domains/
- https://developers.cloudflare.com/workers/configuration/routing/
- https://developers.cloudflare.com/pages/platform/known-issues/
- https://developers.cloudflare.com/pages/functions/routing/
- https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/

### Route syntax and matching (verified)

```jsonc
"routes": [
  { "pattern": "www.thewoovee.com/studio*", "zone_name": "thewoovee.com" }
]
```

- `zone_name` and `zone_id` are interchangeable. The hostname must have a DNS record (proxied) in the zone.
- `*` matches zero or more characters; only prefix/suffix wildcards - no infix wildcards, no query strings.
- Scheme optional (omitting it matches http and https). Path components are case-sensitive.
- **Most specific pattern wins** (`www.example.com/*` beats `*.example.com/*`; `example.com/hello/*` beats
  `example.com/*`).
- A route with **no Worker attached** can be used to negate a broader route.
- Routes per zone: 1,000.

Gotchas for `/studio`:
- `www.thewoovee.com/studio*` matches `/studio`, `/studio/`, `/studio/anything` **and** `/studio-old`,
  `/studios`. If that matters, use two routes: `www.thewoovee.com/studio` and `www.thewoovee.com/studio/*`.
- `www.thewoovee.com/studio/*` alone does **not** match the bare `/studio` (no trailing slash) - add the exact
  route or redirect.
- Routes are for the case where "your origin server, if you have one, is behind a Worker" (a Worker on a Custom
  Domain is itself the origin). A Worker on a route calls the underlying origin with `fetch(request)`.

### (a) `www` is a Cloudflare Pages custom domain

- Pages custom domains are proxied DNS records inside your zone pointing at the Pages project. Worker routes are
  matched by the zone's request pipeline **before** the request is forwarded to the origin (Workers "acts as
  proxies in front of application servers"; the custom-domains doc shows a route `api.example.com/auth` running
  ahead of a Custom-Domain Worker on the same hostname). So a Worker route for `/studio*` on a Pages custom
  domain is expected to run the Worker for those paths and leave every other path to Pages.
- The only documented restriction is the **reverse** direction (Pages known issues): "It is currently not
  possible to add a custom domain with a Worker already routed on that domain." Adding a route to a hostname
  that is *already* a Pages custom domain is not documented as blocked, but there is no doc sentence that
  positively states precedence for that combination - treat it as **partially verified; test on a throwaway
  path first** (e.g. `www.thewoovee.com/__studio-probe*`).
- If the existing Pages project uses Functions with `_routes.json`, that only governs which requests invoke the
  Pages Function; it cannot see a Worker route in front of it.

### (b) `www` is an external origin behind a proxied DNS record

Verified: this is exactly the documented Routes use case ("your origin server ... is behind a Worker"). The
`/studio*` route runs the Worker; all other paths pass to the origin untouched. Inside the Worker,
`fetch(request)` forwards to the origin if ever needed.

### (c) Syntax and gotchas - see above.

### (d) Pages-side alternatives (if `www` is Pages)

- Put the app inside the existing Pages project: `functions/studio/api/[[path]].ts` (Pages Functions, routed by
  file path) and the SPA files under `/studio/` in the Pages output; use `_routes.json`
  (`{"version":1,"include":["/studio/api/*"],"exclude":[]}`; max 100 rules, `exclude` beats `include`) so only the
  API invokes Functions. Downsides: couples two apps in one repo/deploy, Pages is in maintenance mode
  (Cloudflare recommends Workers for new projects), and Pages Functions cannot use `ctx.access` etc.
- Or migrate `www` from Pages to a Worker with static assets (documented migration guide); then one Worker owns
  the host and `run_worker_first` replaces `_routes.json`.

### Recommended approach

1. Confirm what serves `www` (dashboard: Workers & Pages -> project -> Custom domains; DNS tab: CNAME to
   `<project>.pages.dev` = Pages).
2. Deploy the studio as a **separate Worker** with `routes: ["www.thewoovee.com/studio", "www.thewoovee.com/studio/*"]`
   (or the single `/studio*` if the suffix over-match is acceptable), assets under `dist/studio/...`,
   `not_found_handling: "single-page-application"`, `run_worker_first: ["/studio/api/*"]`.
3. Probe first (step 2 on a temporary path); if the route does not fire on the Pages custom domain, fall back to
   (d), or - simplest of all if a different hostname is acceptable - `studio.thewoovee.com` as a Worker **Custom
   Domain** (no coexistence question, no path prefix, cleaner Access scoping).

---

## 3. Workers Free plan limits (and Paid pricing)

Docs:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/workers/platform/pricing/
- https://developers.cloudflare.com/workers/wrangler/configuration/#limits

| Item | Workers Free | Workers Paid |
|---|---|---|
| Requests | **100,000 / day** (then 429 on Worker-handled requests) | 10 M / month included, then $0.30 / M |
| CPU time per invocation (HTTP) | **10 ms** | 30 s default, configurable to 5 min via `limits.cpu_ms` (max 300,000) |
| Duration (wall clock) per HTTP request | **No limit** ("No charge for duration") | No limit; not billed |
| Subrequests per invocation | **50** (`limits.subrequests` default) | 10,000 default, configurable up to 10 M |
| Simultaneous open connections | **6** per invocation | 6 |
| Memory | 128 MB per isolate | 128 MB |
| Request body | **100 MB** (Free/Pro zone plan), 200 MB Business, up to 5 GB Enterprise | same, by zone plan |
| Response body | **No enforced limit** (stream it) | same |
| URL / headers | 16 KB URL; 128 KB request headers; 128 KB response headers | same |
| Env vars | 64 per Worker, 5 KB each | 128 per Worker |
| Worker size | 64 MiB uncompressed (startup <= 1 s) | same |
| Workers per account | 100 | 500 |
| Cron Triggers per account | 5 | 250 |
| Cache API calls | 50 | 1,000 |
| Static asset files | 20,000 (25 MiB each) | 100,000 |

Streaming responses are the normal case (no response body limit; `Response` bodies are streams).
Outbound `fetch` to arbitrary public hosts is allowed - the docs place no hostname allow-list on `fetch()`;
the constraints are the subrequest count and the 6 simultaneous connections. (A port restriction to
standard HTTP ports is commonly cited but not on the pages fetched - **unverified**.)

**Workers Paid:** **$5 USD / month per account**, includes 10 M requests and 30 M CPU-ms per month; overage
$0.30 per additional million requests and $0.02 per additional million CPU-ms; static asset requests remain
free and unlimited.

---

## 4. Storage on the Free plan; D1 vs KV for per-user keys

Docs:
- D1: https://developers.cloudflare.com/d1/platform/limits/ , https://developers.cloudflare.com/d1/platform/pricing/
- KV: https://developers.cloudflare.com/kv/platform/limits/
- R2: https://developers.cloudflare.com/r2/pricing/
- DO: https://developers.cloudflare.com/durable-objects/platform/pricing/ , https://developers.cloudflare.com/durable-objects/platform/limits/
- Queues: https://developers.cloudflare.com/queues/platform/limits/ , https://developers.cloudflare.com/queues/platform/pricing/
- Cron: https://developers.cloudflare.com/workers/configuration/cron-triggers/ (limits in the Workers limits page)

| Product | Free allowance |
|---|---|
| **D1** | 5 M rows read / day; 100 k rows written / day; 5 GB total storage; 10 databases; 500 MB max per DB; 50 queries per Worker invocation; 7-day Time Travel. Paid: 25 B reads + 50 M writes / month included, then $0.001 / M reads, $1.00 / M writes, $0.75 / GB-mo beyond 5 GB. |
| **KV** | 100 k reads / day; 1,000 writes / day (to different keys); 1 write / s / key; 1 GB storage; key 512 B; value 25 MiB. |
| **R2** | 10 GB-month storage, 1 M Class A ops, 10 M Class B ops per month; egress free (Standard storage only). |
| **Durable Objects** | Available on Free, **SQLite-backed only**: 100 k requests / day; 13,000 GB-s / day; 5 M rows read / day; 100 k rows written / day; 5 GB storage; 100 DO classes. |
| **Queues** | Available on Free ("limits apply to both Workers Paid and Workers Free plans"); message retention fixed at 24 h on Free; 1 M ops / month free then $0.40 / M. |
| **Cron Triggers** | Available on Free: 5 per account; CPU 10 ms per scheduled invocation on Free; 15 min wall-clock duration limit. |

### Recommendation: **D1** for encrypted provider keys + settings

- Data model fits a relational table (`user_email`, `provider`, `ciphertext`, `iv`, `wrapped_dek`, `key_version`,
  `created_at`, `last_used`); one `SELECT` per API call, one `UPDATE` on rotation.
- KV's **1,000 writes/day on Free** and eventual consistency (a write may take seconds to be visible at other
  locations) are poor fits for "save key, immediately use it" flows and for audit fields like `last_used`.
- D1 is strongly consistent for a single database, gives 100 k writes/day, and lets you enforce
  `UNIQUE(user_email, provider)` and run migrations (`wrangler d1 migrations`).
- Use KV (or the Cache API) only for hot read-mostly config, e.g. a cached JWKS or a feature-flag blob.

---

## 5. Cloudflare Access (Zero Trust Free)

Docs:
- Plans/seats: https://www.cloudflare.com/plans/zero-trust-services/ ; https://developers.cloudflare.com/cloudflare-one/team-and-resources/users/seat-management/ ; https://developers.cloudflare.com/cloudflare-one/account-limits/
- Self-hosted app: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/self-hosted-public-app/
- App paths: https://developers.cloudflare.com/cloudflare-one/access-controls/policies/app-paths/
- Policies/actions: https://developers.cloudflare.com/cloudflare-one/access-controls/policies/ ; https://developers.cloudflare.com/cloudflare-one/access-controls/policies/common-policies/
- Sessions: https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/
- Cookie/JWT: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/ ; .../authorization-cookie/validating-json/ ; .../authorization-cookie/cors/
- IdPs: https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/ ; .../identity-providers/google/
- Service tokens: https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/
- Access + Workers: https://developers.cloudflare.com/workers/configuration/cloudflare-access/ ; changelog https://developers.cloudflare.com/changelog/post/2026-08-14-workers-access/

**Seats.** Free plan: **50 users**. The Cloudflare plans page and multiple Cloudflare Community threads state
"up to 50 users"; the developer docs' account-limits page does not repeat the number. (Plans page could not be
fetched from this sandbox - number confirmed via search results only.) A user consumes a seat when they
perform an authentication event; once seats are used up, additional logins are blocked.

**Path-scoped applications: YES.** A self-hosted application is defined by hostname **and optional path**
(`www.thewoovee.com/studio`). Wildcards are allowed at one level per segment; ports, query strings and `#`
fragments cannot be part of the path. Rules for overlapping paths: **the more specific path wins and no rule
is inherited** (docs example: `dashboard.com/eng/exec` overrides `dashboard.com/eng`). Prerequisite: the domain
must be an active zone on Cloudflare (it is).

**Identity providers.** One-time PIN (type `onetimepin`, no config; PIN valid 10 min, single use; sender
`noreply@notify.cloudflare.com`) and **Google** (plain OAuth client - "You do not need to be a Google Cloud
Platform user", no Workspace needed; redirect URI
`https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`, JS origin `https://<team>.cloudflareaccess.com`;
optional PKCE). Both work on Free. A closed group = an Allow policy with `Emails` (list) or `Emails ending in`.

**Sessions.** Application session duration: default **24 h**, range "immediate timeout to one month".
Global session (IdP re-auth): default 24 h, range 15 min - 1 month. When the app token expires Access silently
mints a new one while the global session is valid. Logout URL: `https://www.thewoovee.com/cdn-cgi/access/logout`.
Per-app "Revoke existing tokens" and per-user Revoke are available.

**Headers/cookies.** Access sends the application JWT to the origin as header **`Cf-Access-Jwt-Assertion`**;
browsers also carry it in the **`CF_Authorization`** cookie (app-domain cookie; HttpOnly/SameSite are admin
choices, default None; optional `CF_Binding` binding cookie; "Cookie Path" setting can scope the cookie to
`/studio`). The docs recommend validating the **header**, "since the cookie is not guaranteed to be passed."

**JWT verification in a Worker.**
- JWKS: `https://<team>.cloudflareaccess.com/cdn-cgi/access/certs` (`keys` = JWK set, also `public_cert(s)` PEM).
  Keys rotate every **6 weeks**; old key stays valid **7 days**; fetch dynamically and match `kid`.
- Verify RS256 signature, `iss == https://<team>.cloudflareaccess.com`, and `aud` contains the application's
  **AUD tag** (Zero Trust -> Access controls -> Applications -> app -> Additional settings). Then read `email`.
- The docs' Workers sample uses **`jose`**:

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";
const JWKS = createRemoteJWKSet(new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
const token = request.headers.get("Cf-Access-Jwt-Assertion");
if (!token) return new Response("missing access token", { status: 403 });
const { payload } = await jwtVerify(token, JWKS, {
  issuer: env.ACCESS_TEAM_DOMAIN,          // https://<team>.cloudflareaccess.com
  audience: env.ACCESS_AUD,                // application AUD tag
});
const email = payload.email as string;
```

**Service Tokens.** Headers `CF-Access-Client-Id` / `CF-Access-Client-Secret`; token lifetime chosen at creation
(extendable, e.g. `17520h`); the app needs a policy with action **Service Auth**, otherwise Access redirects to
login. Useful for CI smoke tests or server-to-server calls to `/studio/api`.

**CORS.** Not needed here (SPA and API share `www.thewoovee.com`). If a cross-origin caller is ever added:
browsers never send cookies on `OPTIONS`, so Access returns 403 on preflights unless you either enable
**"Bypass options requests to origin"** or configure the app's CORS settings (Allow-Origin, Allow-Credentials,
Allow-Methods, Allow-Headers) under Applications -> Configure -> Advanced settings -> CORS settings.
Fetch with `credentials: 'same-origin'`.

**Does Access apply to Worker-served responses on a route? YES.** Access is enforced at the edge on the
hostname/path before the Worker runs, and the Worker receives `Cf-Access-Jwt-Assertion`. Caveats:
- For Workers **with static assets**, "Access still protects the application and its assets", but the internal
  asset router "does not pass `ctx.access` to the user Worker" - so use header JWT validation (above), not the
  new `ctx.access.getIdentity()` helper.
- The newer **Worker-level** Access (Workers & Pages -> Worker -> Access, Aug 2026) attaches a policy to the
  Worker across all its domains and preview URLs; it does **not** support WebSocket upgrades (403) and does not
  propagate through Service Bindings. Hostname/path Access (Zero Trust app) has no WebSocket restriction.
- Access does not remove the need to check the JWT in the Worker (a misrouted or direct `workers.dev` request
  would otherwise bypass it); disable `workers_dev` or protect the preview URL too.

**Excluding `/studio/api/health`.** Create a **second self-hosted application** with path
`www.thewoovee.com/studio/api/health` and a single policy with action **Bypass**, Include = Everyone
(docs: "Bypass a public endpoint" - health checks are the cited use case). The more specific path wins over the
`/studio` app. Bypass is evaluated before Allow and is **not logged**; keep it as narrow as possible. Policy
evaluation order: Service Auth -> Bypass -> Allow -> Block.

Access limits: 500 applications per account (well beyond need).

---

## 6. Secrets and encryption on Workers

Docs:
- https://developers.cloudflare.com/workers/configuration/secrets/
- https://developers.cloudflare.com/workers/wrangler/commands/workers/#secret
- https://developers.cloudflare.com/secrets-store/ ; https://developers.cloudflare.com/secrets-store/integrations/workers/ ; https://developers.cloudflare.com/secrets-store/manage-secrets/
- https://developers.cloudflare.com/workers/runtime-apis/web-crypto/

**Per-Worker secrets.** `npx wrangler secret put KEK_V1` (prompts, or pipe stdin) - "creates a new version of the
Worker and deploys it immediately"; use `wrangler versions secret put` to stage without deploying. Bulk:
`wrangler secret bulk < secrets.json` (JSON or `.env`, up to 100 per request; `null` deletes, Wrangler >= 4.97.0).
Local dev: `.dev.vars`. Env var/secret value size 5 KB.

**Secrets Store** (account-level): still **open beta** ("The service carries a beta designation"); limits:
100 secrets per account, one store per account, value <= 1,024 bytes; binding
`"secrets_store_secrets": [{ "binding": "KEK", "store_id": "...", "secret_name": "kek-v1" }]`, read with
`await env.KEK.get()`. Not GA - for a single Worker, plain `wrangler secret put` is simpler and sufficient.

**WebCrypto in Workers** (supported table): **AES-GCM** (encrypt/decrypt/generateKey/wrap/unwrap/import/export),
AES-KW, **HKDF** (deriveBits/deriveKey/importKey), **PBKDF2** (deriveBits/deriveKey/importKey), HMAC, SHA-256/384/512,
RSA-OAEP, ECDH, Ed25519/X25519, plus non-standard `crypto.subtle.timingSafeEqual(a, b)`. PBKDF2 iteration cost
counts against the 10 ms CPU budget on Free - avoid PBKDF2 on the request path; HKDF is cheap.

**Recommended envelope pattern (per-user data keys in D1, master KEK as a secret):**
1. `KEK_V1` = 32 random bytes, base64, stored with `wrangler secret put`. Import once per isolate:
   `crypto.subtle.importKey("raw", kekBytes, "AES-KW", false, ["wrapKey","unwrapKey"])` (or AES-GCM with a
   random IV if you prefer authenticated wrapping with AAD).
2. Per user: generate a DEK `crypto.subtle.generateKey({name:"AES-GCM",length:256}, true, ["encrypt","decrypt"])`,
   wrap it with the KEK (`wrapKey("raw", dek, kek, "AES-KW")`), store `wrapped_dek`, `kek_version` in `users`.
3. Per provider key: `encrypt({name:"AES-GCM", iv: random 12 bytes, additionalData: utf8(`${user}|${provider}`)}, dek, plaintext)`;
   store `ciphertext`, `iv`, `dek_version` in `provider_keys`. AAD binds the blob to its row so rows cannot be swapped.
4. Decrypt only inside the request that proxies to the provider; never return plaintext to the browser; keep the
   unwrapped DEK in memory only (optionally an in-isolate LRU keyed by user, short TTL).
5. **Rotation.** KEK: add `KEK_V2` secret, deploy, background job (Cron Trigger or admin endpoint) rewraps every
   `wrapped_dek` from v1 to v2 (no data re-encryption needed), then delete `KEK_V1`. DEK: rewrap/re-encrypt that
   user's rows only. Provider key: overwrite the row. Store `key_version` columns so old and new can coexist during
   rollout. Use `timingSafeEqual` for any secret comparison.

---

## 7. Deployment from GitHub

Docs:
- Workers Builds: https://developers.cloudflare.com/workers/ci-cd/builds/ ; .../builds/configuration/ ; .../builds/limits-and-pricing/ ; .../builds/git-integration/github-integration/
- GitHub Actions: https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/ ; https://github.com/cloudflare/wrangler-action
- Tokens: https://developers.cloudflare.com/fundamentals/api/reference/template/
- Previews: https://developers.cloudflare.com/workers/versions-and-deployments/preview-urls/ ; `wrangler versions upload`: https://developers.cloudflare.com/workers/wrangler/commands/workers/

### (a) Workers Builds (dashboard Git integration)

- Install the "Cloudflare Workers & Pages" GitHub App; connect repo in Worker -> Settings -> Builds.
- Settings: **Build command** (e.g. `npm run build`), **Deploy command** (default `npx wrangler deploy`),
  **Non-production branch deploy command** (default `npx wrangler versions upload` -> generates a Preview URL and
  posts status/preview to the PR), **Root directory** for monorepos; multiple Workers per repo supported.
- The Worker name in the dashboard must equal `name` in the wrangler config in that root directory.
- Free plan: **3,000 build minutes / month, 1 concurrent build, 20 min timeout**.
- Preview URLs are not generated for Workers that implement Durable Objects.

### (b) GitHub Actions with `cloudflare/wrangler-action`

- Docs example pins `cloudflare/wrangler-action@v3`; the action's README now documents **v4** (defaults to
  Wrangler v4) with the same inputs: `apiToken`, `accountId`, `command`, `workingDirectory`, `secrets`,
  `environment`, `wranglerVersion`; outputs `deployment-url`.
- `command: deploy` on `main`; `command: versions upload --preview-alias pr-${{ github.event.number }}` on PRs
  (alias: lowercase letters/digits/dashes, must start with a letter, alias + name <= 63 chars).
- Secrets needed: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`.
- **Token template: "Edit Cloudflare Workers"**, which includes **Zone -> Workers Routes: Edit** (required to
  attach `routes` on `www.thewoovee.com`), Account -> Workers Scripts: Edit, Workers KV Storage: Edit, Workers
  Tail: Read, Workers R2 Storage: Edit, Account Settings: Read, User Details: Read, User Memberships: Read.
  Scope the zone resource to `thewoovee.com` only. **Not in the template** and must be added for this app:
  **Account -> D1: Edit** (bindings/migrations) - permission name as shown in the token editor (**unverified**
  exact label). Custom tokens missing the zone permission fail with `Authentication error [code: 10000]` during
  route publishing.

**Recommendation:** GitHub Actions. Reasons: explicit token scoping, ability to run `wrangler d1 migrations apply`
and tests in the same job, `versions upload` previews with stable aliases, and no dashboard-side config drift.
Workers Builds is a fine zero-config alternative if you do not need migrations in CI.

**Preview URLs:** `<VERSION_PREFIX>-<WORKER_NAME>.<SUBDOMAIN>.workers.dev` and, with an alias,
`<ALIAS>-<WORKER_NAME>.<SUBDOMAIN>.workers.dev`. `preview_urls` defaults to the value of `workers_dev`. Previews
live on `workers.dev` only - **your `/studio` zone route is not exercised by a preview**, so the preview serves the
SPA at `/` unless the Worker also handles un-prefixed paths (or you set the alias to hit `/studio/...`).
**Access on previews: yes** - "To require visitors to sign in before they can access Preview URLs, use Cloudflare
Access" (a Zero Trust app on `*-studio.<subdomain>.workers.dev`, or Worker-level Access with destination
`preview_worker`). Previews are not generated for Durable-Object Workers and have no log viewing.

---

## 8. `@cloudflare/vite-plugin`

Docs:
- https://developers.cloudflare.com/workers/vite-plugin/ ; .../vite-plugin/get-started/ ; .../vite-plugin/tutorial/
- https://developers.cloudflare.com/workers/vite-plugin/reference/api/ ; .../reference/static-assets/ ; .../reference/vite-environments/
- https://developers.cloudflare.com/workers/framework-guides/web-apps/react/
- npm: https://www.npmjs.com/package/@cloudflare/vite-plugin

- **Current version: 1.54.4** (npm `latest` on 2026-09-06); peer `vite ^6.1.0 || ^7.0.0 || ^8.0.0`; bundles
  `wrangler 4.129.0`, `miniflare 5.20260903.0-alpha`. GA product.
- `vite.config.ts`: `plugins: [react(), cloudflare()]`. The plugin auto-detects `wrangler.jsonc|json|toml`
  (override with `configPath` or `CLOUDFLARE_VITE_WRANGLER_CONFIG_PATH`); options `config`, `viteEnvironment`,
  `persistState` (default `.wrangler/state`), `inspectorPort`, `tunnel`, `remoteBindings` (default true),
  auxiliary workers.
- `wrangler.jsonc`: `main: "./api/index.ts"` plus `assets: { not_found_handling: "single-page-application", binding: "ASSETS" }`
  (no `directory`). On `vite build` the client goes to `dist/client`, the Worker to `dist/<worker-name>/`, and a
  generated `dist/<worker-name>/wrangler.json` has `assets.directory` "automatically populated with the path to your
  `client` build output". `wrangler deploy` reads that generated file (the `deploy` script is
  `npm run build && wrangler deploy`).
- **Dev server:** `vite dev` runs the Worker code **inside workerd (Miniflare)** via Vite's Environment API - "run
  your application in the Cloudflare Workers runtime, just like in production" - with bindings, HMR on both
  client and Worker, and `/api/*` requests answered by the Worker locally; `vite preview` serves the production
  build in workerd. `_headers`/`_redirects` in `public/` are honoured.
- **`base` path support:** not documented; the plugin source has no `base`-specific handling and the playground
  has no base-path fixture (**unverified**). Vite's own `base: '/studio/'` will rewrite asset URLs in the client
  build, but the output stays flat in `dist/client` and the SPA fallback is "always the root `index.html`". Plan on
  the Worker-side prefix handling from section 1 and test `vite dev` with `base` early; if it misbehaves, run the
  SPA on plain Vite and the Worker on `wrangler dev` (two processes) instead.

---

## 9. Limits that affect proxying large media

Docs:
- https://developers.cloudflare.com/workers/platform/limits/
- https://developers.cloudflare.com/fundamentals/reference/connection-limits/

- **Request body** into the Worker: **100 MB** on Free/Pro zones (200 MB Business, up to 5 GB Enterprise). Large
  uploads must be chunked/multipart or sent straight to the provider/R2 from the browser (e.g. presigned R2 URLs).
- **Response body:** no enforced limit - stream provider responses through (`return fetch(...)` or pipe the body),
  do not buffer.
- **Worker wall-clock:** no limit for HTTP requests; CPU 10 ms on Free (streaming a body is mostly I/O and costs
  little CPU, but JSON-transforming a large payload will not fit in 10 ms).
- **Proxy timeouts (connection-limits page as fetched):** "Proxy Read Timeout 125 s -> 524" for origin responses
  (configurable only on Enterprise), 30 s proxy write timeout, 900 s idle keep-alive reuse. Cloudflare keeps
  keep-alive connections to origins. Whether the same read timeout governs a Worker **subrequest** is not stated
  in the docs; community reports of `fetch()` subrequests failing after roughly 90-100 s exist -
  **unverified; assume ~100 s per idle subrequest and design around it**.
- **Long-polling / slow provider calls:** allowed (no wall-clock limit, no subrequest timeout in the docs), but keep
  bytes flowing: prefer streaming/SSE responses from providers, use `AbortController` timeouts, and for jobs that
  can exceed ~90 s use the provider's async/job pattern (submit, then poll with fresh subrequests or a Cron/Queue
  consumer). Max **6 simultaneous** outbound connections per invocation and 50 subrequests on Free.
- TCP keepalive on Worker `fetch` is managed by the runtime; there is no user-facing keepalive knob.

---

## 10. Turnstile and the Rate Limiting binding (future public mode)

Docs:
- https://developers.cloudflare.com/turnstile/ ; https://developers.cloudflare.com/turnstile/plans/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/ ; changelog https://developers.cloudflare.com/changelog/2025-09-19-ratelimit-workers-ga/

- **Turnstile Free:** unlimited challenges; up to **20 widgets** per account; **10 hostnames per widget**; all
  widget types; 7-day analytics; no "any hostname" widget, no Ephemeral IDs. Validate the token server-side in the
  Worker (`/turnstile/v0/siteverify`).
- **Rate Limiting binding:** **GA since 2025-09-19** (stable `ratelimits` config; the old `unsafe.bindings` form
  still works). Requires **Wrangler >= 4.36.0**:

```jsonc
"ratelimits": [{ "name": "API_RL", "namespace_id": "1001", "simple": { "limit": 100, "period": 60 } }]
```
  `period` must be **10 or 60** seconds; limits are **per Cloudflare location, not global**; "permissive,
  eventually consistent, and intentionally designed to not be used as an accurate accounting system". Key on a
  stable identifier (Access email / user id), not IP. No plan restriction is documented (**availability on Free:
  unverified**, but the docs state none).
