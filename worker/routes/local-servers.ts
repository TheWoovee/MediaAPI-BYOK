import { Hono } from 'hono';
import type { WorkerEnv } from '../types';
import { importKek, unwrapDek, seal, open, resolveKekString } from '../crypto';

const FORBIDDEN_HOSTNAME_RE = /^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|\[::1\])$/i;
const FORBIDDEN_SUFFIX_RE = /\.(local|internal)$/i;

function isIPLiteral(hostname: string): boolean {
  if (hostname.startsWith('[')) return true;
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

function isForbiddenHost(hostname: string): boolean {
  if (FORBIDDEN_HOSTNAME_RE.test(hostname)) return true;
  if (FORBIDDEN_SUFFIX_RE.test(hostname)) return true;
  if (isIPLiteral(hostname)) return true;
  return false;
}

function validateRelayUrl(urlStr: string): { url: URL; error?: string } | { url?: undefined; error: string } {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    return { error: 'invalid base_url' };
  }
  if (url.protocol !== 'https:') return { error: 'relay base_url must be https' };
  if (isForbiddenHost(url.hostname)) return { error: 'base_url hostname is not allowed' };
  return { url };
}

export const localServersApp = new Hono<{ Bindings: WorkerEnv }>();

localServersApp.get('/local-servers', async (c) => {
  const email = c.get('email' as never) as string;
  const rows = await c.env.DB.prepare(
    'SELECT id, kind, label, base_url, mode, created_at, updated_at FROM local_servers WHERE email=? ORDER BY created_at DESC',
  )
    .bind(email)
    .all();
  return c.json({ servers: rows.results });
});

