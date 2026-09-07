import { describe, it, expect, vi } from 'vitest';
import { openaiCompatAdapter } from './adapter';
import type { AdapterContext, GenerateRequest } from '@shared/types';

function makeCtx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    providerId: 'openai-compat',
    fetch: vi.fn() as unknown as typeof fetch,
    resolveUrl: (p: string) => `http://localhost:8080${p}`,
    uploadTemp: vi.fn().mockResolvedValue('https://tmp/file'),
    log: vi.fn(),
    ...overrides,
  };
}

describe('openai-compat adapter', () => {
  it('has correct spec', () => {
    expect(openaiCompatAdapter.spec.id).toBe('openai-compat');
    expect(openaiCompatAdapter.spec.transport).toBe('local');
    expect(openaiCompatAdapter.capabilities).toContain('text2image');
  });

  it('listModels returns defaults when server unreachable', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED'));
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const models = await openaiCompatAdapter.listModels(ctx);
    expect(models.length).toBe(1);
    expect(models[0].id).toBe('default');
  });

  it('listModels uses server models when available', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ id: 'my-model' }, { id: 'other-model' }] }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const models = await openaiCompatAdapter.listModels(ctx);
    expect(models.length).toBe(2);
    expect(models[0].id).toBe('my-model');
  });

  it('submit sends to /v1/images/generations', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: 'abc' }] }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const req: GenerateRequest = {
      provider_id: 'openai-compat',
      model_id: 'my-model',
      capability: 'text2image',
      params: { prompt: 'test', model: 'my-model' },
    };

    const handle = await openaiCompatAdapter.submit(req, ctx);
    expect(handle.provider_id).toBe('openai-compat');

    const call = mockFetch.mock.calls[0][0] as Request;
    expect(call.url).toContain('/v1/images/generations');
    const body = JSON.parse(await call.text());
    expect(body.response_format).toBe('b64_json');
    expect(body.model).toBe('my-model');
  });

  it('submit skips model for default id', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: 'x' }] }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const req: GenerateRequest = {
      provider_id: 'openai-compat',
      model_id: 'default',
      capability: 'text2image',
      params: { prompt: 'test' },
    };

    await openaiCompatAdapter.submit(req, ctx);
    const body = JSON.parse(await (mockFetch.mock.calls[0][0] as Request).text());
    expect(body.model).toBeUndefined();
  });

  it('poll returns b64 output', async () => {
    const handle = {
      provider_id: 'openai-compat', model_id: 'test', capability: 'text2image' as const,
      provider_ref: { sync: true, data: [{ b64_json: 'base64' }] },
      submitted_at: Date.now(),
    };

    const status = await openaiCompatAdapter.poll(handle, makeCtx());
    expect(status.state).toBe('succeeded');
    expect(status.outputs![0].source).toBe('base64');
  });

  it('poll handles URL output', async () => {
    const handle = {
      provider_id: 'openai-compat', model_id: 'test', capability: 'text2image' as const,
      provider_ref: { sync: true, data: [{ url: 'http://example.com/img.png' }] },
      submitted_at: Date.now(),
    };

    const status = await openaiCompatAdapter.poll(handle, makeCtx());
    expect(status.state).toBe('succeeded');
    expect(status.outputs![0].source).toBe('url');
  });
});
