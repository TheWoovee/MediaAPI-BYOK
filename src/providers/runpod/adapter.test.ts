import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdapterContext, GenerateRequest, JobHandle } from '@shared/types';
import { runpodAdapter } from './adapter';

/* ── helpers ─────────────────────────────────────────────────── */

function makeCtx(overrides: Partial<AdapterContext> = {}): AdapterContext {
  return {
    providerId: 'runpod',
    fetch: vi.fn() as unknown as typeof fetch,
    resolveUrl: (p: string) => p,
    uploadTemp: vi.fn(async () => 'https://tmp.example.com/upload'),
    log: vi.fn(),
    ...overrides,
  };
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function makeHandle(overrides: Partial<JobHandle> = {}): JobHandle {
  return {
    provider_id: 'runpod',
    model_id: 'black-forest-labs-flux-1-dev',
    capability: 'text2image',
    provider_ref: {
      endpoint_slug: 'black-forest-labs-flux-1-dev',
      job_id: 'test-job-123',
    },
    submitted_at: Date.now(),
    ...overrides,
  };
}

/* ── submit ──────────────────────────────────────────────────── */

describe('runpodAdapter.submit', () => {
  it('builds correct /run request for a public endpoint', async () => {
    const ctx = makeCtx();
    const fetchMock = ctx.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(okJson({ id: 'job-1', status: 'IN_QUEUE' }));

    const req: GenerateRequest = {
      provider_id: 'runpod',
      model_id: 'black-forest-labs-flux-1-dev',
      capability: 'text2image',
      params: { prompt: 'a cat', width: 1024, height: 1024 },
    };

    const handle = await runpodAdapter.submit(req, ctx);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.runpod.ai/v2/black-forest-labs-flux-1-dev/run');
    expect(init.method).toBe('POST');

    const body = JSON.parse(init.body as string) as { input: Record<string, unknown> };
    expect(body.input.prompt).toBe('a cat');
    expect(body.input.width).toBe(1024);
    expect(body.input.height).toBe(1024);

    expect(handle.provider_ref).toEqual({
      endpoint_slug: 'black-forest-labs-flux-1-dev',
      job_id: 'job-1',
    });
  });

  it('uses custom endpoint_id for the custom model', async () => {
    const ctx = makeCtx();
    const fetchMock = ctx.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(okJson({ id: 'job-2', status: 'IN_QUEUE' }));

    const req: GenerateRequest = {
      provider_id: 'runpod',
      model_id: 'runpod-custom-endpoint',
      capability: 'text2image',
      params: {
        endpoint_id: 'my-custom-ep',
        input_json: '{"prompt":"a dog","steps":20}',
      },
    };

    const handle = await runpodAdapter.submit(req, ctx);

    const [url, init] = (ctx.fetch as ReturnType<typeof vi.fn>).mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.runpod.ai/v2/my-custom-ep/run');

    const body = JSON.parse(init.body as string) as { input: Record<string, unknown> };
    expect(body.input.prompt).toBe('a dog');
    expect(body.input.steps).toBe(20);

    expect(handle.provider_ref).toEqual({
      endpoint_slug: 'my-custom-ep',
      job_id: 'job-2',
    });
  });

  it('sends correct input format for text2image', async () => {
    const ctx = makeCtx();
    const fetchMock = ctx.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(okJson({ id: 'job-3', status: 'IN_QUEUE' }));

    const req: GenerateRequest = {
      provider_id: 'runpod',
      model_id: 'black-forest-labs-flux-1-schnell',
      capability: 'text2image',
      params: {
        prompt: 'mountains at sunset',
        width: 512,
        height: 768,
        num_inference_steps: 4,
        seed: 42,
      },
    };

    await runpodAdapter.submit(req, ctx);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string) as { input: Record<string, unknown> };
    expect(body.input).toEqual({
      prompt: 'mountains at sunset',
      width: 512,
      height: 768,
      num_inference_steps: 4,
      seed: 42,
    });
  });

  it('throws on missing endpoint_id for custom model', async () => {
    const ctx = makeCtx();
    const req: GenerateRequest = {
      provider_id: 'runpod',
      model_id: 'runpod-custom-endpoint',
      capability: 'text2image',
      params: { input_json: '{}' },
    };

    await expect(runpodAdapter.submit(req, ctx)).rejects.toThrow('endpoint_id is required');
  });

  it('throws on invalid JSON for custom model', async () => {
    const ctx = makeCtx();
    const req: GenerateRequest = {
      provider_id: 'runpod',
      model_id: 'runpod-custom-endpoint',
      capability: 'text2image',
      params: { endpoint_id: 'ep-1', input_json: 'not json' },
    };

    await expect(runpodAdapter.submit(req, ctx)).rejects.toThrow('input_json must be valid JSON');
  });
});

