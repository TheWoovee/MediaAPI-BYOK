import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { AdapterContext, GenerateRequest } from '@shared/types';
import { replicateAdapter } from './adapter';

/* ── mock context ───────────────────────────────────────────── */

const mockFetch = vi.fn();

const ctx = {
  providerId: 'replicate',
  credential: 'test-key',
  fetch: mockFetch as unknown as typeof fetch,
  resolveUrl: (p: string) => p,
  uploadTemp: vi.fn(),
  log: vi.fn(),
} satisfies AdapterContext;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/* ── fixtures ───────────────────────────────────────────────── */

const basePrediction = {
  id: 'pred-123',
  urls: {
    get: 'https://api.replicate.com/v1/predictions/pred-123',
    cancel: 'https://api.replicate.com/v1/predictions/pred-123/cancel',
  },
};

const imageReq: GenerateRequest = {
  provider_id: 'replicate',
  model_id: 'black-forest-labs/flux-schnell',
  capability: 'text2image',
  params: { prompt: 'a cat in space', aspect_ratio: '1:1' },
};

const videoReq: GenerateRequest = {
  provider_id: 'replicate',
  model_id: 'google/veo-3.1',
  capability: 'text2video',
  params: { prompt: 'ocean waves' },
};

/* ── tests ──────────────────────────────────────────────────── */

beforeEach(() => {
  mockFetch.mockReset();
});

