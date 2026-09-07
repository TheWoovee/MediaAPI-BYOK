import { describe, it, expect, vi } from 'vitest';
import type { AdapterContext, GenerateRequest, JobHandle } from '@shared/types';

import { comfyuiAdapter } from './adapter';
import { CUSTOM_MODEL_ID } from './models';

type FetchMock = ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function makeCtx(fetchImpl: FetchMock): AdapterContext {
  return {
    providerId: 'comfyui',
    fetch: fetchImpl as unknown as typeof fetch,
    resolveUrl: (p: string) => p,
    uploadTemp: async () => 'unused://',
    log: () => {},
  };
}

function pathOf(input: RequestInfo | URL): string {
  const raw = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
  return new URL(raw).pathname.replace(/^\//, '');
}

describe('comfyuiAdapter.submit — workflow param mapping', () => {
  it('patches txt2img template nodes from request params', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      expect(pathOf(input)).toBe('prompt');
      return jsonResponse({ prompt_id: 'abc-123', number: 1, node_errors: {} });
    });
    const ctx = makeCtx(fetchMock);

    const req: GenerateRequest = {
      provider_id: 'comfyui',
      model_id: 'comfyui-txt2img',
      capability: 'text2image',
      params: {
        prompt: 'a red fox in the snow',
        negative_prompt: 'blurry',
        ckpt_name: 'sd_xl_base_1.0.safetensors',
        width: 1024,
        height: 768,
        steps: 30,
        cfg: 7.5,
        sampler_name: 'dpmpp_2m',
        scheduler: 'karras',
        seed: 42,
        batch_size: 2,
      },
    };

    const handle = await comfyuiAdapter.submit(req, ctx);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as [RequestInfo, RequestInit];
    const body = JSON.parse(init.body as string) as { prompt: Record<string, { inputs: Record<string, unknown> }>; client_id: string };

    expect(body.prompt['6'].inputs.text).toBe('a red fox in the snow');
    expect(body.prompt['7'].inputs.text).toBe('blurry');
    expect(body.prompt['4'].inputs.ckpt_name).toBe('sd_xl_base_1.0.safetensors');
    expect(body.prompt['5'].inputs.width).toBe(1024);
    expect(body.prompt['5'].inputs.height).toBe(768);
    expect(body.prompt['5'].inputs.batch_size).toBe(2);
    expect(body.prompt['3'].inputs.steps).toBe(30);
    expect(body.prompt['3'].inputs.cfg).toBe(7.5);
    expect(body.prompt['3'].inputs.sampler_name).toBe('dpmpp_2m');
    expect(body.prompt['3'].inputs.scheduler).toBe('karras');
    expect(body.prompt['3'].inputs.seed).toBe(42);
    expect(typeof body.client_id).toBe('string');

    expect(handle.provider_ref).toEqual({ promptId: 'abc-123', clientId: body.client_id });
  });

  it('randomizes the seed when seed is -1 or omitted', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ prompt_id: 'p1', number: 1, node_errors: {} }));
    const ctx = makeCtx(fetchMock);

    await comfyuiAdapter.submit(
      { provider_id: 'comfyui', model_id: 'comfyui-txt2img', capability: 'text2image', params: { prompt: 'x', seed: -1 } },
      ctx,
    );

    const [, init] = fetchMock.mock.calls[0] as [RequestInfo, RequestInit];
    const body = JSON.parse(init.body as string) as { prompt: Record<string, { inputs: Record<string, unknown> }> };
    const seed = body.prompt['3'].inputs.seed as number;
    expect(Number.isInteger(seed)).toBe(true);
    expect(seed).toBeGreaterThanOrEqual(0);
    expect(seed).toBeLessThan(2 ** 32);
  });

  it('rejects a request for an unknown model_id', async () => {
    const fetchMock = vi.fn();
    const ctx = makeCtx(fetchMock);
    await expect(
      comfyuiAdapter.submit({ provider_id: 'comfyui', model_id: 'not-a-real-model', capability: 'text2image', params: {} }, ctx),
    ).rejects.toThrow(/Unknown ComfyUI model_id/);
  });

  it('surfaces node_errors from a 400 /prompt response', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          error: { type: 'invalid_prompt', message: 'Cannot execute because a node is missing input' },
          node_errors: { '4': { errors: [{ message: 'ckpt_name not found' }] } },
        },
        400,
      ),
    );
    const ctx = makeCtx(fetchMock);

    await expect(
      comfyuiAdapter.submit({ provider_id: 'comfyui', model_id: 'comfyui-txt2img', capability: 'text2image', params: { prompt: 'x' } }, ctx),
    ).rejects.toThrow(/node is missing input/);
  });
});