/* ── poll ─────────────────────────────────────────────────────── */

describe('runpodAdapter.poll', () => {
  let ctx: AdapterContext;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    ctx = makeCtx();
    fetchMock = ctx.fetch as ReturnType<typeof vi.fn>;
  });

  it('maps IN_QUEUE to queued', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ status: 'IN_QUEUE' }));
    const result = await runpodAdapter.poll(makeHandle(), ctx);
    expect(result.state).toBe('queued');
  });

  it('maps IN_PROGRESS to processing', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ status: 'IN_PROGRESS' }));
    const result = await runpodAdapter.poll(makeHandle(), ctx);
    expect(result.state).toBe('processing');
  });

  it('maps RUNNING to processing', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ status: 'RUNNING' }));
    const result = await runpodAdapter.poll(makeHandle(), ctx);
    expect(result.state).toBe('processing');
  });

  it('maps COMPLETED with image_url to succeeded output', async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({
        status: 'COMPLETED',
        output: { image_url: 'https://image.runpod.ai/abc.png' },
      }),
    );

    const result = await runpodAdapter.poll(makeHandle(), ctx);
    expect(result.state).toBe('succeeded');
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs![0].source).toBe('url');
    expect(result.outputs![0].data).toBe('https://image.runpod.ai/abc.png');
    expect(result.outputs![0].kind).toBe('image');
    expect(result.outputs![0].mime).toBe('image/png');
    expect(result.outputs![0].expires_at).toBeGreaterThan(Date.now());
  });

  it('normalizes public endpoint video output', async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({
        status: 'COMPLETED',
        output: { video_url: 'https://image.runpod.ai/vid.mp4' },
      }),
    );

    const result = await runpodAdapter.poll(makeHandle(), ctx);
    expect(result.state).toBe('succeeded');
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs![0].kind).toBe('video');
    expect(result.outputs![0].mime).toBe('video/mp4');
  });

  it('normalizes base64 output from worker-sdxl shape', async () => {
    const b64 = 'iVBORw0KGgoAAAANSUhEUg==';
    fetchMock.mockResolvedValueOnce(
      okJson({
        status: 'COMPLETED',
        output: {
          images: [`data:image/png;base64,${b64}`],
        },
      }),
    );

    const result = await runpodAdapter.poll(makeHandle(), ctx);
    expect(result.state).toBe('succeeded');
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs![0].source).toBe('base64');
    expect(result.outputs![0].mime).toBe('image/png');
    expect(result.outputs![0].data).toBe(b64);
  });

  it('normalizes plain string URL output', async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({
        status: 'COMPLETED',
        output: 'https://cdn.example.com/result.jpg',
      }),
    );

    const result = await runpodAdapter.poll(makeHandle(), ctx);
    expect(result.state).toBe('succeeded');
    expect(result.outputs).toHaveLength(1);
    expect(result.outputs![0].source).toBe('url');
    expect(result.outputs![0].data).toBe('https://cdn.example.com/result.jpg');
  });

  it('maps FAILED to failed with error', async () => {
    fetchMock.mockResolvedValueOnce(
      okJson({ status: 'FAILED', error: 'GPU OOM' }),
    );

    const result = await runpodAdapter.poll(makeHandle(), ctx);
    expect(result.state).toBe('failed');
    expect(result.error).toBe('GPU OOM');
  });

  it('maps FAILED without error message', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ status: 'FAILED' }));
    const result = await runpodAdapter.poll(makeHandle(), ctx);
    expect(result.state).toBe('failed');
    expect(result.error).toBe('Job failed');
  });

  it('maps CANCELLED to cancelled', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ status: 'CANCELLED' }));
    const result = await runpodAdapter.poll(makeHandle(), ctx);
    expect(result.state).toBe('cancelled');
  });

  it('maps TIMED_OUT to failed', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ status: 'TIMED_OUT' }));
    const result = await runpodAdapter.poll(makeHandle(), ctx);
    expect(result.state).toBe('failed');
    expect(result.error).toBe('Job timed out');
  });

  it('handles error in poll HTTP response', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));
    const result = await runpodAdapter.poll(makeHandle(), ctx);
    expect(result.state).toBe('failed');
    expect(result.error).toContain('500');
  });

  it('handles unknown status gracefully', async () => {
    fetchMock.mockResolvedValueOnce(okJson({ status: 'WARMING_UP' }));
    const result = await runpodAdapter.poll(makeHandle(), ctx);
    expect(result.state).toBe('processing');
    expect(result.message).toContain('WARMING_UP');
  });
});

