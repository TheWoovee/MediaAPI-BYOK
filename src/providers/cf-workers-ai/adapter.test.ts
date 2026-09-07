import { describe, it, expect, vi } from 'vitest';
import { cfWorkersAiAdapter } from './adapter';
import type { AdapterContext, GenerateRequest } from '@shared/types';

function makeCtx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    providerId: 'cf-workers-ai',
    fetch: vi.fn() as unknown as typeof fetch,
    resolveUrl: (p: string) => `http://localhost${p}`,
    uploadTemp: vi.fn().mockResolvedValue('https://tmp/file'),
    log: vi.fn(),
    ...overrides,
  };
}

describe('cf-workers-ai adapter', () => {
  it('has correct spec', () => {
    expect(cfWorkersAiAdapter.spec.id).toBe('cf-workers-ai');
    expect(cfWorkersAiAdapter.capabilities).toContain('text2image');
  });

  it('listModels returns static list with 9 models', async () => {
    const models = await cfWorkersAiAdapter.listModels(makeCtx());
    expect(models.length).toBe(9);
    expect(models[0].id).toBe('@cf/black-forest-labs/flux-1-schnell');
    expect(models[0].provider_id).toBe('cf-workers-ai');
  });

  it('submit text2image via binding (no credential)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ image: 'iVBORw0KGgo=' }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const req: GenerateRequest = {
      provider_id: 'cf-workers-ai',
      model_id: '@cf/black-forest-labs/flux-1-schnell',
      capability: 'text2image',
      params: { prompt: 'a cat', steps: 4 },
    };

    const handle = await cfWorkersAiAdapter.submit(req, ctx);
    expect(handle.provider_id).toBe('cf-workers-ai');
    expect(handle.model_id).toBe('@cf/black-forest-labs/flux-1-schnell');
    expect((handle.provider_ref as { sync: boolean }).sync).toBe(true);

    const call = mockFetch.mock.calls[0][0] as Request;
    expect(call.url).toContain('/api/ai/run/@cf/black-forest-labs/flux-1-schnell');
  });

  it('submit text2image via REST API (with credential)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ result: { image: 'iVBORw0KGgo=' }, success: true }), { status: 200 }),
    );
    const ctx = makeCtx({
      credential: 'abc123accountid:my-cf-token',
      fetch: mockFetch as unknown as typeof fetch,
    });

    const req: GenerateRequest = {
      provider_id: 'cf-workers-ai',
      model_id: '@cf/black-forest-labs/flux-1-schnell',
      capability: 'text2image',
      params: { prompt: 'a dog' },
    };

    const handle = await cfWorkersAiAdapter.submit(req, ctx);
    expect(handle.provider_id).toBe('cf-workers-ai');

    const call = mockFetch.mock.calls[0][0] as Request;
    expect(call.url).toContain('api.cloudflare.com');
    expect(call.url).toContain('abc123accountid');
  });

  it('poll returns succeeded with base64 output', async () => {
    const handle = {
      provider_id: 'cf-workers-ai',
      model_id: '@cf/black-forest-labs/flux-1-schnell',
      capability: 'text2image' as const,
      provider_ref: { sync: true, base64: 'iVBORw0KGgo=' },
      submitted_at: Date.now(),
    };

    const status = await cfWorkersAiAdapter.poll(handle, makeCtx());
    expect(status.state).toBe('succeeded');
    expect(status.outputs).toHaveLength(1);
    expect(status.outputs![0].kind).toBe('image');
    expect(status.outputs![0].source).toBe('base64');
  });

  it('poll handles SD model bytes output', async () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
    const handle = {
      provider_id: 'cf-workers-ai',
      model_id: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
      capability: 'text2image' as const,
      provider_ref: { sync: true, bytes: bytes.buffer, mime: 'image/png' },
      submitted_at: Date.now(),
    };

    const status = await cfWorkersAiAdapter.poll(handle, makeCtx());
    expect(status.state).toBe('succeeded');
    expect(status.outputs![0].kind).toBe('image');
    expect(status.outputs![0].source).toBe('base64');
    expect(status.outputs![0].mime).toBe('image/png');
  });

  it('submit throws on error response', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response('{"errors":["rate limited"]}', { status: 429 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const req: GenerateRequest = {
      provider_id: 'cf-workers-ai',
      model_id: '@cf/black-forest-labs/flux-1-schnell',
      capability: 'text2image',
      params: { prompt: 'test' },
    };

    await expect(cfWorkersAiAdapter.submit(req, ctx)).rejects.toThrow('Workers AI error 429');
  });

  it('requires accountId:token format for REST', async () => {
    const ctx = makeCtx({ credential: 'just-a-token' });

    const req: GenerateRequest = {
      provider_id: 'cf-workers-ai',
      model_id: '@cf/black-forest-labs/flux-1-schnell',
      capability: 'text2image',
      params: { prompt: 'test' },
    };

    await expect(cfWorkersAiAdapter.submit(req, ctx)).rejects.toThrow('accountId:token');
  });

  it('all models have prompt param', async () => {
    const models = await cfWorkersAiAdapter.listModels(makeCtx());
    for (const m of models) {
      expect(m.params.prompt).toBeDefined();
      expect(m.params.prompt.required).toBe(true);
    }
  });
});