localServersApp.post('/local-servers', async (c) => {
  const email = c.get('email' as never) as string;
  const body = await c.req.json<{ kind: string; label: string; base_url: string; mode: 'direct' | 'relay'; auth?: string }>();

  if (!body.kind || !body.label || !body.base_url || !body.mode) {
    return c.json({ error: 'kind, label, base_url, and mode are required' }, 400);
  }
  if (body.mode === 'relay') {
    const v = validateRelayUrl(body.base_url);
    if (v.error) return c.json({ error: v.error }, 400);
  }

  const id = crypto.randomUUID();
  const now = Date.now();
  let authCiphertext: Uint8Array | null = null;
  let authIv: Uint8Array | null = null;

  if (body.auth) {
    const user = await c.env.DB.prepare('SELECT wrapped_dek, dek_iv, kek_version FROM users WHERE email=?')
      .bind(email)
      .first<{ wrapped_dek: ArrayBuffer; dek_iv: ArrayBuffer; kek_version: number }>();
    if (!user) return c.json({ error: 'no user key; add a credential first' }, 400);
    const userKek = await importKek(resolveKekString(c.env, user.kek_version));
    const dek = await unwrapDek(userKek, new Uint8Array(user.wrapped_dek), new Uint8Array(user.dek_iv), email);
    const s = await seal(dek, body.auth, `${email}|local|${id}`);
    authCiphertext = s.ciphertext;
    authIv = s.iv;
  }

  await c.env.DB.prepare(
    'INSERT INTO local_servers (id,email,kind,label,base_url,mode,auth_ciphertext,auth_iv,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(id, email, body.kind, body.label, body.base_url, body.mode, authCiphertext, authIv, now, now)
    .run();

  return c.json({ id }, 201);
});

localServersApp.patch('/local-servers/:id', async (c) => {
  const email = c.get('email' as never) as string;
  const serverId = c.req.param('id');
  const body = await c.req.json<{ label?: string; base_url?: string }>();

  const existing = await c.env.DB.prepare('SELECT id, mode FROM local_servers WHERE id=? AND email=?')
    .bind(serverId, email)
    .first<{ id: string; mode: string }>();
  if (!existing) return c.json({ error: 'not found' }, 404);

  if (body.base_url && existing.mode === 'relay') {
    const v = validateRelayUrl(body.base_url);
    if (v.error) return c.json({ error: v.error }, 400);
  }

  const updates: string[] = [];
  const values: unknown[] = [];
  if (body.label) {
    updates.push('label=?');
    values.push(body.label);
  }
  if (body.base_url) {
    updates.push('base_url=?');
    values.push(body.base_url);
  }
  if (updates.length === 0) return c.json({ ok: true });

  updates.push('updated_at=?');
  values.push(Date.now());
  values.push(serverId);
  values.push(email);

  await c.env.DB.prepare(`UPDATE local_servers SET ${updates.join(',')} WHERE id=? AND email=?`)
    .bind(...values)
    .run();

  return c.json({ ok: true });
});

localServersApp.delete('/local-servers/:id', async (c) => {
  const email = c.get('email' as never) as string;
  const serverId = c.req.param('id');
  const result = await c.env.DB.prepare('DELETE FROM local_servers WHERE id=? AND email=?').bind(serverId, email).run();
  if (result.meta.changes === 0) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

localServersApp.all('/local/:serverId/*', async (c) => {
  const email = c.get('email' as never) as string;
  const serverId = c.req.param('serverId');

  const server = await c.env.DB.prepare(
    'SELECT id, base_url, mode, auth_ciphertext, auth_iv FROM local_servers WHERE id=? AND email=?',
  )
    .bind(serverId, email)
    .first<{ id: string; base_url: string; mode: string; auth_ciphertext: ArrayBuffer | null; auth_iv: ArrayBuffer | null }>();

  if (!server) return c.json({ error: 'server not found' }, 404);
  if (server.mode !== 'relay') return c.json({ error: 'direct servers are called from the browser' }, 400);

  const baseValidation = validateRelayUrl(server.base_url);
  if (baseValidation.error) return c.json({ error: baseValidation.error }, 400);

  const rest = c.req.path.replace(new RegExp(`^.*/local/${serverId}/`), '');
  const target = new URL(`${server.base_url.replace(/\/$/, '')}/${rest}${new URL(c.req.url).search}`);

  if (target.origin !== baseValidation.url!.origin) {
    return c.json({ error: 'target origin does not match base_url' }, 400);
  }

  const headers = new Headers();
  for (const [k, v] of c.req.raw.headers.entries()) {
    const lower = k.toLowerCase();
    if (lower === 'content-type' || lower === 'accept' || lower === 'range' || lower === 'content-length') {
      headers.set(k, v);
    }
  }

  if (server.auth_ciphertext && server.auth_iv) {
    const user = await c.env.DB.prepare('SELECT wrapped_dek, dek_iv, kek_version FROM users WHERE email=?')
      .bind(email)
      .first<{ wrapped_dek: ArrayBuffer; dek_iv: ArrayBuffer; kek_version: number }>();
    if (user) {
      const userKek = await importKek(resolveKekString(c.env, user.kek_version));
      const dek = await unwrapDek(userKek, new Uint8Array(user.wrapped_dek), new Uint8Array(user.dek_iv), email);
      const authJson = await open(
        dek,
        new Uint8Array(server.auth_ciphertext),
        new Uint8Array(server.auth_iv),
        `${email}|local|${server.id}`,
      );
      try {
        const auth = JSON.parse(authJson) as { type: string; [key: string]: string };
        if (auth.type === 'service-token') {
          headers.set('CF-Access-Client-Id', auth.clientId);
          headers.set('CF-Access-Client-Secret', auth.clientSecret);
        } else if (auth.type === 'basic') {
          headers.set('Authorization', `Basic ${btoa(`${auth.username}:${auth.password}`)}`);
        } else if (auth.type === 'bearer') {
          headers.set('Authorization', `Bearer ${auth.token}`);
        }
      } catch {
        // invalid auth JSON, skip
      }
    }
  }

  const method = c.req.method;
  const res = await fetch(target, {
    method,
    headers,
    body: ['GET', 'HEAD'].includes(method) ? undefined : c.req.raw.body,
    // @ts-expect-error Cloudflare Workers support duplex
    duplex: ['GET', 'HEAD'].includes(method) ? undefined : 'half',
    redirect: 'manual',
  });

  const out = new Headers(res.headers);
  out.delete('set-cookie');
  out.set('cache-control', 'no-store');
  return new Response(res.body, { status: res.status, headers: out });
});
