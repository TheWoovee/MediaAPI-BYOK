import { describe, it, expect, vi, beforeEach } from 'vitest';
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

const mockFetch = vi.fn().mockResolvedValue(new Response('ok'));

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch);
  mockFetch.mockClear();
});

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
    expect(ctx.resolveUrl('v1/images/generate')).toBe('https://api.test.com/v1/images/generate');
  });

  it('resolveUrl strips leading slash from relative path', () => {
    const ctx = makeContext(proxySpec);
    expect(ctx.resolveUrl('/v1/images/generate')).toBe('https://api.test.com/v1/images/generate');
  });

  it('passes signal and opts through', () => {
    const controller = new AbortController();
    const ctx = makeContext(proxySpec, { signal: controller.signal });
    expect(ctx.signal).toBe(controller.signal);
  });
});

describe('proxy transport fetch', () => {
  it('rewrites URL to proxy endpoint with credential header', async () => {
    const ctx = makeContext(proxySpec, { credentialId: 'c1' });
    await ctx.fetch('https://api.test.com/v1/images/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: 'test' }),
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('/studio/api/proxy/test-proxy/v1/images/generate');
    expect(init.method).toBe('POST');
    expect(init.headers.get('X-Credential')).toBe('c1');
    expect(init.body).toBe(JSON.stringify({ prompt: 'test' }));
  });

  it('sets X-Proxy-Host for non-primary hosts', async () => {
    const ctx = makeContext(proxySpec, { credentialId: 'c1' });
    await ctx.fetch('https://api-eu.test.com/v1/images', { method: 'GET' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.get('X-Proxy-Host')).toBe('api-eu.test.com');
  });

  it('sets inline credential header', async () => {
    const ctx = makeContext(proxySpec, { credential: 'sk-test' });
    await ctx.fetch('https://api.test.com/v1/test', { method: 'GET' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.get('X-Credential-Inline')).toBe('sk-test');
  });

  it('does not send body for GET requests', async () => {
    const ctx = makeContext(proxySpec, { credentialId: 'c1' });
    await ctx.fetch('https://api.test.com/v1/status', { method: 'GET' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.body).toBeUndefined();
  });

  it('forwards FormData body without creating a ReadableStream', async () => {
    const ctx = makeContext(proxySpec, { credentialId: 'c1' });
    const fd = new FormData();
    fd.append('image', new Blob(['test']), 'test.png');
    await ctx.fetch('https://api.test.com/v1/edit', {
      method: 'POST',
      body: fd,
    });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.body).toBe(fd);
  });
});

describe('direct transport fetch', () => {
  it('injects raw auth header', async () => {
    const ctx = makeContext(directSpec, { credential: 'my-key' });
    await ctx.fetch('https://api.direct.com/v1/test', { method: 'GET' });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe('https://api.direct.com/v1/test');
    expect(init.headers.get('x-api-key')).toBe('my-key');
  });

  it('injects Bearer auth for Bearer scheme', async () => {
    const bearerSpec: ProviderSpec = { ...directSpec, auth: { ...directSpec.auth, header: 'Authorization', scheme: 'Bearer' } };
    const ctx = makeContext(bearerSpec, { credential: 'tok' });
    await ctx.fetch('https://api.direct.com/v1/test', { method: 'GET' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.headers.get('Authorization')).toBe('Bearer tok');
  });

  it('forwards body directly', async () => {
    const ctx = makeContext(directSpec, { credential: 'key' });
    const body = JSON.stringify({ prompt: 'hello' });
    await ctx.fetch('https://api.direct.com/v1/gen', { method: 'POST', body });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.body).toBe(body);
  });
});

describe('local transport fetch', () => {
  it('relay routes through API', async () => {
    const ctx = makeContext(localSpec, { localServerId: 'srv-1', localServerMode: 'relay' });
    await ctx.fetch('http://localhost:8188/prompt', { method: 'POST', body: '{}' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('/studio/api/local/srv-1/prompt');
  });

  it('direct uses base URL', async () => {
    const ctx = makeContext(localSpec, { localServerBaseUrl: 'http://localhost:8188', localServerMode: 'direct' });
    await ctx.fetch('http://localhost:8188/history/abc', { method: 'GET' });

    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe('http://localhost:8188/history/abc');
  });

  it('does not send body for HEAD requests', async () => {
    const ctx = makeContext(localSpec, { localServerId: 'srv-1', localServerMode: 'relay' });
    await ctx.fetch('http://localhost:8188/status', { method: 'HEAD' });

    const [, init] = mockFetch.mock.calls[0];
    expect(init.body).toBeUndefined();
  });
});
