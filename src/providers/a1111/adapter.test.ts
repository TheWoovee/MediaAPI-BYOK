import { describe, it, expect, vi } from 'vitest';
import { a1111Adapter } from './adapter';
import type { AdapterContext, GenerateRequest } from '@shared/types';

type FetchMock = ReturnType<typeof vi.fn>;

function makeCtx(fetchImpl: FetchMock): AdapterContext {
  return {
    providerId: 'a1111',
    fetch: fetchImpl as unknown as typeof fetch,
    resolveUrl: (p: string) => p,
    uploadTemp: async () => 'https://example.com/upload',
    log: () => {},
  };
}

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

function parsedBody(fetchMock: FetchMock, callIndex = 0): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls[callIndex] as [unknown, RequestInit];
  return JSON.parse(init.body as string);
}

/** Flushes pending microtasks (the fetch .then() chain) via a macrotask boundary. */
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe('a1111 adapter', () => {
  it('builds a txt2img request with the full request shape', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonRes({ images: [], info: '{}' }));
    const ctx = makeCtx(fetchMock);
    const req: GenerateRequest = {
      provider_id: 'a1111',
      model_id: 'a1111-txt2img',
      capability: 'text2image',
      params: {
        prompt: 'a cat',
        negative_prompt: 'blurry',
        width: 768,
        height: 768,
        steps: 30,
        cfg_scale: 8,
        sampler_name: 'DPM++ 2M',
        scheduler: 'Karras',
        batch_size: 2,
        seed: 42,
        sd_model_checkpoint: 'v1-5-pruned.safetensors [6ce0161689]',
      },
    };

    await a1111Adapter.submit(req, ctx);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/sdapi/v1/txt2img');

    const body = parsedBody(fetchMock);
    expect(body.prompt).toBe('a cat');
    expect(body.negative_prompt).toBe('blurry');
    expect(body.width).toBe(768);
    expect(body.height).toBe(768);
    expect(body.steps).toBe(30);
    expect(body.cfg_scale).toBe(8);
    expect(body.sampler_name).toBe('DPM++ 2M');
    expect(body.scheduler).toBe('Karras');
    expect(body.batch_size).toBe(2);
    expect(body.seed).toBe(42);
    expect((body.override_settings as Record<string, unknown>).sd_model_checkpoint).toBe(
      'v1-5-pruned.safetensors [6ce0161689]'
    );
    // batch_size > 1 should suppress the trailing grid image
    expect((body.override_settings as Record<string, unknown>).return_grid).toBe(false);
    expect(body.override_settings_restore_afterwards).toBe(true);
    expect(body.send_images).toBe(true);
    expect(body.save_images).toBe(false);
    expect(body.enable_hr).toBe(false);
  });

  it('includes hires-fix fields only when enable_hr is set', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonRes({ images: [], info: '{}' }));
    const ctx = makeCtx(fetchMock);
    const req: GenerateRequest = {
      provider_id: 'a1111',
      model_id: 'a1111-txt2img',
      capability: 'text2image',
      params: { prompt: 'a cat', enable_hr: true, hr_scale: 1.5, hr_upscaler: 'R-ESRGAN 4x+', denoising_strength: 0.4 },
    };

    await a1111Adapter.submit(req, ctx);
    const body = parsedBody(fetchMock);
    expect(body.enable_hr).toBe(true);
    expect(body.hr_scale).toBe(1.5);
    expect(body.hr_upscaler).toBe('R-ESRGAN 4x+');
    expect(body.denoising_strength).toBe(0.4);
    expect(body.hr_second_pass_steps).toBe(0);
  });

  it('encodes the init image as base64 for img2img', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonRes({ images: ['abc'], info: '{}' }));
    const ctx = makeCtx(fetchMock);
    const blob = new Blob(['hello']);
    const req: GenerateRequest = {
      provider_id: 'a1111',
      model_id: 'a1111-img2img',
      capability: 'image2image',
      params: { prompt: 'x', image: { blob }, denoising_strength: 0.6 },
    };

    await a1111Adapter.submit(req, ctx);

    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/sdapi/v1/img2img');
    const body = parsedBody(fetchMock);
    expect(body.init_images).toEqual(['aGVsbG8=']); // base64("hello")
    expect(body.denoising_strength).toBe(0.6);
    expect(body.mask).toBeUndefined();
    expect(body.resize_mode).toBe(0);
  });

  it('sends mask fields and a numeric inpainting_fill code for inpaint requests', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonRes({ images: ['abc'], info: '{}' }));
    const ctx = makeCtx(fetchMock);
    const image = new Blob(['img']);
    const mask = new Blob(['msk']);
    const req: GenerateRequest = {
      provider_id: 'a1111',
      model_id: 'a1111-img2img',
      capability: 'inpaint',
      params: {
        prompt: 'x',
        image: { blob: image },
        mask: { blob: mask },
        inpainting_fill: 'latent noise',
        mask_blur: 8,
      },
    };

    await a1111Adapter.submit(req, ctx);
    const body = parsedBody(fetchMock);
    expect(body.mask).toBe('bXNr'); // base64("msk")
    expect(body.inpainting_fill).toBe(2); // 'latent noise' -> 2
    expect(body.mask_blur).toBe(8);
    expect(body.inpaint_full_res).toBe(true);
    expect(body.inpaint_full_res_padding).toBe(0);
    expect(body.inpainting_mask_invert).toBe(0);
  });

  it('builds the upscale request shape', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonRes({ image: 'upscaled', html_info: '' }));
    const ctx = makeCtx(fetchMock);
    const image = new Blob(['pic']);
    const req: GenerateRequest = {
      provider_id: 'a1111',
      model_id: 'a1111-upscale',
      capability: 'upscale',
      params: { image: { blob: image }, upscaler_1: 'R-ESRGAN 4x+', upscaling_resize: 4 },
    };

    await a1111Adapter.submit(req, ctx);
    const [url] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/sdapi/v1/extra-single-image');
    const body = parsedBody(fetchMock);
    expect(body.image).toBe('cGlj'); // base64("pic")
    expect(body.upscaler_1).toBe('R-ESRGAN 4x+');
    expect(body.upscaling_resize).toBe(4);
    expect(body.resize_mode).toBe(0);
    expect(body.show_extras_results).toBe(true);
  });

  it('parses base64 images and the info string into succeeded outputs', async () => {
    const info = JSON.stringify({ seed: 12345, all_seeds: [12345], width: 512, height: 512 });
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonRes({ images: ['iVBORw0KGgo='], parameters: { prompt: 'a cat', steps: 20 }, info }));
    const ctx = makeCtx(fetchMock);
    const req: GenerateRequest = {
      provider_id: 'a1111',
      model_id: 'a1111-txt2img',
      capability: 'text2image',
      params: { prompt: 'a cat' },
    };

    const handle = await a1111Adapter.submit(req, ctx);
    await flush();
    const status = await a1111Adapter.poll(handle, ctx);

    expect(status.state).toBe('succeeded');
    expect(status.outputs).toHaveLength(1);
    expect(status.outputs?.[0]).toMatchObject({
      kind: 'image',
      source: 'base64',
      mime: 'image/png',
      data: 'iVBORw0KGgo=',
      seed: 12345,
      width: 512,
      height: 512,
    });
  });

  it('zips all_seeds by index for multi-image batch responses', async () => {
    const info = JSON.stringify({ seed: 1, all_seeds: [1, 2], width: 512, height: 512 });
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonRes({ images: ['aaa', 'bbb'], info }));
    const ctx = makeCtx(fetchMock);
    const req: GenerateRequest = {
      provider_id: 'a1111',
      model_id: 'a1111-txt2img',
      capability: 'text2image',
      params: { prompt: 'a cat', batch_size: 2 },
    };

    const handle = await a1111Adapter.submit(req, ctx);
    await flush();
    const status = await a1111Adapter.poll(handle, ctx);

    expect(status.outputs?.map((o) => o.seed)).toEqual([1, 2]);
  });

  it('reports processing state with progress/eta from /sdapi/v1/progress while the job is in flight', async () => {
    let resolveGen!: (r: Response) => void;
    const genPromise = new Promise<Response>((resolve) => {
      resolveGen = resolve;
    });
    const fetchMock = vi.fn((url: RequestInfo | URL) => {
      if (String(url).includes('/sdapi/v1/progress')) {
        return Promise.resolve(
          jsonRes({
            progress: 0.4,
            eta_relative: 3.2,
            state: { skipped: false, interrupted: false, job: 'txt2img', sampling_step: 8, sampling_steps: 20 },
            current_image: null,
          })
        );
      }
      return genPromise;
    });
    const ctx = makeCtx(fetchMock);
    const req: GenerateRequest = {
      provider_id: 'a1111',
      model_id: 'a1111-txt2img',
      capability: 'text2image',
      params: { prompt: 'a cat' },
    };

    const handle = await a1111Adapter.submit(req, ctx);
    const status = await a1111Adapter.poll(handle, ctx);

    expect(status.state).toBe('processing');
    expect(status.progress).toBe(0.4);
    expect(status.eta_seconds).toBe(3.2);

    // clean up the still-pending generation promise
    resolveGen(jsonRes({ images: [], info: '{}' }));
  });

  it('surfaces a failed status when the generation request errors', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => jsonRes({ error: 'boom' }, 500));
    const ctx = makeCtx(fetchMock);
    const req: GenerateRequest = {
      provider_id: 'a1111',
      model_id: 'a1111-txt2img',
      capability: 'text2image',
      params: { prompt: 'a cat' },
    };

    const handle = await a1111Adapter.submit(req, ctx);
    await flush();
    const status = await a1111Adapter.poll(handle, ctx);

    expect(status.state).toBe('failed');
    expect(status.error).toContain('500');
  });

  it('cancel posts to /sdapi/v1/interrupt', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/sdapi/v1/interrupt')) return new Response(null, { status: 200 });
      return jsonRes({ images: [], info: '{}' });
    });
    const ctx = makeCtx(fetchMock);
    const req: GenerateRequest = {
      provider_id: 'a1111',
      model_id: 'a1111-txt2img',
      capability: 'text2image',
      params: { prompt: 'a cat' },
    };

    const handle = await a1111Adapter.submit(req, ctx);
    await a1111Adapter.cancel!(handle, ctx);

    const interruptCall = fetchMock.mock.calls.find(([url]) => String(url).includes('/sdapi/v1/interrupt'));
    expect(interruptCall).toBeDefined();
  });

  it('testCredential succeeds when progress and sd-models both respond ok', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      if (String(url).includes('/sdapi/v1/progress')) return jsonRes({ progress: 0, state: {} });
      if (String(url).includes('/sdapi/v1/sd-models')) return jsonRes([]);
      return new Response(null, { status: 404 });
    });
    const ctx = makeCtx(fetchMock);
    const result = await a1111Adapter.testCredential!(ctx);
    expect(result.ok).toBe(true);
    expect(result.message).toContain('connected');
  });

  it('testCredential fails when the API is unreachable', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => new Response(null, { status: 404 }));
    const ctx = makeCtx(fetchMock);
    const result = await a1111Adapter.testCredential!(ctx);
    expect(result.ok).toBe(false);
  });

  it('listModels populates enums from live server data', async () => {
    const sdModels = [
      { title: 'v1-5-pruned.safetensors [6ce0161689]', model_name: 'v1-5-pruned', hash: '6ce0161689' },
      { title: 'sd_xl_base_1.0.safetensors [31e35c80fc]', model_name: 'sd_xl_base_1.0', hash: '31e35c80fc' },
    ];
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('/sd-models')) return jsonRes(sdModels);
      if (u.includes('/samplers')) return jsonRes([{ name: 'Euler a' }, { name: 'DPM++ 2M' }]);
      if (u.includes('/schedulers')) return jsonRes([{ name: 'Automatic' }, { name: 'Karras' }]);
      if (u.includes('/upscalers')) return jsonRes([{ name: 'R-ESRGAN 4x+', scale: 4 }]);
      if (u.includes('/sd-modules')) return new Response(null, { status: 404 }); // stock A1111
      return new Response(null, { status: 404 });
    });
    const ctx = makeCtx(fetchMock);

    const models = await a1111Adapter.listModels(ctx);
    expect(models).toHaveLength(3);
    expect(models.map((m) => m.id).sort()).toEqual(['a1111-img2img', 'a1111-txt2img', 'a1111-upscale'].sort());

    const txt2img = models.find((m) => m.id === 'a1111-txt2img')!;
    expect(txt2img.params.sd_model_checkpoint.type).toBe('enum');
    expect(txt2img.params.sd_model_checkpoint.enum).toContain('v1-5-pruned.safetensors [6ce0161689]');
    expect(txt2img.params.sampler_name.enum).toContain('DPM++ 2M');
    expect(txt2img.params.scheduler.enum).toContain('Karras');

    const upscale = models.find((m) => m.id === 'a1111-upscale')!;
    expect(upscale.params.upscaler_1.enum).toContain('R-ESRGAN 4x+');

    // Not Forge -> no Forge callout in the description
    expect(txt2img.description).not.toContain('Forge backend');
  });

  it('detects a Forge backend via a 200 from /sdapi/v1/sd-modules', async () => {
    const fetchMock = vi.fn(async (url: RequestInfo | URL) => {
      const u = String(url);
      if (u.includes('/sd-modules')) return jsonRes([{ module_name: 'clip_l' }]);
      return jsonRes([]);
    });
    const ctx = makeCtx(fetchMock);

    const models = await a1111Adapter.listModels(ctx);
    const txt2img = models.find((m) => m.id === 'a1111-txt2img')!;
    expect(txt2img.description).toContain('Forge backend');
  });

  it('falls back to static defaults when the server is unreachable', async () => {
    const fetchMock = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) => {
      throw new Error('connection refused');
    });
    const ctx = makeCtx(fetchMock);

    const models = await a1111Adapter.listModels(ctx);
    expect(models).toHaveLength(3);
    const txt2img = models.find((m) => m.id === 'a1111-txt2img')!;
    expect(txt2img.params.sampler_name.enum?.length).toBeGreaterThan(0);
    expect(txt2img.params.sd_model_checkpoint.type).toBe('string');
  });
});