describe('replicateAdapter', () => {
  describe('submit', () => {
    it('builds correct URL and body for official models', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ ...basePrediction, status: 'starting' }),
      );

      const handle = await replicateAdapter.submit(imageReq, ctx);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        'https://api.replicate.com/v1/models/black-forest-labs/flux-schnell/predictions',
      );
      expect(init.method).toBe('POST');

      const body = JSON.parse(init.body as string) as { input: Record<string, unknown> };
      expect(body.input.prompt).toBe('a cat in space');
      expect(body.input.aspect_ratio).toBe('1:1');

      expect(handle.provider_id).toBe('replicate');
      expect(handle.model_id).toBe('black-forest-labs/flux-schnell');
      expect(handle.poll_url).toBe(basePrediction.urls.get);
    });

    it('sends Prefer: wait header for image models', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ ...basePrediction, status: 'starting' }),
      );

      await replicateAdapter.submit(imageReq, ctx);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Prefer']).toBe('wait=55');
    });

    it('does NOT send Prefer: wait header for video models', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ ...basePrediction, status: 'starting' }),
      );

      await replicateAdapter.submit(videoReq, ctx);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const headers = init.headers as Record<string, string>;
      expect(headers['Prefer']).toBeUndefined();
    });

    it('includes seed in input when provided', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ ...basePrediction, status: 'starting' }),
      );

      await replicateAdapter.submit({ ...imageReq, seed: 42 }, ctx);

      const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      const body = JSON.parse(init.body as string) as { input: Record<string, unknown> };
      expect(body.input.seed).toBe(42);
    });
  });

  describe('poll', () => {
    const handle = {
      provider_id: 'replicate',
      model_id: 'black-forest-labs/flux-schnell',
      capability: 'text2image' as const,
      provider_ref: {
        id: 'pred-123',
        get_url: 'https://api.replicate.com/v1/predictions/pred-123',
        cancel_url: 'https://api.replicate.com/v1/predictions/pred-123/cancel',
      },
      poll_url: 'https://api.replicate.com/v1/predictions/pred-123',
      submitted_at: Date.now(),
    };

    it('maps starting status to queued', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ ...basePrediction, status: 'starting', output: null }),
      );

      const status = await replicateAdapter.poll(handle, ctx);
      expect(status.state).toBe('queued');
    });

    it('maps processing status to processing', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ ...basePrediction, status: 'processing', output: null }),
      );

      const status = await replicateAdapter.poll(handle, ctx);
      expect(status.state).toBe('processing');
    });

    it('maps succeeded status with output', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ...basePrediction,
          status: 'succeeded',
          output: ['https://replicate.delivery/output/abc123.webp'],
        }),
      );

      const status = await replicateAdapter.poll(handle, ctx);
      expect(status.state).toBe('succeeded');
      expect(status.outputs).toHaveLength(1);
      expect(status.outputs![0].kind).toBe('image');
      expect(status.outputs![0].source).toBe('url');
      expect(status.outputs![0].data).toBe(
        'https://replicate.delivery/output/abc123.webp',
      );
    });

    it('maps failed status with error', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ...basePrediction,
          status: 'failed',
          error: 'NSFW content detected',
        }),
      );

      const status = await replicateAdapter.poll(handle, ctx);
      expect(status.state).toBe('failed');
      expect(status.error).toBe('NSFW content detected');
    });

    it('maps canceled status to cancelled', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ ...basePrediction, status: 'canceled', output: null }),
      );

      const status = await replicateAdapter.poll(handle, ctx);
      expect(status.state).toBe('cancelled');
    });

    it('normalizes single URL output', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ...basePrediction,
          status: 'succeeded',
          output: 'https://replicate.delivery/output/single.png',
        }),
      );

      const status = await replicateAdapter.poll(handle, ctx);
      expect(status.outputs).toHaveLength(1);
      expect(status.outputs![0].data).toBe(
        'https://replicate.delivery/output/single.png',
      );
      expect(status.outputs![0].mime).toBe('image/png');
    });

    it('normalizes array of URL outputs', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ...basePrediction,
          status: 'succeeded',
          output: [
            'https://replicate.delivery/output/img1.webp',
            'https://replicate.delivery/output/img2.webp',
          ],
        }),
      );

      const status = await replicateAdapter.poll(handle, ctx);
      expect(status.outputs).toHaveLength(2);
      expect(status.outputs![0].data).toBe(
        'https://replicate.delivery/output/img1.webp',
      );
      expect(status.outputs![1].data).toBe(
        'https://replicate.delivery/output/img2.webp',
      );
    });

    it('handles succeeded with output already present in submit response', async () => {
      // Simulate a prediction that already completed (via Prefer: wait)
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ...basePrediction,
          status: 'succeeded',
          output: ['https://replicate.delivery/output/instant.webp'],
        }),
      );

      const status = await replicateAdapter.poll(handle, ctx);
      expect(status.state).toBe('succeeded');
      expect(status.outputs).toHaveLength(1);
    });

    it('sets expires_at to approximately 1 hour', async () => {
      const before = Date.now();
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ...basePrediction,
          status: 'succeeded',
          output: ['https://replicate.delivery/output/test.webp'],
        }),
      );

      const status = await replicateAdapter.poll(handle, ctx);
      const after = Date.now();

      const expiresAt = status.outputs![0].expires_at!;
      // expires_at should be ~1h from now (within a small tolerance)
      expect(expiresAt).toBeGreaterThanOrEqual(before + 3_600_000);
      expect(expiresAt).toBeLessThanOrEqual(after + 3_600_000);
    });

    it('detects video output for video capabilities', async () => {
      const videoHandle = { ...handle, capability: 'text2video' as const };
      mockFetch.mockResolvedValueOnce(
        jsonResponse({
          ...basePrediction,
          status: 'succeeded',
          output: 'https://replicate.delivery/output/clip.mp4',
        }),
      );

      const status = await replicateAdapter.poll(videoHandle, ctx);
      expect(status.outputs![0].kind).toBe('video');
      expect(status.outputs![0].mime).toBe('video/mp4');
    });
  });

  describe('cancel', () => {
    it('sends POST to cancel URL', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ status: 'canceled' }));

      const handle = {
        provider_id: 'replicate',
        model_id: 'black-forest-labs/flux-schnell',
        capability: 'text2image' as const,
        provider_ref: {
          id: 'pred-123',
          get_url: 'https://api.replicate.com/v1/predictions/pred-123',
          cancel_url: 'https://api.replicate.com/v1/predictions/pred-123/cancel',
        },
        submitted_at: Date.now(),
      };

      await replicateAdapter.cancel!(handle, ctx);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, init] = mockFetch.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(
        'https://api.replicate.com/v1/predictions/pred-123/cancel',
      );
      expect(init.method).toBe('POST');
    });
  });

  describe('testCredential', () => {
    it('hits /v1/account and returns ok on success', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ username: 'testuser', type: 'user' }),
      );

      const result = await replicateAdapter.testCredential!(ctx);

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url] = mockFetch.mock.calls[0] as [string];
      expect(url).toBe('https://api.replicate.com/v1/account');
      expect(result.ok).toBe(true);
      expect(result.message).toContain('testuser');
    });

    it('returns not ok for 401', async () => {
      mockFetch.mockResolvedValueOnce(
        jsonResponse({ detail: 'Unauthorized' }, 401),
      );

      const result = await replicateAdapter.testCredential!(ctx);
      expect(result.ok).toBe(false);
      expect(result.message).toBe('Invalid API token');
    });
  });

  describe('listModels', () => {
    it('returns the static model catalog', async () => {
      const models = await replicateAdapter.listModels(ctx);
      expect(models.length).toBeGreaterThan(0);
      expect(models.every((m) => m.provider_id === 'replicate')).toBe(true);
      expect(models.every((m) => m.params.prompt !== undefined)).toBe(true);
    });
  });
});
