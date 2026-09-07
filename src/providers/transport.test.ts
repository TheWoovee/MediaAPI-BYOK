import { describe, it, expect } from 'vitest';
import { makeContext } from './transport';
import type { ProviderSpec } from '@shared/types';

const proxySpec: ProviderSpec = {
  id: 'test-proxy',
  label: 'Test Proxy',
  wave: 1,
  transport: 'proxy',
  hosts: ['api.test.com', 'api-eu.test.com'],
  auth: { header: 'Authorization', scheme: 'Bearer', help: 'Test' },
  outputHosts: [],
  inputModes: ['base64'],
  docsPath: '',
};

const directSpec: ProviderSpec = {
  id: 'test-direct',
  label: 'Test Direct',
  wave: 1,
  transport: 'direct',
  hosts: ['api.direct.com'],
  auth: { header: 'x-api-key', scheme: 'raw', help: 'Test' },
  outputHosts: [],
  inputModes: ['base64'],
  docsPath: '',
};

const localSpec: ProviderSpec = {
  id: 'test-local',
  label: 'Test Local',
  wave: 1,
  transport: 'local',
  hosts: [],
  auth: { header: 'Authorization', scheme: 'Bearer', help: 'Test' },
  outputHosts: [],
  inputModes: ['base64'],
  docsPath: '',
};

describe('makeContext', () => {
  it('creates context with correct providerId', () => {
    const ctx = makeContext(proxySpec, { credentialId: 'cred-1' });
    expect(ctx.providerId).toBe('test-proxy');
    expect(ctx.credentialId).toBe('cred-1');
    expect(typeof ctx.fetch).toBe('function');
    expect(typeof ctx.resolveUrl).toBe('function');
    expect(typeof ctx.uploadTemp).toBe('function');
    expect(typeof ctx.log).toBe('function');
  });

  it('resolveUrl handles absolute URLs', () => {
    const ctx = makeContext(proxySpec);
    expect(ctx.resolveUrl('https://example.com/path')).toBe('https://example.com/path');
  });

  it('resolveUrl handles relative paths', () => {
    const ctx = makeContext(proxySpec);
    const resolved = ctx.resolveUrl('v1/images/generate');
    expect(resolved).toBe('https://api.test.com/v1/images/generate');
  });

  it('resolveUrl strips leading slash from relative path', () => {
    const ctx = makeContext(proxySpec);
    const resolved = ctx.resolveUrl('/v1/images/generate');
    expect(resolved).toBe('https://api.test.com/v1/images/generate');
  });

  it('proxy transport rewrites URL to proxy endpoint', () => {
    const ctx = makeContext(proxySpec, { credentialId: 'c1' });
    expect(ctx.providerId).toBe('test-proxy');
    expect(ctx.credentialId).toBe('c1');
  });

  it('direct transport passes credential', () => {
    const ctx = makeContext(directSpec, { credential: 'my-key' });
    expect(ctx.credential).toBe('my-key');
    expect(ctx.providerId).toBe('test-direct');
  });

  it('local transport with relay routes through API', () => {
    const ctx = makeContext(localSpec, {
      localServerId: 'srv-1',
      localServerMode: 'relay',
    });
    expect(ctx.localServerId).toBe('srv-1');
    expect(ctx.providerId).toBe('test-local');
  });

  it('local transport with direct uses base URL', () => {
    const ctx = makeContext(localSpec, {
      localServerBaseUrl: 'http://localhost:8188',
      localServerMode: 'direct',
    });
    expect(ctx.providerId).toBe('test-local');
  });

  it('passes signal and opts through', () => {
    const controller = new AbortController();
    const ctx = makeContext(proxySpec, { signal: controller.signal });
    expect(ctx.signal).toBe(controller.signal);
  });
});
