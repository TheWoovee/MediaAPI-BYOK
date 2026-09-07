import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdapterContext, GenerateRequest, JobHandle } from '@shared/types';
import { falAdapter } from './adapter';

/* ------------------------------------------------------------------ */
/*  Shared mock context                                                */
/* ------------------------------------------------------------------ */

const mockFetch = vi.fn();

const ctx = {
  providerId: 'fal',
  credential: 'test-key',
  fetch: mockFetch as unknown as typeof fetch,
  resolveUrl: (p: string) => p,
  uploadTemp: vi.fn(),
  log: vi.fn(),
} satisfies AdapterContext;

/* ------------------------------------------------------------------ */
/*  Fixtures                                                           */
/* ------------------------------------------------------------------ */

const queueResponse = {
  request_id: 'req_abc123',
  status_url: 'https://queue.fal.run/fal-ai/flux/dev/requests/req_abc123/status',
  response_url: 'https://queue.fal.run/fal-ai/flux/dev/requests/req_abc123',
  cancel_url: 'https://queue.fal.run/fal-ai/flux/dev/requests/req_abc123/cancel',
};

const imageResult = {
  images: [
    { url: 'https://fal.media/files/img/output_abc.png', width: 1024, height: 768, content_type: 'image/png' },
    { url: 'https://fal.media/files/img/output_def.png', width: 1024, height: 768, content_type: 'image/png' },
  ],
  seed: 42,
};

const videoResult = {
  video: { url: 'https://fal.media/files/vid/output_xyz.mp4', content_type: 'video/mp4' },
  seed: 99,
};

function makeResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/* ------------------------------------------------------------------ */
/*  Tests                                                              */
/* ------------------------------------------------------------------ */

beforeEach(() => {
  mockFetch.mockReset();
});

describe('falAdapter.spec', () => {
  it('has correct provider id and label', () => {
    expect(falAdapter.spec.id).toBe('fal');
    expect(falAdapter.spec.label).toBe('fal.ai');
  });
});

describe('falAdapter.listModels', () => {
  it('returns curated models', async () => {
    // Live fetch fails, so static list returned
    mockFetch.mockRejectedValueOnce(new Error('network'));
    const models = await falAdapter.listModels(ctx);
    expect(models.length).toBeGreaterThan(0);
    expect(models.every((m) => m.provider_id === 'fal')).toBe(true);
    const ids = models.map((m) => m.id);
    expect(ids).toContain('fal-ai/flux/schnell');
    expect(ids).toContain('fal-ai/veo3');
  });
});

describe('falAdapter.submit', () => {
  it('builds correct request for text2image', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(queueResponse));

    const req: GenerateRequest = {
      provider_id: 'fal',
      model_id: 'fal-ai/flux/dev',
      capability: 'text2image',
      params: { prompt: 'a cat', image_size: 'square_hd', num_inference_steps: 28 },
      seed: 42,
    };

    const handle = await falAdapter.submit(req, ctx);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://queue.fal.run/fal-ai/flux/dev');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string);
    expect(body.prompt).toBe('a cat');
    expect(body.image_size).toBe('square_hd');
    expect(body.num_inference_steps).toBe(28);
    expect(body.seed).toBe(42);

    expect(handle.provider_id).toBe('fal');
    expect(handle.model_id).toBe('fal-ai/flux/dev');
    expect(handle.capability).toBe('text2image');
    expect((handle.provider_ref as { request_id: string }).request_id).toBe('req_abc123');
  });

  it('builds correct request for image2video', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse(queueResponse));

    const req: GenerateRequest = {
      provider_id: 'fal',
      model_id: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video',
      capability: 'image2video',
      params: {
        prompt: 'camera pan right',
        image_url: 'https://example.com/input.jpg',
        duration: '5',
      },
    };

    const handle = await falAdapter.submit(req, ctx);

    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://queue.fal.run/fal-ai/kling-video/v2.5-turbo/pro/image-to-video');

    const body = JSON.parse(init.body as string);
    expect(body.prompt).toBe('camera pan right');
    expect(body.image_url).toBe('https://example.com/input.jpg');
    expect(body.duration).toBe('5');

    expect(handle.capability).toBe('image2video');
  });

  it('throws on submit failure', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ detail: 'Bad request' }, 400));

    const req: GenerateRequest = {
      provider_id: 'fal',
      model_id: 'fal-ai/flux/schnell',
      capability: 'text2image',
      params: { prompt: '' },
    };

    await expect(falAdapter.submit(req, ctx)).rejects.toThrow('fal submit failed (400)');
  });
});

