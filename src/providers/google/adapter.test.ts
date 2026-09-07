import { describe, it, expect, vi } from 'vitest';
import { googleAdapter } from './adapter';
import type { AdapterContext, GenerateRequest } from '@shared/types';

function makeCtx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    providerId: 'google',
    fetch: vi.fn() as unknown as typeof fetch,
    resolveUrl: (p: string) => `https://generativelanguage.googleapis.com${p}`,
    uploadTemp: vi.fn().mockResolvedValue('https://tmp/file'),
    log: vi.fn(),
    ...overrides,
  };
}

describe('google adapter', () => {
  it('has correct spec and capabilities', () => {
    expect(googleAdapter.spec.id).toBe('google');
    expect(googleAdapter.spec.transport).toBe('direct');
    expect(googleAdapter.capabilities).toContain('text2image');
    expect(googleAdapter.capabilities).toContain('image2image');
    expect(googleAdapter.capabilities).toContain('text2video');
    expect(googleAdapter.capabilities).toContain('image2video');
    expect(googleAdapter.capabilities).toContain('video_extend');
  });

  it('listModels returns 6 models', async () => {
    const models = await googleAdapter.listModels(makeCtx());
    expect(models.length).toBe(6);
  });

  it('does not include retired models (Imagen, Veo 2/3.0)', async () => {
    const models = await googleAdapter.listModels(makeCtx());
    const ids = models.map((m) => m.id);
    expect(ids).not.toContain('imagen-4.0-generate-001');
    expect(ids).not.toContain('veo-3.0-generate-001');
    expect(ids).not.toContain('veo-2.0-generate-001');
  });

  it('submit text2image via generateContent', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        candidates: [{
          content: {
            parts: [{ inlineData: { mimeType: 'image/png', data: 'iVBOR...' } }],
            role: 'model',
          },
          finishReason: 'STOP',
        }],
      }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const req: GenerateRequest = {
      provider_id: 'google',
      model_id: 'gemini-3.1-flash-image',
      capability: 'text2image',
      params: { prompt: 'a red panda', aspectRatio: '16:9', imageSize: '2K' },
    };

    const handle = await googleAdapter.submit(req, ctx);
    expect(handle.provider_id).toBe('google');
    expect((handle.provider_ref as { sync: boolean }).sync).toBe(true);

    const call = mockFetch.mock.calls[0][0] as Request;
    expect(call.url).toContain('gemini-3.1-flash-image:generateContent');
    const body = JSON.parse(await call.text());
    expect(body.generationConfig.responseModalities).toEqual(['IMAGE']);
    expect(body.generationConfig.imageConfig.aspectRatio).toBe('16:9');
    expect(body.generationConfig.imageConfig.imageSize).toBe('2K');
  });

  it('submit text2video via predictLongRunning', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        name: 'models/veo-3.1-generate-preview/operations/op-123',
      }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const req: GenerateRequest = {
      provider_id: 'google',
      model_id: 'veo-3.1-generate-preview',
      capability: 'text2video',
      params: { prompt: 'a sunset', aspectRatio: '16:9', resolution: '1080p', durationSeconds: '8' },
    };

    const handle = await googleAdapter.submit(req, ctx);
    expect(handle.poll_url).toContain('models/veo-3.1-generate-preview/operations/op-123');
    expect((handle.provider_ref as { operation: string }).operation).toBe(
      'models/veo-3.1-generate-preview/operations/op-123',
    );

    const call = mockFetch.mock.calls[0][0] as Request;
    expect(call.url).toContain('predictLongRunning');
    const body = JSON.parse(await call.text());
    expect(body.instances[0].prompt).toBe('a sunset');
    expect(body.parameters.resolution).toBe('1080p');
    expect(body.parameters.durationSeconds).toBe(8);
  });

  it('poll video pending', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ done: false }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const handle = {
      provider_id: 'google', model_id: 'veo-3.1-generate-preview', capability: 'text2video' as const,
      provider_ref: { operation: 'models/veo/operations/op-1' },
      poll_url: 'https://generativelanguage.googleapis.com/v1beta/models/veo/operations/op-1',
      submitted_at: Date.now(),
    };

    const status = await googleAdapter.poll(handle, ctx);
    expect(status.state).toBe('processing');
  });

  it('poll video done with samples', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        done: true,
        response: {
          generateVideoResponse: {
            generatedSamples: [{ video: { uri: 'https://generativelanguage.googleapis.com/v1beta/files/xxxx:download?alt=media' } }],
          },
        },
      }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const handle = {
      provider_id: 'google', model_id: 'veo-3.1-generate-preview', capability: 'text2video' as const,
      provider_ref: { operation: 'op-1' },
      poll_url: 'https://generativelanguage.googleapis.com/v1beta/models/veo/operations/op-1',
      submitted_at: Date.now(),
    };

    const status = await googleAdapter.poll(handle, ctx);
    expect(status.state).toBe('succeeded');
    expect(status.outputs).toHaveLength(1);
    expect(status.outputs![0].kind).toBe('video');
    expect(status.outputs![0].expires_at).toBeGreaterThan(Date.now());
  });

  it('poll video done with error', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        done: true,
        error: { code: 400, message: 'Invalid prompt' },
      }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const handle = {
      provider_id: 'google', model_id: 'veo-3.1-generate-preview', capability: 'text2video' as const,
      provider_ref: { operation: 'op-1' },
      poll_url: 'https://generativelanguage.googleapis.com/v1beta/models/veo/operations/op-1',
      submitted_at: Date.now(),
    };

    const status = await googleAdapter.poll(handle, ctx);
    expect(status.state).toBe('failed');
    expect(status.error).toContain('Invalid prompt');
  });

  it('poll video filtered by RAI', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        done: true,
        response: {
          generateVideoResponse: {
            generatedSamples: [],
            raiMediaFilteredCount: 1,
            raiMediaFilteredReasons: ['SAFETY'],
          },
        },
      }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const handle = {
      provider_id: 'google', model_id: 'veo-3.1-generate-preview', capability: 'text2video' as const,
      provider_ref: { operation: 'op-1' },
      poll_url: 'https://generativelanguage.googleapis.com/v1beta/models/veo/operations/op-1',
      submitted_at: Date.now(),
    };

    const status = await googleAdapter.poll(handle, ctx);
    expect(status.state).toBe('failed');
    expect(status.error).toContain('filtered');
  });

  it('poll sync image', async () => {
    const handle = {
      provider_id: 'google', model_id: 'gemini-3.1-flash-image', capability: 'text2image' as const,
      provider_ref: { sync: true, images: [{ mime: 'image/png', data: 'iVBOR...' }] },
      submitted_at: Date.now(),
    };

    const status = await googleAdapter.poll(handle, makeCtx());
    expect(status.state).toBe('succeeded');
    expect(status.outputs![0].source).toBe('base64');
  });

  it('veo lite does not support extend', async () => {
    const models = await googleAdapter.listModels(makeCtx());
    const lite = models.find((m) => m.id === 'veo-3.1-lite-generate-preview');
    expect(lite?.capabilities).not.toContain('video_extend');
  });

  it('veo lite does not support 4k', async () => {
    const models = await googleAdapter.listModels(makeCtx());
    const lite = models.find((m) => m.id === 'veo-3.1-lite-generate-preview');
    expect(lite?.params.resolution?.enum).not.toContain('4k');
  });

  it('video output expires_at is 48h', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        done: true,
        response: {
          generateVideoResponse: {
            generatedSamples: [{ video: { uri: 'https://example.com/video.mp4' } }],
          },
        },
      }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const handle = {
      provider_id: 'google', model_id: 'veo-3.1-generate-preview', capability: 'text2video' as const,
      provider_ref: { operation: 'op-1' },
      poll_url: 'https://generativelanguage.googleapis.com/v1beta/models/veo/operations/op-1',
      submitted_at: Date.now(),
    };

    const status = await googleAdapter.poll(handle, ctx);
    const expiry = status.outputs![0].expires_at!;
    const hours = (expiry - Date.now()) / 3600_000;
    expect(hours).toBeGreaterThan(47);
    expect(hours).toBeLessThanOrEqual(48.1);
  });
});
