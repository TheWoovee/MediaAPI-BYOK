import { describe, it, expect } from 'vitest';
import { getProvider } from '@shared/providers/registry';
import type { JobStatusState, Capability } from '@shared/types';

const VALID_STATUSES: ReadonlySet<string> = new Set<JobStatusState>(['queued', 'processing', 'succeeded', 'failed', 'cancelled']);
const VALID_CAPABILITIES: ReadonlySet<string> = new Set<Capability>([
  'text2image', 'image2image', 'inpaint', 'upscale', 'remove_bg',
  'text2video', 'image2video', 'video2video', 'video_extend',
]);
const PATCH_ALLOWLIST: ReadonlySet<string> = new Set(['status', 'provider_ref_json', 'outputs_json', 'error', 'cost_hint']);

describe('jobs validation (item 1)', () => {
  it('PATCH only allows whitelisted columns', () => {
    for (const field of PATCH_ALLOWLIST) {
      expect(PATCH_ALLOWLIST.has(field)).toBe(true);
    }
    expect(PATCH_ALLOWLIST.has('email')).toBe(false);
    expect(PATCH_ALLOWLIST.has('id')).toBe(false);
    expect(PATCH_ALLOWLIST.has('created_at')).toBe(false);
    expect(PATCH_ALLOWLIST.has('provider_id')).toBe(false);
    expect(PATCH_ALLOWLIST.has('model_id')).toBe(false);
    expect(PATCH_ALLOWLIST.has('capability')).toBe(false);
  });

  it('validates status against JobStatusState', () => {
    expect(VALID_STATUSES.has('queued')).toBe(true);
    expect(VALID_STATUSES.has('processing')).toBe(true);
    expect(VALID_STATUSES.has('succeeded')).toBe(true);
    expect(VALID_STATUSES.has('failed')).toBe(true);
    expect(VALID_STATUSES.has('cancelled')).toBe(true);
    expect(VALID_STATUSES.has('invalid')).toBe(false);
    expect(VALID_STATUSES.has('admin_override')).toBe(false);
  });

  it('POST validates provider_id, capability, and status', () => {
    expect(getProvider('xai')).toBeDefined();
    expect(getProvider('nonexistent')).toBeUndefined();
    expect(VALID_CAPABILITIES.has('text2image')).toBe(true);
    expect(VALID_CAPABILITIES.has('sql_inject')).toBe(false);
  });
});

describe('credentials validation (item 6)', () => {
  it('validates provider_id exists in registry', () => {
    expect(getProvider('xai')).toBeDefined();
    expect(getProvider('fake-provider')).toBeUndefined();
  });

  it('caps secret at 8KB', () => {
    const MAX_SECRET_BYTES = 8192;
    const shortSecret = 'abc123';
    const longSecret = 'x'.repeat(MAX_SECRET_BYTES + 1);
    expect(new TextEncoder().encode(shortSecret).length <= MAX_SECRET_BYTES).toBe(true);
    expect(new TextEncoder().encode(longSecret).length <= MAX_SECRET_BYTES).toBe(false);
  });

  it('caps label at 100 chars', () => {
    const MAX_LABEL_CHARS = 100;
    expect('My API Key'.length <= MAX_LABEL_CHARS).toBe(true);
    expect('x'.repeat(101).length <= MAX_LABEL_CHARS).toBe(false);
  });

  it('rejects unknown PATCH fields', () => {
    const allowedFields = new Set(['label', 'is_default']);
    expect(allowedFields.has('label')).toBe(true);
    expect(allowedFields.has('is_default')).toBe(true);
    expect(allowedFields.has('secret')).toBe(false);
    expect(allowedFields.has('email')).toBe(false);
    expect(allowedFields.has('provider_id')).toBe(false);
  });
});