describe('falAdapter.poll', () => {
  const baseHandle: JobHandle = {
    provider_id: 'fal',
    model_id: 'fal-ai/flux/dev',
    capability: 'text2image',
    provider_ref: {
      request_id: 'req_abc123',
      status_url: 'https://queue.fal.run/fal-ai/flux/dev/requests/req_abc123/status',
      response_url: 'https://queue.fal.run/fal-ai/flux/dev/requests/req_abc123',
      cancel_url: 'https://queue.fal.run/fal-ai/flux/dev/requests/req_abc123/cancel',
    },
    submitted_at: Date.now(),
  };

  it('maps IN_QUEUE to queued', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ status: 'IN_QUEUE', queue_position: 3 }));

    const status = await falAdapter.poll(baseHandle, ctx);
    expect(status.state).toBe('queued');
    expect(status.message).toContain('3');
  });

  it('maps IN_PROGRESS to processing', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ status: 'IN_PROGRESS' }));

    const status = await falAdapter.poll(baseHandle, ctx);
    expect(status.state).toBe('processing');
  });

  it('maps COMPLETED with images to succeeded', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse({ status: 'COMPLETED' }))
      .mockResolvedValueOnce(makeResponse(imageResult));

    const status = await falAdapter.poll(baseHandle, ctx);
    expect(status.state).toBe('succeeded');
    expect(status.outputs).toHaveLength(2);
    expect(status.outputs![0].kind).toBe('image');
    expect(status.outputs![0].source).toBe('url');
    expect(status.outputs![0].mime).toBe('image/png');
    expect(status.outputs![0].data).toBe('https://fal.media/files/img/output_abc.png');
    expect(status.outputs![0].width).toBe(1024);
    expect(status.outputs![0].height).toBe(768);
    expect(status.outputs![0].seed).toBe(42);
  });

  it('maps COMPLETED with video to succeeded', async () => {
    const videoHandle = { ...baseHandle, capability: 'text2video' as const };
    mockFetch
      .mockResolvedValueOnce(makeResponse({ status: 'COMPLETED' }))
      .mockResolvedValueOnce(makeResponse(videoResult));

    const status = await falAdapter.poll(videoHandle, ctx);
    expect(status.state).toBe('succeeded');
    expect(status.outputs).toHaveLength(1);
    expect(status.outputs![0].kind).toBe('video');
    expect(status.outputs![0].source).toBe('url');
    expect(status.outputs![0].mime).toBe('video/mp4');
    expect(status.outputs![0].data).toBe('https://fal.media/files/vid/output_xyz.mp4');
    expect(status.outputs![0].seed).toBe(99);
  });

  it('returns failed for HTTP error on status check', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ detail: 'Not found' }, 404));

    const status = await falAdapter.poll(baseHandle, ctx);
    expect(status.state).toBe('failed');
    expect(status.error).toContain('404');
  });

  it('returns failed for HTTP error on result fetch', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse({ status: 'COMPLETED' }))
      .mockResolvedValueOnce(makeResponse({ detail: 'Gone' }, 410));

    const status = await falAdapter.poll(baseHandle, ctx);
    expect(status.state).toBe('failed');
    expect(status.error).toContain('410');
  });

  it('returns failed for completed with no outputs', async () => {
    mockFetch
      .mockResolvedValueOnce(makeResponse({ status: 'COMPLETED' }))
      .mockResolvedValueOnce(makeResponse({}));

    const status = await falAdapter.poll(baseHandle, ctx);
    expect(status.state).toBe('failed');
    expect(status.error).toContain('no recognized outputs');
  });

  it('returns failed for unknown status', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ status: 'UNKNOWN_STATE' }));

    const status = await falAdapter.poll(baseHandle, ctx);
    expect(status.state).toBe('failed');
    expect(status.error).toContain('UNKNOWN_STATE');
  });
});

describe('falAdapter.cancel', () => {
  it('sends PUT to cancel_url', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ status: 'cancelled' }));

    const handle: JobHandle = {
      provider_id: 'fal',
      model_id: 'fal-ai/flux/dev',
      capability: 'text2image',
      provider_ref: {
        request_id: 'req_abc123',
        status_url: 'https://queue.fal.run/fal-ai/flux/dev/requests/req_abc123/status',
        response_url: 'https://queue.fal.run/fal-ai/flux/dev/requests/req_abc123',
        cancel_url: 'https://queue.fal.run/fal-ai/flux/dev/requests/req_abc123/cancel',
      },
      submitted_at: Date.now(),
    };

    await falAdapter.cancel!(handle, ctx);

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://queue.fal.run/fal-ai/flux/dev/requests/req_abc123/cancel');
    expect(init.method).toBe('PUT');
  });
});

describe('falAdapter.testCredential', () => {
  it('returns ok:true on success', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ models: [] }));

    const result = await falAdapter.testCredential!(ctx);
    expect(result.ok).toBe(true);

    const [url] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.fal.ai/v1/models?limit=1');
  });

  it('returns ok:false on auth failure', async () => {
    mockFetch.mockResolvedValueOnce(makeResponse({ detail: 'Unauthorized' }, 401));

    const result = await falAdapter.testCredential!(ctx);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('401');
  });

  it('returns ok:false on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Connection refused'));

    const result = await falAdapter.testCredential!(ctx);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Connection refused');
  });
});
