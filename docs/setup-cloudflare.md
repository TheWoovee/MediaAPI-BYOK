# Cloudflare and GitHub setup guide (Phase 0)

Everything here happens in your Cloudflare and Google accounts, so it needs your clicks or an API token.
Estimated time: 30–40 minutes the first time. Steps marked **(script)** can be automated by
`scripts/cf-setup.sh` once you have created the API token in step 2; the rest are dashboard-only.

Assumptions: zone `thewoovee.com` is active on Cloudflare; `www` is a Cloudflare Pages project linked to GitHub.

## 1. Zero Trust team (once)
1. Cloudflare dashboard → **Zero Trust**. If asked, pick a team name, e.g. `thewoovee` → your team domain becomes
   `https://thewoovee.cloudflareaccess.com`. Choose the **Free** plan (50 users).
2. Note the team domain; it goes into `ACCESS_TEAM_DOMAIN`.

## 2. API token (once)
1. My Profile → API Tokens → Create Token → template **Edit Cloudflare Workers**.
2. Add permissions: Account → **D1: Edit**, Account → **Workers R2 Storage: Edit**, Account → **Access: Apps and Policies: Edit** (only needed if you want the script to create the Access apps), Zone → **Workers Routes: Edit** (already in the template; keep it scoped to `thewoovee.com`).
3. Copy the token once. Also copy your **Account ID** (Workers & Pages → Overview, right side).

## 3. Login: identity providers
### One-time PIN (zero setup, do this first)
Zero Trust (Cloudflare One) → **Integrations** → **Identity providers** → **Add new identity provider** → **One-time PIN**.
Nothing to configure. On many new accounts it is already listed there by default; if so, skip this step.
(Older dashboards had this under Settings → Authentication → Login methods.)

### Google (optional, 10 minutes)
1. https://console.cloud.google.com → create a project (any name) → APIs & Services → **OAuth consent screen** → External → fill app name and your email → add yourself as a test user (or publish; either works for a closed group).
2. Credentials → **Create credentials → OAuth client ID** → Web application:
   - Authorised JavaScript origins: `https://<team>.cloudflareaccess.com`
   - Authorised redirect URIs: `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
3. Copy Client ID and Client Secret.
4. Zero Trust → **Integrations** → **Identity providers** → Add new identity provider → **Google** → paste both → Save → **Test**.

Which is easier: **One-time PIN**. No external account, no consent screen, works for every invited email. Google
saves your friends typing a PIN each day but is otherwise identical in security here. Start with PIN; add Google
whenever you like without touching the app.

## 4. Access applications **(script)**
Zero Trust → Access controls → Applications → **Add an application → Self-hosted**.

| # | Application name | Domain / path | Policy |
|---|------------------|---------------|--------|
| A | Studio | `www.thewoovee.com` path `studio` | Allow · Include: **Emails** = your email (add more later) · Session duration 1 week |
| B | Studio health | `www.thewoovee.com` path `studio/api/health` | **Bypass** · Include: Everyone |
| C | Studio temp files | `www.thewoovee.com` path `studio/api/tmp` | **Bypass** · Include: Everyone |

- On app A, after saving: open it → **Overview / Additional settings** → copy the **Application Audience (AUD) Tag** → this is `ACCESS_AUD`.
- App A: Settings → Cookie settings → **Cookie Path** `/studio` (keeps the cookie off the rest of `www`), HttpOnly on.
- Login methods on app A: select One-time PIN (and Google if added). Untick "Accept all available identity providers" if you want only those.
- To invite someone later: edit app A's policy and add their email. To remove: delete the email and, if you want it immediate, Applications → app A → Revoke existing tokens.

Later (Phase 2), for your PC's ComfyUI tunnel:

| # | Application name | Domain | Policy |
|---|------------------|--------|--------|
| D | ComfyUI tunnel | `comfy.thewoovee.com` | **Service Auth** · Include: Service Token `studio-relay` (create under Access controls → Service credentials → Service tokens; copy the Client ID and Secret once; they are saved encrypted in the app) |

## 5. Storage (dashboard, no CLI needed)
1. Cloudflare dashboard → **Storage & Databases → D1 SQL Database → Create** → name `mediaapi-byok` → open it and copy the **Database ID** (a UUID). Send it to the orchestrator or paste it into `wrangler.jsonc` under `d1_databases[0].database_id`.
2. **R2 Object Storage → Create bucket** → name `mediaapi-byok-tmp` (any location). If R2 asks you to enable it, do so; the free tier applies.
3. The master key (`KEK`) is generated automatically by the deploy workflow on the first deploy and stored only as a Worker secret. Nothing to do. If it is ever lost, users simply re-enter their provider keys.

## 6. GitHub repository
Settings → Secrets and variables → Actions:

| Kind | Name | Value |
|------|------|-------|
| Secret | `CLOUDFLARE_API_TOKEN` | from step 2 |
| Secret | `CLOUDFLARE_ACCOUNT_ID` | from step 2 |
| Variable | `ACCESS_TEAM_DOMAIN` | `https://<team>.cloudflareaccess.com` |
| Variable | `ACCESS_AUD` | AUD tag from step 4 |

Branch protection on `main`: require the CI check. The deploy workflow runs only on `main`.

## 7. First deploy is the routing probe
The Worker deploys with routes `www.thewoovee.com/studio` and `www.thewoovee.com/studio/*`. Your Pages site is not modified,
so this cannot break `www` either way. After the deploy workflow is green, open `https://www.thewoovee.com/studio/api/health`:
- JSON `{ok:true}` → the Worker route runs in front of Pages. Continue to section 9.
- Your Pages 404 page → routes do not intercept on this Pages custom domain. Fallback: change `routes` in `wrangler.jsonc` to
  `[{ "pattern": "studio.thewoovee.com", "custom_domain": true }]`, set `BASE_PATH` in `shared/config.ts` to `""`, move Access app A
  to hostname `studio.thewoovee.com` (no path), and redeploy. Nothing else in the plan changes.

## 8. Existing Pages project: nothing to change
The Pages project keeps deploying from its own repo. The only interaction is the route: requests to `/studio…`
never reach Pages. If the Pages site has a `_redirects` or `_routes.json`, they are irrelevant for those paths.
Do not add a Pages custom domain for `studio.thewoovee.com` unless the fallback in step 7 is needed.

## 9. Verification checklist
- [ ] `https://www.thewoovee.com/studio/api/health` returns JSON without login.
- [ ] `https://www.thewoovee.com/studio/` redirects to the Access login page; PIN arrives; app shell loads.
- [ ] `https://www.thewoovee.com/studio/api/me` returns your email.
- [ ] A second, non-invited email is refused by Access.
- [ ] Main site pages on `www` still load and Pages deploys still work.