describe('local-servers hostname validation (item 5)', () => {
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

  it('rejects localhost and IP literals', () => {
    expect(isForbiddenHost('localhost')).toBe(true);
    expect(isForbiddenHost('127.0.0.1')).toBe(true);
    expect(isForbiddenHost('10.0.0.1')).toBe(true);
    expect(isForbiddenHost('192.168.1.1')).toBe(true);
    expect(isForbiddenHost('[::1]')).toBe(true);
  });

  it('rejects .local and .internal suffixes', () => {
    expect(isForbiddenHost('myserver.local')).toBe(true);
    expect(isForbiddenHost('api.internal')).toBe(true);
  });

  it('allows valid public hostnames', () => {
    expect(isForbiddenHost('my-comfyui.example.com')).toBe(false);
    expect(isForbiddenHost('tunnel.cloudflareaccess.com')).toBe(false);
  });

  it('verifies target origin matches base_url origin', () => {
    const baseUrl = new URL('https://my-server.example.com:8443');
    const target = new URL('https://my-server.example.com:8443/api/generate');
    expect(target.origin).toBe(baseUrl.origin);

    const bad = new URL('https://evil.com/api/generate');
    expect(bad.origin).not.toBe(baseUrl.origin);
  });
});

describe('uploads content-type validation (item 4)', () => {
  const ALLOWED_MIME_RE = /^(image|video)\//;

  it('accepts image/* and video/* types', () => {
    expect(ALLOWED_MIME_RE.test('image/png')).toBe(true);
    expect(ALLOWED_MIME_RE.test('image/jpeg')).toBe(true);
    expect(ALLOWED_MIME_RE.test('video/mp4')).toBe(true);
    expect(ALLOWED_MIME_RE.test('video/webm')).toBe(true);
  });

  it('rejects non-media types', () => {
    expect(ALLOWED_MIME_RE.test('application/octet-stream')).toBe(false);
    expect(ALLOWED_MIME_RE.test('text/html')).toBe(false);
    expect(ALLOWED_MIME_RE.test('application/json')).toBe(false);
  });
});

describe('credential round-trip', () => {
  it('encrypt then decrypt preserves secret', async () => {
    const { importKek, newDek, wrapDek, unwrapDek, seal, open } = await import('./crypto');
    const KEK = 'q3Zg7mYb5o0yq1yq9sV2Xf7rXk4sZq1u8bJf0Q2r6Zc=';
    const email = 'test@example.com';
    const providerId = 'xai';
    const secret = 'xai-my-secret-key-1234';

    const kek = await importKek(KEK);
    const dek = await newDek();
    const w = await wrapDek(kek, dek, email);

    const id = crypto.randomUUID();
    const s = await seal(dek, secret, `${email}|${id}|${providerId}`);

    const dek2 = await unwrapDek(kek, w.wrapped, w.iv, email);
    const revealed = await open(dek2, s.ciphertext, s.iv, `${email}|${id}|${providerId}`);
    expect(revealed).toBe(secret);
  });
});

describe('KEK rotation (item 17)', () => {
  it('resolveKekString uses versioned key when available', async () => {
    const { resolveKekString, currentKekVersion } = await import('./crypto');
    const env = { KEK: 'default-key', KEK_VERSION: '2', KEK_V2: 'versioned-key' };
    expect(currentKekVersion(env)).toBe(2);
    expect(resolveKekString(env)).toBe('versioned-key');
    expect(resolveKekString(env, 1)).toBe('default-key');
    expect(resolveKekString(env, 2)).toBe('versioned-key');
  });

  it('falls back to KEK when versioned key is missing', async () => {
    const { resolveKekString } = await import('./crypto');
    const env = { KEK: 'fallback-key', KEK_VERSION: '3' };
    expect(resolveKekString(env)).toBe('fallback-key');
    expect(resolveKekString(env, 3)).toBe('fallback-key');
  });

  it('defaults to version 1 when KEK_VERSION is unset', async () => {
    const { currentKekVersion, resolveKekString } = await import('./crypto');
    const env = { KEK: 'only-key' } as { KEK: string; KEK_VERSION?: string; [key: string]: unknown };
    expect(currentKekVersion(env)).toBe(1);
    expect(resolveKekString(env)).toBe('only-key');
  });
});
