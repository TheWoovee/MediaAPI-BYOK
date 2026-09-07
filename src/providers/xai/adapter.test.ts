import { describe, it, expect, vi } from 'vitest';
import { xaiAdapter } from './adapter';
import type { AdapterContext, GenerateRequest } from '@shared/types';

function makeCtx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    providerId: 'xai',
    fetch: vi.fn() as unknown as typeof fetch,
    resolveUrl: (p: string) => `https://api.x.ai${p}`,
    uploadTemp: vi.fn().mockResolvedValue('https://tmp/file'),
    log: vi.fn(),
    ...overrides,
  };
}

describe('xai adapter', () => {
  it('has correct spec and capabilities', () => {
    expect(xaiAdapter.spec.id).toBe('xai');
    expect(xaiAdapter.capabilities).toContain('text2image');
    expect(xaiAdapter.capabilities).toContain('image2image');
    expect(xaiAdapter.capabilities).toContain('text2video');
    expect(xaiAdapter.capabilities).toContain('image2video');
    expect(xaiAdapter.capabilities).toContain('video_extend');
  });

  it('listModels returns 4 models', async () => {
    const models = await xaiAdapter.listModels(makeCtx());
    expect(models.length).toBe(4);
    expect(models.map((m) => m.id)).toContain('grok-imagine-image-2.0');
    expect(models.map((m) => m.id)).toContain('grok-imagine-video-1.5');
  });

  it('does not include retired models', async () => {
    const models = await xaiAdapter.listModels(makeCtx());
    const ids = models.map((m) => m.id);
    expect(ids).not.toContain('grok-2-image-1212');
    expect(ids).not.toContain('grok-2-image');
    expect(ids).not.toContain('grok-imagine-image-quality');
  });

  it('submit text2image sends b64_json format', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        data: [{ b64_json: '/9j/4AAQ...' }],
        usage: { cost_in_usd_ticks: 200000000 },
      }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const req: GenerateRequest = {
      provider_id: 'xai',
      model_id: 'grok-imagine-image-2.0',
      capability: 'text2image',
      params: { prompt: 'a cat', aspect_ratio: '16:9', resolution: '2k', quality: 'auto' },
    };

    const handle = await xaiAdapter.submit(req, ctx);
    expect(handle.provider_id).toBe('xai');

    const call = mockFetch.mock.calls[0][0] as Request;
    const body = JSON.parse(await call.text());
    expect(body.model).toBe('grok-imagine-image-2.0');
    expect(body.response_format).toBe('b64_json');
    expect(body.aspect_ratio).toBe('16:9');
    expect(body.resolution).toBe('2k');
  });

  it('submit text2video returns async handle', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ request_id: 'req-abc-123' }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });

    const req: GenerateRequest = {
      provider_id: 'xai',
      model_id: 'grok-imagine-video-1.5',
      capability: 'text2video',
      params: { prompt: 'a sunset', duration: 8, aspect_ratio: '16:9', resolution: '720p' },
    };

    const handle = await xaiAdapter.submit(req, ctx);
    expect(handle.poll_url).toContain('videos/req-abc-123');
    expect((handle.provider_ref as { request_id: string }).request_id).toBe('req-abc-123');
  });

  it('poll video pending', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'pending' }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });
    const handle = {
      provider_id: 'xai', model_id: 'grok-imagine-video', capability: 'text2video' as const,
      provider_ref: { request_id: 'req-1' }, poll_url: 'https://api.x.ai/v1/videos/req-1',
      submitted_at: Date.now(),
    };

    const status = await xaiAdapter.poll(handle, ctx);
    expect(status.state).toBe('processing');
  });

  it('poll video done with URL', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        status: 'done',
        video: { url: 'https://imgen.x.ai/video.mp4', duration: 10 },
      }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });
    const handle = {
      provider_id: 'xai', model_id: 'grok-imagine-video', capability: 'text2video' as const,
      provider_ref: { request_id: 'req-1' }, poll_url: 'https://api.x.ai/v1/videos/req-1',
      submitted_at: Date.now(),
    };

    const status = await xaiAdapter.poll(handle, ctx);
    expect(status.state).toBe('succeeded');
    expect(status.outputs).toHaveLength(1);
    expect(status.outputs![0].kind).toBe('video');
    expect(status.outputs![0].data).toBe('https://imgen.x.ai/video.mp4');
    expect(status.outputs![0].expires_at).toBeGreaterThan(Date.now());
    expect(status.outputs![0].duration_s).toBe(10);
  });

  it('poll video failed', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'failed' }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });
    const handle = {
      provider_id: 'xai', model_id: 'grok-imagine-video', capability: 'text2video' as const,
      provider_ref: { request_id: 'req-1' }, poll_url: 'https://api.x.ai/v1/videos/req-1',
      submitted_at: Date.now(),
    };

    const status = await xaiAdapter.poll(handle, ctx);
    expect(status.state).toBe('failed');
  });

  it('poll video expired maps to failed', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'expired' }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });
    const handle = {
      provider_id: 'xai', model_id: 'grok-imagine-video', capability: 'text2video' as const,
      provider_ref: { request_id: 'req-1' }, poll_url: 'https://api.x.ai/v1/videos/req-1',
      submitted_at: Date.now(),
    };

    const status = await xaiAdapter.poll(handle, ctx);
    expect(status.state).toBe('failed');
    expect(status.error).toContain('expired');
  });

  it('poll video done but moderated (no URL)', async () => {
    const mockFetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'done', video: {} }), { status: 200 }),
    );
    const ctx = makeCtx({ fetch: mockFetch as unknown as typeof fetch });
    const handle = {
      provider_id: 'xai', model_id: 'grok-imagine-video', capability: 'text2video' as const,
      provider_ref: { request_id: 'req-1' }, poll_url: 'https://api.x.ai/v1/videos/req-1',
      submitted_at: Date.now(),
    };

    const status = await xaiAdapter.poll(handle, ctx);
    expect(status.state).toBe('failed');
    expect(status.error).toContain('moderated');
  });

  it('poll sync image returns base64', async () => {
    const handle = {
      provider_id: 'xai', model_id: 'grok-imagine-image-2.0', capability: 'text2image' as const,
      provider_ref: { sync: true, images: [{ b64_json: '/9j/base64data' }] },
      submitted_at: Date.now(),
    };

    const status = await xaiAdapter.poll(handle, makeCtx());
    expect(status.state).toBe('succeeded');
    expect(status.outputs![0].source).toBe('base64');
    expect(status.outputs![0].mime).toBe('image/jpeg');
  });

  it('video models have duration param with correct limits', async () => {
    const models = await xaiAdapter.listModels(makeCtx());
    const videoModels = models.filter((m) => m.capabilities.includes('text2video'));
    for (const m of videoModels) {
      expect(m.params.duration).toBeDefined();
      expect(m.params.duration.min).toBe(1);
      expect(m.params.duration.max).toBe(15);
    }
  });
});
