import { Hono } from 'hono'
import { identify } from './access'
import { importKek, newDek, wrapDek, unwrapDek, seal, open } from './crypto'
type Env = { ASSETS: Fetcher; DB: D1Database; KEK: string; ACCESS_TEAM_DOMAIN: string; ACCESS_AUD: string; DEV_TRUST_EMAIL?: string }
const app = new Hono<{ Bindings: Env }>().basePath('/studio')
app.get('/api/health', c => c.json({ ok: true, ts: Date.now() }))
app.use('/api/*', async (c, next) => {
  if (c.req.path === '/studio/api/health') return next()
  const id = await identify(c.req.raw, c.env)
  if (!id) return c.json({ error: 'unauthenticated' }, 403)
  c.set('email' as never, id.email as never)
  await next()
})
app.get('/api/me', c => c.json({ email: c.get('email' as never) }))
// credentials: create + reveal round trip through D1 with envelope encryption
app.post('/api/credentials', async c => {
  const email = c.get('email' as never) as string
  const body = await c.req.json<{ provider_id: string; label: string; secret: string }>()
  const kek = await importKek(c.env.KEK)
  let row = await c.env.DB.prepare('SELECT wrapped_dek, dek_iv FROM users WHERE email=?').bind(email).first<{ wrapped_dek: ArrayBuffer; dek_iv: ArrayBuffer }>()
  let dek: CryptoKey
  if (!row) {
    dek = await newDek()
    const w = await wrapDek(kek, dek, email)
    await c.env.DB.prepare('INSERT INTO users (email, wrapped_dek, dek_iv, kek_version, created_at) VALUES (?,?,?,?,?)').bind(email, w.wrapped, w.iv, 1, Date.now()).run()
  } else {
    dek = await unwrapDek(kek, new Uint8Array(row.wrapped_dek), new Uint8Array(row.dek_iv), email)
  }
  const id = crypto.randomUUID()
  const s = await seal(dek, body.secret, `${email}|${id}|${body.provider_id}`)
  await c.env.DB.prepare('INSERT INTO credentials (id,email,provider_id,label,last4,ciphertext,iv,is_default,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)')
    .bind(id, email, body.provider_id, body.label, body.secret.slice(-4), s.ciphertext, s.iv, 1, Date.now(), Date.now()).run()
  return c.json({ id, last4: body.secret.slice(-4) })
})
app.post('/api/credentials/:id/reveal', async c => {
  const email = c.get('email' as never) as string
  const kek = await importKek(c.env.KEK)
  const u = await c.env.DB.prepare('SELECT wrapped_dek, dek_iv FROM users WHERE email=?').bind(email).first<{ wrapped_dek: ArrayBuffer; dek_iv: ArrayBuffer }>()
  const r = await c.env.DB.prepare('SELECT provider_id, ciphertext, iv FROM credentials WHERE id=? AND email=?').bind(c.req.param('id'), email).first<{ provider_id: string; ciphertext: ArrayBuffer; iv: ArrayBuffer }>()
  if (!u || !r) return c.json({ error: 'not found' }, 404)
  const dek = await unwrapDek(kek, new Uint8Array(u.wrapped_dek), new Uint8Array(u.dek_iv), email)
  const secret = await open(dek, new Uint8Array(r.ciphertext), new Uint8Array(r.iv), `${email}|${c.req.param('id')}|${r.provider_id}`)
  return c.json({ secret })
})
// Streaming proxy skeleton with allowlist (no auth injection in the spike)
const HOSTS: Record<string, string[]> = { httpbin: ['httpbin.org'], xai: ['api.x.ai'] }
app.all('/api/proxy/:provider/*', async c => {
  const p = c.req.param('provider'); const allowed = HOSTS[p]
  if (!allowed) return c.json({ error: 'unknown provider' }, 404)
  const rest = c.req.path.replace(`/studio/api/proxy/${p}/`, '')
  const target = new URL(`https://${allowed[0]}/${rest}${new URL(c.req.url).search}`)
  const h = new Headers(); for (const k of ['content-type', 'accept', 'prefer']) { const v = c.req.header(k); if (v) h.set(k, v) }
  const res = await fetch(target, { method: c.req.method, headers: h, body: ['GET', 'HEAD'].includes(c.req.method) ? undefined : c.req.raw.body })
  const out = new Headers(res.headers); out.delete('set-cookie'); out.set('cache-control', 'no-store')
  return new Response(res.body, { status: res.status, headers: out })
})
// SPA fallback for navigations under /studio (assets router would serve root index.html otherwise)
app.get('*', async c => {
  const url = new URL(c.req.url)
  const accept = c.req.header('accept') ?? ''
  if (accept.includes('text/html') || url.pathname === '/studio' || url.pathname === '/studio/') {
    // Asset router (auto-trailing-slash) maps '/studio/' to studio/index.html; asking for index.html directly 307s.
    return c.env.ASSETS.fetch(new Request(new URL('/studio/', url), { headers: c.req.raw.headers }))
  }
  return c.env.ASSETS.fetch(c.req.raw)
})
export default app