/* ── cancel ───────────────────────────────────────────────────── */

describe('runpodAdapter.cancel', () => {
  it('sends POST to correct cancel URL', async () => {
    const ctx = makeCtx();
    const fetchMock = ctx.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));

    const handle = makeHandle();
    await runpodAdapter.cancel!(handle, ctx);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      'https://api.runpod.ai/v2/black-forest-labs-flux-1-dev/cancel/test-job-123',
    );
    expect(init.method).toBe('POST');
  });

  it('throws on cancel failure', async () => {
    const ctx = makeCtx();
    const fetchMock = ctx.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response('Not Found', { status: 404 }));

    await expect(runpodAdapter.cancel!(makeHandle(), ctx)).rejects.toThrow('RunPod cancel failed');
  });
});

/* ── testCredential ───────────────────────────────────────────── */

describe('runpodAdapter.testCredential', () => {
  it('calls /health on the schnell endpoint', async () => {
    const ctx = makeCtx();
    const fetchMock = ctx.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response('', { status: 200 }));

    const result = await runpodAdapter.testCredential!(ctx);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toBe(
      'https://api.runpod.ai/v2/black-forest-labs-flux-1-schnell/health',
    );
    expect(result.ok).toBe(true);
  });

  it('returns not-ok on 401', async () => {
    const ctx = makeCtx();
    const fetchMock = ctx.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response('', { status: 401 }));

    const result = await runpodAdapter.testCredential!(ctx);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Invalid');
  });

  it('returns not-ok on unexpected status', async () => {
    const ctx = makeCtx();
    const fetchMock = ctx.fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValueOnce(new Response('', { status: 500 }));

    const result = await runpodAdapter.testCredential!(ctx);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('500');
  });
});

/* ── payload cap awareness ────────────────────────────────────── */

describe('payload cap', () => {
  it('documents the 10 MB limit - uploadTemp is available for large blobs', () => {
    // RunPod /run endpoint has a 10 MB payload limit.
    // For base64-encoded image inputs exceeding ~7 MB,
    // use ctx.uploadTemp(blob) to get a URL instead of sending inline.
    // This test documents that awareness; actual enforcement depends
    // on the caller providing images within the limit or as URLs.
    const ctx = makeCtx();
    expect(typeof ctx.uploadTemp).toBe('function');
  });
});

/* ── listModels ───────────────────────────────────────────────── */

describe('runpodAdapter.listModels', () => {
  it('returns the static model list', async () => {
    const ctx = makeCtx();
    const models = await runpodAdapter.listModels(ctx);
    expect(models.length).toBeGreaterThanOrEqual(4);

    const ids = models.map((m) => m.id);
    expect(ids).toContain('black-forest-labs-flux-1-dev');
    expect(ids).toContain('black-forest-labs-flux-1-schnell');
    expect(ids).toContain('black-forest-labs-flux-1-kontext-dev');
    expect(ids).toContain('runpod-custom-endpoint');
  });
});
