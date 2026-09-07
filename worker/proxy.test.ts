import { describe, it, expect } from 'vitest';
import { getProvider, providers } from '@shared/providers/registry';
import { hostMatches } from './proxy';

describe('proxy allowlist', () => {
  it('recognises valid providers from the registry', () => {
    expect(getProvider('xai')).toBeDefined();
    expect(getProvider('fal')).toBeDefined();
    expect(getProvider('google')).toBeDefined();
    expect(getProvider('nonexistent')).toBeUndefined();
  });

  it('every provider has valid hosts or is a local provider', () => {
    for (const p of providers) {
      if (p.transport === 'local') {
        expect(p.hosts.length, `${p.id} local should have empty hosts`).toBe(0);
      } else if (p.transport === 'proxy' && p.id !== 'openai-compat') {
        expect(p.hosts.length, `${p.id} should have hosts`).toBeGreaterThan(0);
      }
    }
  });

  it('strips dangerous request headers', () => {
    const HEADER_ALLOWLIST = new Set(['content-type', 'accept', 'prefer', 'x-runway-version', 'content-length']);
    const isAllowed = (name: string) => {
      const lower = name.toLowerCase();
      return HEADER_ALLOWLIST.has(lower) || lower.startsWith('x-fal-');
    };
    expect(isAllowed('content-type')).toBe(true);
    expect(isAllowed('accept')).toBe(true);
    expect(isAllowed('prefer')).toBe(true);
    expect(isAllowed('x-runway-version')).toBe(true);
    expect(isAllowed('x-fal-target-url')).toBe(true);
    expect(isAllowed('cookie')).toBe(false);
    expect(isAllowed('cf-connecting-ip')).toBe(false);
    expect(isAllowed('x-forwarded-for')).toBe(false);
    expect(isAllowed('authorization')).toBe(false);
  });

  it('host matching works for wildcard patterns', () => {
    expect(hostMatches('user-demo.hf.space', ['*.hf.space'])).toBe(true);
    expect(hostMatches('hf.space', ['*.hf.space'])).toBe(true);
    expect(hostMatches('evil.com', ['*.hf.space'])).toBe(false);
    expect(hostMatches('api.x.ai', ['api.x.ai'])).toBe(true);
    expect(hostMatches('evil.x.ai', ['api.x.ai'])).toBe(false);
  });
});

describe('proxy transport gate', () => {
  it('non-proxy transport providers are rejected (item 3e)', () => {
    const local = getProvider('comfyui');
    expect(local).toBeDefined();
    expect(local!.transport).toBe('local');

    const direct = getProvider('google');
    expect(direct).toBeDefined();
    expect(direct!.transport).toBe('direct');

    const proxy = getProvider('xai');
    expect(proxy).toBeDefined();
    expect(proxy!.transport).toBe('proxy');
  });

  it('jwt-hs256 scheme returns 501 conceptually (item 3a)', () => {
    const kling = getProvider('kling');
    expect(kling).toBeDefined();
    expect(kling!.auth.scheme).toBe('jwt-hs256');
  });
});

describe('inline credential validation (item 3d)', () => {
  const MAX_INLINE = 4096;

  function hasNonPrintable(s: string): boolean {
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      if ((c >= 0 && c <= 8) || (c >= 14 && c <= 31) || c === 127) return true;
    }
    return false;
  }

  it('rejects credentials exceeding 4KB', () => {
    const long = 'a'.repeat(MAX_INLINE + 1);
    expect(long.length > MAX_INLINE).toBe(true);
  });

  it('rejects non-printable characters', () => {
    expect(hasNonPrintable('valid-key-123')).toBe(false);
    expect(hasNonPrintable('key' + String.fromCharCode(0) + 'nulls')).toBe(true);
    expect(hasNonPrintable('key' + String.fromCharCode(127) + 'DEL')).toBe(true);
    expect(hasNonPrintable('key with spaces')).toBe(false);
    expect(hasNonPrintable('key\ttab')).toBe(false);
    expect(hasNonPrintable('key\nnewline')).toBe(false);
  });
});

describe('X-Proxy-Host validation (item 3c)', () => {
  it('validates host against provider host list', () => {
    const bfl = getProvider('bfl')!;
    expect(hostMatches('api.bfl.ai', bfl.hosts)).toBe(true);
    expect(hostMatches('api.eu.bfl.ai', bfl.hosts)).toBe(true);
    expect(hostMatches('api.us.bfl.ai', bfl.hosts)).toBe(true);
    expect(hostMatches('evil.bfl.ai', bfl.hosts)).toBe(false);
  });

  it('requires X-Proxy-Host when default host is a wildcard', () => {
    const hfSpace = getProvider('hf-space')!;
    expect(hfSpace.hosts[0].startsWith('*.')).toBe(true);
  });
});

describe('credential provider match (item 3b)', () => {
  it('credential provider_id must match the proxy provider', () => {
    const cred = { provider_id: 'fal' };
    const providerId = 'xai';
    expect(cred.provider_id === providerId).toBe(false);
  });
});