describe('comfyuiAdapter.submit — upload + prompt sequence', () => {
  it('uploads a MediaInput image before submitting img2img', async () => {
    const calls: string[] = [];
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const path = pathOf(input);
      calls.push(path);
      if (path === 'upload/image') {
        expect(init?.method).toBe('POST');
        expect(init?.body).toBeInstanceOf(FormData);
        const form = init!.body as FormData;
        expect(form.get('image')).toBeInstanceOf(Blob);
        expect(form.get('overwrite')).toBe('true');
        expect(form.get('type')).toBe('input');
        return jsonResponse({ name: 'upload_abc.png', subfolder: '', type: 'input' });
      }
      if (path === 'prompt') {
        return jsonResponse({ prompt_id: 'p2', number: 1, node_errors: {} });
      }
      throw new Error(`unexpected path ${path}`);
    });
    const ctx = makeCtx(fetchMock);

    const req: GenerateRequest = {
      provider_id: 'comfyui',
      model_id: 'comfyui-img2img',
      capability: 'image2image',
      params: {
        prompt: 'make it winter',
        image: { blob: new Blob(['fake-bytes'], { type: 'image/png' }), name: 'input.png' },
        denoise: 0.6,
      },
    };

    await comfyuiAdapter.submit(req, ctx);

    expect(calls).toEqual(['upload/image', 'prompt']);
    const promptCall = fetchMock.mock.calls.find((c) => pathOf(c[0] as RequestInfo) === 'prompt')!;
    const body = JSON.parse((promptCall[1] as RequestInit).body as string) as { prompt: Record<string, { inputs: Record<string, unknown> }> };
    expect(body.prompt['10'].inputs.image).toBe('upload_abc.png');
    expect(body.prompt['3'].inputs.denoise).toBe(0.6);
  });

  it('uses the subfolder-prefixed filename when the upload response has one', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const path = pathOf(input);
      if (path === 'upload/image') return jsonResponse({ name: 'mask.png', subfolder: 'clipspace', type: 'input' });
      return jsonResponse({ prompt_id: 'p3', number: 1, node_errors: {} });
    });
    const ctx = makeCtx(fetchMock);

    const req: GenerateRequest = {
      provider_id: 'comfyui',
      model_id: 'comfyui-inpaint',
      capability: 'inpaint',
      params: {
        prompt: 'x',
        image: { blob: new Blob(['a']) },
        mask: { blob: new Blob(['b']) },
      },
    };
    await comfyuiAdapter.submit(req, ctx);

    const promptCall = fetchMock.mock.calls.find((c) => pathOf(c[0] as RequestInfo) === 'prompt')!;
    const body = JSON.parse((promptCall[1] as RequestInit).body as string) as { prompt: Record<string, { inputs: Record<string, unknown> }> };
    expect(body.prompt['10'].inputs.image).toBe('clipspace/mask.png');
    expect(body.prompt['13'].inputs.image).toBe('clipspace/mask.png');
  });

  it('submits a custom raw workflow_json directly, patching prompt/seed by node id', async () => {
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => jsonResponse({ prompt_id: 'p4', number: 1, node_errors: {} }));
    const ctx = makeCtx(fetchMock);

    const workflow_json = JSON.stringify({
      '1': { inputs: { text: 'placeholder', clip: ['2', 0] }, class_type: 'CLIPTextEncode' },
    });

    await comfyuiAdapter.submit(
      {
        provider_id: 'comfyui',
        model_id: CUSTOM_MODEL_ID,
        capability: 'text2image',
        params: {
          workflow_json,
          prompt: 'a castle at dusk',
          prompt_node_id: '1',
          prompt_input_key: 'text',
        },
      },
      ctx,
    );

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string) as {
      prompt: Record<string, { inputs: Record<string, unknown> }>;
    };
    expect(body.prompt['1'].inputs.text).toBe('a castle at dusk');
  });

  it('rejects a custom workflow submission missing workflow_json', async () => {
    const fetchMock = vi.fn();
    const ctx = makeCtx(fetchMock);
    await expect(
      comfyuiAdapter.submit({ provider_id: 'comfyui', model_id: CUSTOM_MODEL_ID, capability: 'text2image', params: {} }, ctx),
    ).rejects.toThrow(/workflow_json is required/);
  });
});

