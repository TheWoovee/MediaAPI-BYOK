import { describe, it, expect } from 'vitest';
import { getProvider, providers } from '@shared/providers/registry';

describe('proxy allowlist', () => {
  it('recognises valid providers from the registry', () => {
    expect(getProvider('xai')).toBeDefined();
    expect(getProvider('fal')).toBeDefined();
    expect(getProvider('google')).toBeDefined();
    expect(getProvider('nonexistent')).toBeUndefined();
  });

  it('every provider has valid hosts or is a local provider', () => {
    const localIds = ['comfyui', 'a1111', 'swarmui', 'openai-compat'];
    for (const p of providers) {
      if (localIds.includes(p.id)) continue;
      expect(p.hosts.length, `${p.id} should have hosts`).toBeGreaterThan(0);
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

    expect(hostMatches('user-demo.hf.space', ['*.hf.space'])).toBe(true);
    expect(hostMatches('hf.space', ['*.hf.space'])).toBe(true);
    expect(hostMatches('evil.com', ['*.hf.space'])).toBe(false);
    expect(hostMatches('api.x.ai', ['api.x.ai'])).toBe(true);
    expect(hostMatches('evil.x.ai', ['api.x.ai'])).toBe(false);
  });

  it('QUERY method would be passed through', () => {
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'QUERY'];
    for (const m of methods) {
      const hasBody = !['GET', 'HEAD'].includes(m);
      if (m === 'QUERY') expect(hasBody).toBe(true);
    }
  });
});
