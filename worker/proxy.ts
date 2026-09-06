import { Hono } from 'hono';
import { getProvider, getAllOutputHosts } from '@shared/providers/registry';
import type { WorkerEnv } from './types';
import { importKek, unwrapDek, open } from './crypto';

const HEADER_ALLOWLIST = new Set(['content-type', 'accept', 'prefer', 'x-runway-version', 'content-length']);

function isAllowedHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return HEADER_ALLOWLIST.has(lower) || lower.startsWith('x-fal-');
}

function hostMatches(hostname: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (p.startsWith('*.')) {
      if (hostname.endsWith(p.slice(1)) || hostname === p.slice(2)) return true;
    } else if (hostname === p) {
      return true;
    }
  }
  return false;
}

export const proxyApp = new Hono<{ Bindings: WorkerEnv }>();

proxyApp.all('/proxy/:provider/*', async (c) => {
  const providerId = c.req.param('provider');
  const spec = getProvider(providerId);
  if (!spec || spec.hosts.length === 0) return c.json({ error: 'unknown provider' }, 404);

  const email = c.get('email' as never) as string;
  const basePath = c.req.routePath.split('/proxy/')[0];
  const rest = c.req.path.replace(new RegExp(`^${basePath}/proxy/${providerId}/`), '');
  const target = new URL(`https://${spec.hosts[0]}/${rest}${new URL(c.req.url).search}`);

  if (!hostMatches(target.hostname, spec.hosts)) {
    return c.json({ error: 'host not allowed' }, 403);
  }

  const headers = new Headers();
  for (const [k, v] of c.req.raw.headers.entries()) {
    if (isAllowedHeader(k)) headers.set(k, v);
  }

  const inlineCredential = c.req.header('X-Credential-Inline');
  if (inlineCredential) {
    if (spec.auth.scheme === 'raw') {
      headers.set(spec.auth.header, inlineCredential);
    } else if (spec.auth.scheme === 'Key') {
      headers.set(spec.auth.header, `Key ${inlineCredential}`);
    } else {
      headers.set(spec.auth.header, `Bearer ${inlineCredential}`);
    }
  } else {
    const credentialId = c.req.header('X-Credential');
    const kek = await importKek(c.env.KEK);
    const user = await c.env.DB.prepare('SELECT wrapped_dek, dek_iv FROM users WHERE email=?')
      .bind(email)
      .first<{ wrapped_dek: ArrayBuffer; dek_iv: ArrayBuffer }>();
    if (!user) return c.json({ error: 'no credentials configured' }, 400);

    let cred: { id: string; provider_id: string; ciphertext: ArrayBuffer; iv: ArrayBuffer } | null;
    if (credentialId) {
      cred = await c.env.DB.prepare('SELECT id, provider_id, ciphertext, iv FROM credentials WHERE id=? AND email=?')
        .bind(credentialId, email)
        .first();
    } else {
      cred = await c.env.DB.prepare(
        'SELECT id, provider_id, ciphertext, iv FROM credentials WHERE email=? AND provider_id=? AND is_default=1',
      )
        .bind(email, providerId)
        .first();
    }
    if (!cred) return c.json({ error: 'credential not found' }, 404);

    const dek = await unwrapDek(kek, new Uint8Array(user.wrapped_dek), new Uint8Array(user.dek_iv), email);
    const secret = await open(dek, new Uint8Array(cred.ciphertext), new Uint8Array(cred.iv), `${email}|${cred.id}|${cred.provider_id}`);

    if (spec.auth.scheme === 'raw') {
      headers.set(spec.auth.header, secret);
    } else if (spec.auth.scheme === 'Key') {
      headers.set(spec.auth.header, `Key ${secret}`);
    } else {
      headers.set(spec.auth.header, `Bearer ${secret}`);
    }
  }

  if (spec.auth.extraHeaders) {
    for (const [k, v] of Object.entries(spec.auth.extraHeaders)) {
      headers.set(k, v);
    }
  }

  const method = c.req.method;
  const res = await fetch(target, {
    method,
    headers,
    body: ['GET', 'HEAD'].includes(method) ? undefined : c.req.raw.body,
    // @ts-expect-error Cloudflare Workers support duplex
    duplex: ['GET', 'HEAD'].includes(method) ? undefined : 'half',
  });

  const out = new Headers(res.headers);
  out.delete('set-cookie');
  out.set('cache-control', 'no-store');
  return new Response(res.body, { status: res.status, headers: out });
});

proxyApp.get('/fetch', async (c) => {
  const url = c.req.query('url');
  if (!url) return c.json({ error: 'url required' }, 400);

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return c.json({ error: 'invalid url' }, 400);
  }

  const allOutputHosts = getAllOutputHosts();

  if (!hostMatches(parsed.hostname, allOutputHosts)) {
    return c.json({ error: 'host not allowed' }, 403);
  }

  const res = await fetch(parsed);
  const out = new Headers(res.headers);
  out.delete('set-cookie');
  out.set('cache-control', 'no-store');
  return new Response(res.body, { status: res.status, headers: out });
});
