import { describe, it, expect, vi } from 'vitest';
import type { AdapterContext, GenerateRequest, JobHandle } from '@shared/types';
import { hfSpaceAdapter } from './adapter';

function makeMockCtx(mockFetch: ReturnType<typeof vi.fn>): AdapterContext {
  return {
    providerId: 'hf-space',
    credential: 'hf_test_token',
    fetch: mockFetch as unknown as typeof fetch,
    resolveUrl: (p: string) => p,
    uploadTemp: vi.fn(),
    log: vi.fn(),
  } satisfies AdapterContext;
}

function makeRequest(overrides: Partial<GenerateRequest> = {}): GenerateRequest {
  return {
    provider_id: 'hf-space',
    model_id: 'hf-space-custom',
    capability: 'text2image',
    params: {
      space_id: 'black-forest-labs/FLUX.1-schnell',
      api_name: '/infer',
      prompt: 'a beautiful sunset',
    },
    ...overrides,
  };
}

function makeHandle(overrides: Partial<JobHandle> = {}): JobHandle {
  return {
    provider_id: 'hf-space',
    model_id: 'hf-space-custom',
    capability: 'text2image',
    provider_ref: {
      host: 'https://black-forest-labs-flux-1-schnell.hf.space',
      api_name: 'infer',
      event_id: 'abc123',
    },
    submitted_at: Date.now(),
    ...overrides,
  };
}

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function textResponse(text: string, status = 200): Response {
  return new Response(text, {
    status,
    headers: { 'Content-Type': 'text/event-stream' },
  });
}

// ---------------------------------------------------------------------------
// submit
// ---------------------------------------------------------------------------
describe('submit', () => {
  it('resolves Space host correctly', async () => {
    const mockFetch = vi.fn();
    const ctx = makeMockCtx(mockFetch);

    // First call: resolve host
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ host: 'https://black-forest-labs-flux-1-schnell.hf.space' }),
    );
    // Second call: submit prediction
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ event_id: 'evt_001' }),
    );

    await hfSpaceAdapter.submit(makeRequest(), ctx);

    // Verify host resolution call
    const hostCall = mockFetch.mock.calls[0];
    const hostReq = new Request(hostCall[0], hostCall[1]);
    expect(hostReq.url).toBe(
      'https://huggingface.co/api/spaces/black-forest-labs/FLUX.1-schnell/host',
    );
  });

  it('calls /gradio_api/call/{api_name} with correct data', async () => {
    const mockFetch = vi.fn();
    const ctx = makeMockCtx(mockFetch);

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ host: 'https://owner-space.hf.space' }),
    );
    mockFetch.mockResolvedValueOnce(
      jsonResponse({ event_id: 'evt_002' }),
    );

    const req = makeRequest({
      params: {
        space_id: 'owner/my-space',
        api_name: '/generate',
        prompt: 'hello world',
        steps: 20,
      },
    });

    const handle = await hfSpaceAdapter.submit(req, ctx);

    // Verify submit call
    const submitCall = mockFetch.mock.calls[1];
    const submitReq = new Request(submitCall[0], submitCall[1]);
    expect(submitReq.url).toBe(
      'https://owner-space.hf.space/gradio_api/call/generate',
    );
    expect(submitReq.method).toBe('POST');

    const body = (await submitReq.json()) as { data: unknown[] };
    expect(body.data).toEqual(['hello world', 20]);

    // Verify handle
    expect(handle.provider_ref).toEqual({
      host: 'https://owner-space.hf.space',
      api_name: 'generate',
      event_id: 'evt_002',
    });
  });

  it('throws when space_id is missing', async () => {
    const mockFetch = vi.fn();
    const ctx = makeMockCtx(mockFetch);

    const req = makeRequest({ params: { api_name: '/infer' } });
    await expect(hfSpaceAdapter.submit(req, ctx)).rejects.toThrow('space_id is required');
  });

  it('throws when host resolution fails', async () => {
    const mockFetch = vi.fn();
    const ctx = makeMockCtx(mockFetch);

    mockFetch.mockResolvedValueOnce(
      new Response('Not Found', { status: 404 }),
    );

    await expect(hfSpaceAdapter.submit(makeRequest(), ctx)).rejects.toThrow(
      'Failed to resolve Space host',
    );
  });
});

