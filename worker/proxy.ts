import { Hono } from 'hono';
import { getProvider, getAllOutputHosts } from '@shared/providers/registry';
import type { WorkerEnv } from './types';
import { importKek, unwrapDek, open, resolveKekString } from './crypto';

const HEADER_ALLOWLIST = new Set(['content-type', 'accept', 'prefer', 'x-runway-version', 'content-length']);

function isAllowedHeader(name: string): boolean {
  const lower = name.toLowerCase();
  return HEADER_ALLOWLIST.has(lower) || lower.startsWith('x-fal-');
}

export function hostMatches(hostname: string, patterns: string[]): boolean {
  for (const p of patterns) {
    if (p.startsWith('*.')) {
      if (hostname.endsWith(p.slice(1)) || hostname === p.slice(2)) return true;
    } else if (hostname === p) {
      return true;
    }
  }
  return false;
}

const MAX_INLINE_CREDENTIAL = 4096;
function hasNonPrintable(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if ((c >= 0 && c <= 8) || (c >= 14 && c <= 31) || c === 127) return true;
  }
  return false;
}

function applyAuth(headers: Headers, spec: { auth: { header: string; scheme?: string } }, secret: string): void {
  if (spec.auth.scheme === 'raw') {
    headers.set(spec.auth.header, secret);
  } else if (spec.auth.scheme === 'Key') {
    headers.set(spec.auth.header, `Key ${secret}`);
  } else if (spec.auth.scheme === 'Bearer' || !spec.auth.scheme) {
    headers.set(spec.auth.header, `Bearer ${secret}`);
  }
}

export const proxyApp = new Hono<{ Bindings: WorkerEnv }>();

proxyApp.all('/proxy/:provider/*', async (c) => {
  const providerId = c.req.param('provider');
  const spec = getProvider(providerId);
  if (!spec) return c.json({ error: 'unknown provider' }, 404);
  if (spec.transport !== 'proxy') return c.json({ error: 'provider does not support proxy transport' }, 404);
  if (spec.hosts.length === 0) return c.json({ error: 'unknown provider' }, 404);

  if (spec.auth.scheme === 'jwt-hs256') {
    return c.json({ error: 'jwt-hs256 auth scheme must be handled by the adapter' }, 501);
  }

  const email = c.get('email' as never) as string;

  const proxyHost = c.req.header('X-Proxy-Host');
  let targetHost: string;
  if (proxyHost) {
    if (!hostMatches(proxyHost, spec.hosts)) {
      return c.json({ error: 'X-Proxy-Host not in provider host list' }, 400);
    }
    targetHost = proxyHost;
  } else {
    if (spec.hosts[0].startsWith('*.')) {
      return c.json({ error: 'X-Proxy-Host required when default host is a wildcard' }, 400);
    }
    targetHost = spec.hosts[0];
  }

  const basePath = c.req.routePath.split('/proxy/')[0];
  const rest = c.req.path.replace(new RegExp(`^${basePath}/proxy/${providerId}/`), '');
  const target = new URL(`https://${targetHost}/${rest}${new URL(c.req.url).search}`);

  if (!hostMatches(target.hostname, spec.hosts)) {
    return c.json({ error: 'host not allowed' }, 403);
  }

  const headers = new Headers();
  for (const [k, v] of c.req.raw.headers.entries()) {
    if (isAllowedHeader(k)) headers.set(k, v);
  }

  const inlineCredential = c.req.header('X-Credential-Inline');
  if (inlineCredential) {
    if (inlineCredential.length > MAX_INLINE_CREDENTIAL) {
      return c.json({ error: 'X-Credential-Inline exceeds 4KB limit' }, 400);
    }
    if (hasNonPrintable(inlineCredential)) {
      return c.json({ error: 'X-Credential-Inline contains invalid characters' }, 400);
    }
    applyAuth(headers, spec, inlineCredential);
  } else {
    const credentialId = c.req.header('X-Credential');
    const user = await c.env.DB.prepare('SELECT wrapped_dek, dek_iv, kek_version FROM users WHERE email=?')
      .bind(email)
      .first<{ wrapped_dek: ArrayBuffer; dek_iv: ArrayBuffer; kek_version: number }>();
    if (!user) return c.json({ error: 'no credentials configured' }, 400);

    const userKek = await importKek(resolveKekString(c.env, user.kek_version));

    let cred: { id: string; provider_id: string; ciphertext: ArrayBuffer; iv: ArrayBuffer } | null;
    if (credentialId) {
      cred = await c.env.DB.prepare('SELECT id, provider_id, ciphertext, iv FROM credentials WHERE id=? AND email=?')
        .bind(credentialId, email)
        .first();
      if (cred && cred.provider_id !== providerId) {
        return c.json({ error: 'credential does not belong to this provider' }, 400);
      }
    } else {
      cred = await c.env.DB.prepare(
        'SELECT id, provider_id, ciphertext, iv FROM credentials WHERE email=? AND provider_id=? AND is_default=1',
      )
        .bind(email, providerId)
        .first();
    }
    if (!cred) return c.json({ error: 'credential not found' }, 404);

    const dek = await unwrapDek(userKek, new Uint8Array(user.wrapped_dek), new Uint8Array(user.dek_iv), email);
    const secret = await open(dek, new Uint8Array(cred.ciphertext), new Uint8Array(cred.iv), `${email}|${cred.id}|${cred.provider_id}`);

    applyAuth(headers, spec, secret);
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