describe('comfyuiAdapter.poll — history polling and output extraction', () => {
  const handle: JobHandle = {
    provider_id: 'comfyui',
    model_id: 'comfyui-txt2img',
    capability: 'text2image',
    provider_ref: { promptId: 'abc-123', clientId: 'c1' },
    submitted_at: Date.now(),
  };

  it('returns queued/processing while history is empty', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = pathOf(input);
      if (path.startsWith('history/')) return jsonResponse({});
      if (path === 'queue') return jsonResponse({ queue_running: [[0, 'abc-123', {}, {}, []]], queue_pending: [] });
      throw new Error(`unexpected ${path}`);
    });
    const status = await comfyuiAdapter.poll(handle, makeCtx(fetchMock));
    expect(status.state).toBe('processing');
  });

  it('returns queued when the prompt is only in queue_pending', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = pathOf(input);
      if (path.startsWith('history/')) return jsonResponse({});
      if (path === 'queue') return jsonResponse({ queue_running: [], queue_pending: [[0, 'abc-123', {}, {}, []]] });
      throw new Error(`unexpected ${path}`);
    });
    const status = await comfyuiAdapter.poll(handle, makeCtx(fetchMock));
    expect(status.state).toBe('queued');
  });

  it('extracts image outputs (SaveImage) and video outputs (animated flag) from images[]', async () => {
    const history = {
      'abc-123': {
        outputs: {
          '9': { images: [{ filename: 'ComfyUI_00001_.png', subfolder: '', type: 'output' }] },
          '12': { images: [{ filename: 'video/ComfyUI_00001_.mp4', subfolder: 'video', type: 'output' }], animated: [true] },
        },
        status: { status_str: 'success', completed: true, messages: [] },
      },
    };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = pathOf(input);
      if (path.startsWith('history/')) return jsonResponse(history);
      if (path === 'view') {
        return new Response(new Uint8Array([1, 2, 3]).buffer, { status: 200 });
      }
      throw new Error(`unexpected ${path}`);
    });

    const status = await comfyuiAdapter.poll(handle, makeCtx(fetchMock));
    expect(status.state).toBe('succeeded');
    expect(status.outputs).toHaveLength(2);

    const image = status.outputs!.find((o) => o.filename === 'ComfyUI_00001_.png')!;
    expect(image.kind).toBe('image');
    expect(image.mime).toBe('image/png');
    expect(image.source).toBe('bytes');
    expect(image.data).toBeInstanceOf(ArrayBuffer);

    const video = status.outputs!.find((o) => o.filename === 'video/ComfyUI_00001_.mp4')!;
    expect(video.kind).toBe('video');
    expect(video.mime).toBe('video/mp4');
  });

  it('extracts video outputs from gifs[] (VHS VideoCombine)', async () => {
    const history = {
      'abc-456': {
        outputs: {
          '15': {
            gifs: [{ filename: 'AnimateDiff_00001.mp4', subfolder: '', type: 'output', format: 'video/h264-mp4', frame_rate: 8.0 }],
          },
        },
        status: { status_str: 'success', completed: true, messages: [] },
      },
    };
    const gifHandle: JobHandle = { ...handle, provider_ref: { promptId: 'abc-456', clientId: 'c1' } };

    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = pathOf(input);
      if (path.startsWith('history/')) return jsonResponse(history);
      if (path === 'view') return new Response(new Uint8Array([9, 9]).buffer, { status: 200 });
      throw new Error(`unexpected ${path}`);
    });

    const status = await comfyuiAdapter.poll(gifHandle, makeCtx(fetchMock));
    expect(status.state).toBe('succeeded');
    expect(status.outputs).toHaveLength(1);
    expect(status.outputs![0].kind).toBe('video');
    expect(status.outputs![0].mime).toBe('video/mp4');
    expect(status.outputs![0].filename).toBe('AnimateDiff_00001.mp4');
  });

  it('reports a failed job with the execution_error message', async () => {
    const history = {
      'abc-123': {
        outputs: {},
        status: {
          status_str: 'error',
          completed: false,
          messages: [['execution_error', { exception_message: 'CUDA out of memory', node_id: '3', node_type: 'KSampler' }]],
        },
      },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (pathOf(input).startsWith('history/')) return jsonResponse(history);
      throw new Error('unexpected call');
    });
    const status = await comfyuiAdapter.poll(handle, makeCtx(fetchMock));
    expect(status.state).toBe('failed');
    expect(status.error).toBe('CUDA out of memory');
  });

  it('fails cleanly when the job handle has no prompt_id', async () => {
    const fetchMock = vi.fn();
    const badHandle: JobHandle = { ...handle, provider_ref: {} };
    const status = await comfyuiAdapter.poll(badHandle, makeCtx(fetchMock));
    expect(status.state).toBe('failed');
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('comfyuiAdapter.cancel', () => {
  const handle: JobHandle = {
    provider_id: 'comfyui',
    model_id: 'comfyui-txt2img',
    capability: 'text2image',
    provider_ref: { promptId: 'abc-123', clientId: 'c1' },
    submitted_at: Date.now(),
  };

  it('interrupts a running prompt', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const path = pathOf(input);
      if (path === 'queue') return jsonResponse({ queue_running: [[0, 'abc-123', {}, {}, []]], queue_pending: [] });
      if (path === 'interrupt') return jsonResponse({});
      throw new Error(`unexpected call to ${path}`);
    });
    await comfyuiAdapter.cancel!(handle, makeCtx(fetchMock));

    const interruptCall = fetchMock.mock.calls.find((c) => pathOf(c[0] as RequestInfo) === 'interrupt')!;
    const body = JSON.parse((interruptCall[1] as RequestInit).body as string) as { prompt_id: string };
    expect(body.prompt_id).toBe('abc-123');
  });

  it('deletes a pending prompt from the queue', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) => {
      const path = pathOf(input);
      if (path === 'queue') {
        // GET returns queue state; POST deletes. Distinguish by presence of a body.
        return jsonResponse({ queue_running: [], queue_pending: [[0, 'abc-123', {}, {}, []]] });
      }
      throw new Error(`unexpected call to ${path}`);
    });
    await comfyuiAdapter.cancel!(handle, makeCtx(fetchMock));

    const deleteCall = fetchMock.mock.calls.find((c) => (c[1] as RequestInit | undefined)?.method === 'POST')!;
    const body = JSON.parse((deleteCall[1] as RequestInit).body as string) as { delete: string[] };
    expect(body.delete).toEqual(['abc-123']);
  });

  it('does nothing when the prompt is not in the queue at all (already finished)', async () => {
    const fetchMock = vi.fn(async () => jsonResponse({ queue_running: [], queue_pending: [] }));
    await comfyuiAdapter.cancel!(handle, makeCtx(fetchMock));
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the GET /queue check, no interrupt/delete
  });
});

