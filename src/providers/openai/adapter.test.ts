import { describe, it, expect, vi } from 'vitest';
import { openaiAdapter } from './adapter';
import type { AdapterContext, GenerateRequest } from '@shared/types';

function makeCtx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    providerId: 'openai',
    fetch: vi.fn() as unknown as typeof fetch,
    resolveUrl: (p: string) => `https://api.openai.com${p}`,
    uploadTemp: vi.fn().mockResolvedValue('https://tmp/file'),
    log: vi.fn(),
    ...overrides,
  };
}

describe('openai adapter', () => {
  it('has correct spec and capabilities', () => {
    expect(openaiAdapter.spec.id).toBe('openai');
    expect(openaiAdapter.capabilities).toContain('text2image');
    expect(openaiAdapter.capabilities).toContain('image2image');
    expect(openaiAdapter.capabilities).toContain('inpaint');
  });

  it('listModels returns 6 models', async () => {
    const models = await openaiAdapter.listModels(makeCtx());
    expect(models.length).toBe(6);
  });

  it('models always include model id explicitly (gotcha)', async () => {
    const models = await openaiAdapter.listModels(makeCtx());
    for (const m of models) {
      expect(m.id).toBeTruthy();
      expect(m.provider_id).toBe('openai');
    }
  });

  it('submit text2image with GPT model sends model explicitly', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: [{ b64_json: 'iVBOR...' }],
        usage: { total_tokens: 100 },
      }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const req: GenerateRequest = {
      provider_id: 'openai',
      model_id: 'gpt-image-2',
      capability: 'text2image',
      params: { prompt: 'a cat', size: 'auto', quality: 'high', output_format: 'png' },
    };

    const handle = await openaiAdapter.submit(req, ctx);
    expect(handle.provider_id).toBe('openai');

    const call = mockFetch.mock.calls[0][0] as Request;
    const body = JSON.parse(await call.text());
    expect(body.model).toBe('gpt-image-2');
    expect(body.prompt).toBe('a cat');
    expect(body.output_format).toBe('png');
  });

  it('submit text2image with DALL-E sends response_format b64_json', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: [{ b64_json: 'base64...' }],
      }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const req: GenerateRequest = {
      provider_id: 'openai',
      model_id: 'dall-e-3',
      capability: 'text2image',
      params: { prompt: 'a dog', size: '1024x1024', quality: 'hd', style: 'vivid' },
    };

    await openaiAdapter.submit(req, ctx);

    const call = mockFetch.mock.calls[0][0] as Request;
    const body = JSON.parse(await call.text());
    expect(body.model).toBe('dall-e-3');
    expect(body.response_format).toBe('b64_json');
    expect(body.style).toBe('vivid');
  });

  it('submit does not send output_format for DALL-E', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: 'x' }] }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const req: GenerateRequest = {
      provider_id: 'openai',
      model_id: 'dall-e-3',
      capability: 'text2image',
      params: { prompt: 'test', output_format: 'webp' },
    };

    await openaiAdapter.submit(req, ctx);
    const body = JSON.parse(await (mockFetch.mock.calls[0][0] as Request).text());
    expect(body.output_format).toBeUndefined();
  });

  it('submit does not send input_fidelity for gpt-image-1-mini', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ data: [{ b64_json: 'x' }] }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const req: GenerateRequest = {
      provider_id: 'openai',
      model_id: 'gpt-image-1-mini',
      capability: 'image2image',
      params: { prompt: 'edit', input_fidelity: 'high' },
    };

    await openaiAdapter.submit(req, ctx);
    const body = JSON.parse(await (mockFetch.mock.calls[0][0] as Request).text());
    expect(body.input_fidelity).toBeUndefined();
  });

  it('poll returns base64 images', async () => {
    const handle = {
      provider_id: 'openai', model_id: 'gpt-image-2', capability: 'text2image' as const,
      provider_ref: { sync: true, data: [{ b64_json: 'iVBOR...' }], mime: 'image/png' },
      submitted_at: Date.now(),
    };

    const status = await openaiAdapter.poll(handle, makeCtx());
    expect(status.state).toBe('succeeded');
    expect(status.outputs).toHaveLength(1);
    expect(status.outputs![0].source).toBe('base64');
    expect(status.outputs![0].mime).toBe('image/png');
  });

  it('poll returns URL images with expiry for DALL-E', async () => {
    const handle = {
      provider_id: 'openai', model_id: 'dall-e-3', capability: 'text2image' as const,
      provider_ref: {
        sync: true,
        data: [{ url: 'https://oaidalleapiprodscus.blob.core.windows.net/image.png' }],
        mime: 'image/png',
      },
      submitted_at: Date.now(),
    };

    const status = await openaiAdapter.poll(handle, makeCtx());
    expect(status.state).toBe('succeeded');
    expect(status.outputs![0].source).toBe('url');
    expect(status.outputs![0].expires_at).toBeGreaterThan(Date.now());
  });

  it('dall-e-3 has maxImages = 1', async () => {
    const models = await openaiAdapter.listModels(makeCtx());
    const dalle3 = models.find((m) => m.id === 'dall-e-3');
    expect(dalle3?.limits?.maxImages).toBe(1);
  });

  it('gpt-image-1-mini does not expose input_fidelity', async () => {
    const models = await openaiAdapter.listModels(makeCtx());
    const mini = models.find((m) => m.id === 'gpt-image-1-mini');
    expect(mini?.params.input_fidelity).toBeUndefined();
  });
});