// ---------------------------------------------------------------------------
// poll
// ---------------------------------------------------------------------------
describe('poll', () => {
  it('parses SSE with "event: complete" and normalizes image output', async () => {
    const mockFetch = vi.fn();
    const ctx = makeMockCtx(mockFetch);

    const sse = [
      'event: heartbeat',
      'data: null',
      '',
      'event: complete',
      'data: [{"path": "/tmp/gradio/abc/image.webp", "url": "https://owner-space.hf.space/gradio_api/file=/tmp/gradio/abc/image.webp", "meta": {"_type": "gradio.FileData"}}, 42]',
      '',
    ].join('\n');

    mockFetch.mockResolvedValueOnce(textResponse(sse));

    const status = await hfSpaceAdapter.poll(makeHandle(), ctx);

    expect(status.state).toBe('succeeded');
    expect(status.outputs).toHaveLength(1);
    expect(status.outputs![0]).toEqual({
      kind: 'image',
      source: 'url',
      mime: 'image/webp',
      data: 'https://owner-space.hf.space/gradio_api/file=/tmp/gradio/abc/image.webp',
      filename: 'image.webp',
    });
  });

  it('parses SSE with "event: error" and returns failed state', async () => {
    const mockFetch = vi.fn();
    const ctx = makeMockCtx(mockFetch);

    const sse = [
      'event: error',
      'data: GPU quota exceeded',
      '',
    ].join('\n');

    mockFetch.mockResolvedValueOnce(textResponse(sse));

    const status = await hfSpaceAdapter.poll(makeHandle(), ctx);

    expect(status.state).toBe('failed');
    expect(status.error).toBe('GPU quota exceeded');
  });

  it('handles "event: heartbeat" as processing', async () => {
    const mockFetch = vi.fn();
    const ctx = makeMockCtx(mockFetch);

    const sse = [
      'event: heartbeat',
      'data: null',
      '',
    ].join('\n');

    mockFetch.mockResolvedValueOnce(textResponse(sse));

    const status = await hfSpaceAdapter.poll(makeHandle(), ctx);

    expect(status.state).toBe('processing');
  });

  it('handles "event: generating" as processing', async () => {
    const mockFetch = vi.fn();
    const ctx = makeMockCtx(mockFetch);

    const sse = [
      'event: generating',
      'data: null',
      '',
    ].join('\n');

    mockFetch.mockResolvedValueOnce(textResponse(sse));

    const status = await hfSpaceAdapter.poll(makeHandle(), ctx);

    expect(status.state).toBe('processing');
    expect(status.message).toBe('Generating...');
  });

  it('returns failed when poll request fails', async () => {
    const mockFetch = vi.fn();
    const ctx = makeMockCtx(mockFetch);

    mockFetch.mockResolvedValueOnce(
      new Response('Internal Server Error', { status: 500 }),
    );

    const status = await hfSpaceAdapter.poll(makeHandle(), ctx);

    expect(status.state).toBe('failed');
    expect(status.error).toContain('500');
  });

  it('handles multiple file outputs in complete event', async () => {
    const mockFetch = vi.fn();
    const ctx = makeMockCtx(mockFetch);

    const sse = [
      'event: complete',
      'data: [{"path": "/tmp/a.png", "url": "https://host.hf.space/gradio_api/file=/tmp/a.png"}, {"path": "/tmp/b.mp4", "url": "https://host.hf.space/gradio_api/file=/tmp/b.mp4"}]',
      '',
    ].join('\n');

    mockFetch.mockResolvedValueOnce(textResponse(sse));

    const status = await hfSpaceAdapter.poll(makeHandle(), ctx);

    expect(status.state).toBe('succeeded');
    expect(status.outputs).toHaveLength(2);
    expect(status.outputs![0].mime).toBe('image/png');
    expect(status.outputs![0].kind).toBe('image');
    expect(status.outputs![1].mime).toBe('video/mp4');
    expect(status.outputs![1].kind).toBe('video');
  });

  it('normalizes relative file URLs using host', async () => {
    const mockFetch = vi.fn();
    const ctx = makeMockCtx(mockFetch);

    const sse = [
      'event: complete',
      'data: [{"url": "/gradio_api/file=/tmp/out.png"}]',
      '',
    ].join('\n');

    mockFetch.mockResolvedValueOnce(textResponse(sse));

    const handle = makeHandle({
      provider_ref: {
        host: 'https://my-space.hf.space',
        api_name: 'infer',
        event_id: 'e1',
      },
    });

    const status = await hfSpaceAdapter.poll(handle, ctx);

    expect(status.state).toBe('succeeded');
    expect(status.outputs![0].data).toBe(
      'https://my-space.hf.space/gradio_api/file=/tmp/out.png',
    );
  });
});

// ---------------------------------------------------------------------------
// cancel
// ---------------------------------------------------------------------------
describe('cancel', () => {
  it('sends correct POST to /gradio_api/cancel', async () => {
    const mockFetch = vi.fn();
    const ctx = makeMockCtx(mockFetch);

    mockFetch.mockResolvedValueOnce(new Response('', { status: 200 }));

    await hfSpaceAdapter.cancel!(makeHandle(), ctx);

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const call = mockFetch.mock.calls[0];
    const req = new Request(call[0], call[1]);

    expect(req.url).toBe(
      'https://black-forest-labs-flux-1-schnell.hf.space/gradio_api/cancel',
    );
    expect(req.method).toBe('POST');

    const body = (await req.json()) as Record<string, unknown>;
    expect(body.event_id).toBe('abc123');
    expect(body.session_hash).toBe('');
    expect(body.fn_index).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// testCredential
// ---------------------------------------------------------------------------
describe('testCredential', () => {
  it('calls whoami and returns ok on success', async () => {
    const mockFetch = vi.fn();
    const ctx = makeMockCtx(mockFetch);

    mockFetch.mockResolvedValueOnce(
      jsonResponse({ name: 'test-user' }),
    );

    const result = await hfSpaceAdapter.testCredential!(ctx);

    expect(result.ok).toBe(true);
    expect(result.message).toContain('test-user');

    const call = mockFetch.mock.calls[0];
    const req = new Request(call[0], call[1]);
    expect(req.url).toBe('https://huggingface.co/api/whoami-v2');
  });

  it('returns not-ok when auth fails', async () => {
    const mockFetch = vi.fn();
    const ctx = makeMockCtx(mockFetch);

    mockFetch.mockResolvedValueOnce(
      new Response('Unauthorized', { status: 401 }),
    );

    const result = await hfSpaceAdapter.testCredential!(ctx);

    expect(result.ok).toBe(false);
    expect(result.message).toContain('401');
  });
});

// ---------------------------------------------------------------------------
// listModels
// ---------------------------------------------------------------------------
describe('listModels', () => {
  it('returns the static meta-model', async () => {
    const mockFetch = vi.fn();
    const ctx = makeMockCtx(mockFetch);

    const models = await hfSpaceAdapter.listModels(ctx);

    expect(models).toHaveLength(1);
    expect(models[0].id).toBe('hf-space-custom');
    expect(models[0].provider_id).toBe('hf-space');
    expect(models[0].capabilities).toContain('text2image');
  });
});