describe('comfyuiAdapter.testCredential', () => {
  it('reports ok with version and GPU name on success', async () => {
    const fetchMock = vi.fn(async () =>
      jsonResponse({
        system: { comfyui_version: '0.3.42', os: 'posix' },
        devices: [{ name: 'NVIDIA GeForce RTX 4090', type: 'cuda', index: 0 }],
      }),
    );
    const result = await comfyuiAdapter.testCredential!(makeCtx(fetchMock));
    expect(result.ok).toBe(true);
    expect(result.message).toContain('0.3.42');
    expect(result.message).toContain('RTX 4090');
  });

  it('reports not-ok on HTTP error (e.g. CORS not enabled)', async () => {
    const fetchMock = vi.fn(async () => new Response('Forbidden', { status: 403 }));
    const result = await comfyuiAdapter.testCredential!(makeCtx(fetchMock));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('403');
  });

  it('reports not-ok on network failure', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('fetch failed');
    });
    const result = await comfyuiAdapter.testCredential!(makeCtx(fetchMock));
    expect(result.ok).toBe(false);
    expect(result.message).toContain('not reachable');
  });
});

describe('comfyuiAdapter.listModels', () => {
  it('returns static fallback options when the server is offline', async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error('connection refused');
    });
    const models = await comfyuiAdapter.listModels(makeCtx(fetchMock));
    const txt2img = models.find((m) => m.id === 'comfyui-txt2img')!;
    expect(txt2img.params.ckpt_name.enum).toEqual([]);
    expect(txt2img.params.sampler_name.enum).toContain('euler');
    expect(models.some((m) => m.id === CUSTOM_MODEL_ID)).toBe(true);
  });

  it('uses dynamic combo values from /object_info when available', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const path = pathOf(input);
      if (path === 'object_info/CheckpointLoaderSimple') {
        return jsonResponse({ CheckpointLoaderSimple: { input: { required: { ckpt_name: [['sd_xl_base_1.0.safetensors']] } } } });
      }
      if (path === 'object_info/KSampler') {
        return jsonResponse({
          KSampler: { input: { required: { sampler_name: [['euler', 'dpmpp_2m']], scheduler: [['normal', 'karras']] } } },
        });
      }
      if (path === 'object_info/UpscaleModelLoader') {
        return jsonResponse({ UpscaleModelLoader: { input: { required: { model_name: [['RealESRGAN_x4plus.pth']] } } } });
      }
      throw new Error(`unexpected ${path}`);
    });
    const models = await comfyuiAdapter.listModels(makeCtx(fetchMock));
    const txt2img = models.find((m) => m.id === 'comfyui-txt2img')!;
    expect(txt2img.params.ckpt_name.enum).toEqual(['sd_xl_base_1.0.safetensors']);
    expect(txt2img.params.sampler_name.enum).toEqual(['euler', 'dpmpp_2m']);
    const upscale = models.find((m) => m.id === 'comfyui-upscale')!;
    expect(upscale.params.model_name.enum).toEqual(['RealESRGAN_x4plus.pth']);
  });
});
