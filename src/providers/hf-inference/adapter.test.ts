import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdapterContext, GenerateRequest } from '@shared/types';
import { hfInferenceAdapter } from './adapter';

/** Minimal AdapterContext stub for testing. */
function makeCtx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    providerId: 'hf-inference',
    fetch: vi.fn() as unknown as typeof fetch,
    resolveUrl: (p: string) => `https://router.huggingface.co/${p.replace(/^\//, '')}`,
    uploadTemp: vi.fn().mockResolvedValue('https://tmp/upload'),
    log: vi.fn(),
    ...overrides,
  };
}

describe('hfInferenceAdapter', () => {
  describe('listModels', () => {
    it('returns the static model catalogue', async () => {
      const ctx = makeCtx();
      const list = await hfInferenceAdapter.listModels(ctx);
      expect(list.length).toBeGreaterThanOrEqual(6);
      expect(list.every((m) => m.provider_id === 'hf-inference')).toBe(true);
    });
  });

  describe('submit - fal-ai queue (FLUX.1-dev)', () => {
    let ctx: AdapterContext;
    const falQueueResponse = {
      request_id: 'req-abc',
      response_url: 'https://queue.fal.run/fal-ai/flux/dev/requests/req-abc',
      status_url: 'https://queue.fal.run/fal-ai/flux/dev/requests/req-abc/status',
    };

    beforeEach(() => {
      ctx = makeCtx({
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve(falQueueResponse),
        }) as unknown as typeof fetch,
      });
    });

    it('POSTs to the correct fal-ai queue URL', async () => {
      const req: GenerateRequest = {
        provider_id: 'hf-inference',
        model_id: 'black-forest-labs/FLUX.1-dev',
        capability: 'text2image',
        params: { prompt: 'a cat', width: 512, height: 512 },
      };

      await hfInferenceAdapter.submit(req, ctx);

      const fetchMock = ctx.fetch as ReturnType<typeof vi.fn>;
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://router.huggingface.co/fal-ai/flux/dev?_subdomain=queue');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body as string);
      expect(body.prompt).toBe('a cat');
      expect(body.image_size).toEqual({ width: 512, height: 512 });
    });

    it('returns a JobHandle with fal-queue ref', async () => {
      const req: GenerateRequest = {
        provider_id: 'hf-inference',
        model_id: 'black-forest-labs/FLUX.1-dev',
        capability: 'text2image',
        params: { prompt: 'a cat' },
      };

      const handle = await hfInferenceAdapter.submit(req, ctx);
      expect(handle.provider_id).toBe('hf-inference');
      expect(handle.model_id).toBe('black-forest-labs/FLUX.1-dev');
      expect(handle.capability).toBe('text2image');
      expect((handle.provider_ref as { kind: string }).kind).toBe('fal-queue');
      expect(handle.poll_url).toContain('router.huggingface.co/fal-ai');
    });
  });

  describe('submit - hf-inference native (SD3)', () => {
    let ctx: AdapterContext;

    beforeEach(() => {
      // Simulate raw image bytes response
      const fakeBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]); // PNG magic bytes
      ctx = makeCtx({
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          headers: new Map([['content-type', 'image/png']]) as unknown as Headers,
          arrayBuffer: () => Promise.resolve(fakeBytes.buffer),
        }) as unknown as typeof fetch,
      });
    });

    it('POSTs to the correct hf-inference native URL', async () => {
      const req: GenerateRequest = {
        provider_id: 'hf-inference',
        model_id: 'stabilityai/stable-diffusion-3-medium-diffusers',
        capability: 'text2image',
        params: { prompt: 'a dog', guidance_scale: 7, num_inference_steps: 20 },
      };

      await hfInferenceAdapter.submit(req, ctx);

      const fetchMock = ctx.fetch as ReturnType<typeof vi.fn>;
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://router.huggingface.co/hf-inference/models/stabilityai/stable-diffusion-3-medium-diffusers');
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body as string);
      expect(body.inputs).toBe('a dog');
      expect(body.parameters.guidance_scale).toBe(7);
      expect(body.parameters.num_inference_steps).toBe(20);
    });

    it('returns a sync-bytes JobHandle', async () => {
      const req: GenerateRequest = {
        provider_id: 'hf-inference',
        model_id: 'stabilityai/stable-diffusion-3-medium-diffusers',
        capability: 'text2image',
        params: { prompt: 'a dog' },
      };

      const handle = await hfInferenceAdapter.submit(req, ctx);
      expect((handle.provider_ref as { kind: string }).kind).toBe('sync-bytes');
      expect((handle.provider_ref as { mime: string }).mime).toBe('image/png');
    });
  });

  describe('poll - fal queue statuses', () => {
    it('maps IN_QUEUE to queued', async () => {
      const ctx = makeCtx({
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ status: 'IN_QUEUE', queue_position: 3 }),
        }) as unknown as typeof fetch,
      });

      const handle = {
        provider_id: 'hf-inference',
        model_id: 'black-forest-labs/FLUX.1-dev',
        capability: 'text2image' as const,
        provider_ref: {
          kind: 'fal-queue' as const,
          requestId: 'req-1',
          statusPathname: '/fal-ai/flux/dev/requests/req-1/status',
          resultPathname: '/fal-ai/flux/dev/requests/req-1',
        },
        submitted_at: Date.now(),
      };

      const status = await hfInferenceAdapter.poll(handle, ctx);
      expect(status.state).toBe('queued');
      expect(status.message).toContain('3');
    });

    it('maps IN_PROGRESS to processing', async () => {
      const ctx = makeCtx({
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ status: 'IN_PROGRESS' }),
        }) as unknown as typeof fetch,
      });

      const handle = {
        provider_id: 'hf-inference',
        model_id: 'black-forest-labs/FLUX.1-dev',
        capability: 'text2image' as const,
        provider_ref: {
          kind: 'fal-queue' as const,
          requestId: 'req-1',
          statusPathname: '/fal-ai/flux/dev/requests/req-1/status',
          resultPathname: '/fal-ai/flux/dev/requests/req-1',
        },
        submitted_at: Date.now(),
      };

      const status = await hfInferenceAdapter.poll(handle, ctx);
      expect(status.state).toBe('processing');
    });

    it('maps COMPLETED to succeeded and normalizes image outputs', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'COMPLETED' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              images: [
                { url: 'https://fal.media/out/abc.png', width: 1024, height: 1024, content_type: 'image/png' },
              ],
              seed: 42,
            }),
        });

      const ctx = makeCtx({ fetch: fetchMock as unknown as typeof fetch });

      const handle = {
        provider_id: 'hf-inference',
        model_id: 'black-forest-labs/FLUX.1-dev',
        capability: 'text2image' as const,
        provider_ref: {
          kind: 'fal-queue' as const,
          requestId: 'req-1',
          statusPathname: '/fal-ai/flux/dev/requests/req-1/status',
          resultPathname: '/fal-ai/flux/dev/requests/req-1',
        },
        submitted_at: Date.now(),
      };

      const status = await hfInferenceAdapter.poll(handle, ctx);
      expect(status.state).toBe('succeeded');
      expect(status.outputs).toHaveLength(1);
      expect(status.outputs![0].kind).toBe('image');
      expect(status.outputs![0].source).toBe('url');
      expect(status.outputs![0].data).toBe('https://fal.media/out/abc.png');
      expect(status.outputs![0].width).toBe(1024);
      expect(status.outputs![0].seed).toBe(42);
    });

    it('maps COMPLETED with video output for text2video', async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ status: 'COMPLETED' }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () =>
            Promise.resolve({
              video: { url: 'https://fal.media/out/vid.mp4', content_type: 'video/mp4' },
              seed: 7,
            }),
        });

      const ctx = makeCtx({ fetch: fetchMock as unknown as typeof fetch });

      const handle = {
        provider_id: 'hf-inference',
        model_id: 'Wan-AI/Wan2.2-TI2V-5B',
        capability: 'text2video' as const,
        provider_ref: {
          kind: 'fal-queue' as const,
          requestId: 'req-2',
          statusPathname: '/fal-ai/wan/v2.2-5b/text-to-video/requests/req-2/status',
          resultPathname: '/fal-ai/wan/v2.2-5b/text-to-video/requests/req-2',
        },
        submitted_at: Date.now(),
      };

      const status = await hfInferenceAdapter.poll(handle, ctx);
      expect(status.state).toBe('succeeded');
      expect(status.outputs).toHaveLength(1);
      expect(status.outputs![0].kind).toBe('video');
      expect(status.outputs![0].data).toBe('https://fal.media/out/vid.mp4');
    });

    it('maps FAILED to failed', async () => {
      const ctx = makeCtx({
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          json: () => Promise.resolve({ status: 'FAILED' }),
        }) as unknown as typeof fetch,
      });

      const handle = {
        provider_id: 'hf-inference',
        model_id: 'black-forest-labs/FLUX.1-dev',
        capability: 'text2image' as const,
        provider_ref: {
          kind: 'fal-queue' as const,
          requestId: 'req-1',
          statusPathname: '/fal-ai/flux/dev/requests/req-1/status',
          resultPathname: '/fal-ai/flux/dev/requests/req-1',
        },
        submitted_at: Date.now(),
      };

      const status = await hfInferenceAdapter.poll(handle, ctx);
      expect(status.state).toBe('failed');
    });
  });

  describe('poll - sync jobs', () => {
    it('returns stored result immediately for sync-bytes ref', async () => {
      const ctx = makeCtx();
      const handle = {
        provider_id: 'hf-inference',
        model_id: 'stabilityai/stable-diffusion-3-medium-diffusers',
        capability: 'text2image' as const,
        provider_ref: {
          kind: 'sync-bytes' as const,
          mime: 'image/png',
          base64: 'iVBORw0KGgo=',
        },
        submitted_at: Date.now(),
      };

      const status = await hfInferenceAdapter.poll(handle, ctx);
      expect(status.state).toBe('succeeded');
      expect(status.outputs).toHaveLength(1);
      expect(status.outputs![0].kind).toBe('image');
      expect(status.outputs![0].source).toBe('base64');
      expect(status.outputs![0].data).toBe('iVBORw0KGgo=');

      // fetch should not have been called for sync jobs
      const fetchMock = ctx.fetch as ReturnType<typeof vi.fn>;
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe('testCredential', () => {
    it('returns ok:true when token is valid', async () => {
      const ctx = makeCtx({
        fetch: vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
        }) as unknown as typeof fetch,
      });

      const result = await hfInferenceAdapter.testCredential!(ctx);
      expect(result.ok).toBe(true);
    });

    it('returns ok:false on 401', async () => {
      const ctx = makeCtx({
        fetch: vi.fn().mockResolvedValue({
          ok: false,
          status: 401,
        }) as unknown as typeof fetch,
      });

      const result = await hfInferenceAdapter.testCredential!(ctx);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Invalid');
    });

    it('returns ok:false on network error', async () => {
      const ctx = makeCtx({
        fetch: vi.fn().mockRejectedValue(new Error('Network timeout')) as unknown as typeof fetch,
      });

      const result = await hfInferenceAdapter.testCredential!(ctx);
      expect(result.ok).toBe(false);
      expect(result.message).toContain('Network timeout');
    });
  });
});
