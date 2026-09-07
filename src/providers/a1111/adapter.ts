import type {
  ProviderAdapter,
  ProviderSpec,
  ModelSpec,
  GenerateRequest,
  JobHandle,
  JobStatus,
  AdapterContext,
  Capability,
  MediaInput,
  NormalizedOutput,
} from '@shared/types';
import { getProvider } from '@shared/providers/registry';
import { buildModelSpecs } from './models';

const spec: ProviderSpec = getProvider('a1111')!;

// ---------------------------------------------------------------------------
// In-memory job store.
//
// A1111/Forge's generation endpoints are fully synchronous: the HTTP request
// blocks until the image(s) are ready. JobHandle.provider_ref is serializable
// (it round-trips through JSON/D1), so we can't stash a live Promise there.
// Instead we start the fetch here, keep the in-flight Promise (and its
// eventual outcome) in this module-level map keyed by a generated job id, and
// only put the small, serializable {jobId, endpoint} pair in provider_ref.
// poll() then either reports live progress (via /sdapi/v1/progress) while the
// promise is still in flight, or resolves the stored response once it lands.
// ---------------------------------------------------------------------------

interface A1111JobRef {
  jobId: string;
  endpoint: string;
}

interface PendingJob {
  capability: Capability;
  settled: boolean;
  response?: Response;
  error?: string;
  finalStatus?: JobStatus;
  /** Resolves once the underlying fetch has settled; errors are captured, never rethrown. */
  promise: Promise<void>;
}

const pendingJobs = new Map<string, PendingJob>();

const INPAINT_FILL_CODES: Record<string, number> = {
  fill: 0,
  original: 1,
  'latent noise': 2,
  'latent nothing': 3,
};

async function blobToBase64(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function isMediaInput(v: unknown): v is MediaInput {
  return !!v && typeof v === 'object' && (v as { blob?: unknown }).blob instanceof Blob;
}

async function safeText(res: Response): Promise<string> {
  try {
    return await res.text();
  } catch {
    return '';
  }
}

function num(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function str(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback;
}

function bool(v: unknown, fallback = false): boolean {
  return typeof v === 'boolean' ? v : fallback;
}

// ---------------------------------------------------------------------------
// Request body construction
// ---------------------------------------------------------------------------

interface BaseFields {
  prompt: string;
  negative_prompt: string;
  seed: number;
  sampler_name: string;
  scheduler: string;
  steps: number;
  cfg_scale: number;
  width: number;
  height: number;
  batch_size: number;
  n_iter: number;
  override_settings: Record<string, unknown>;
  override_settings_restore_afterwards: true;
  send_images: true;
  save_images: false;
  distilled_cfg_scale?: number;
}

function buildBaseFields(req: GenerateRequest): BaseFields {
  const p = req.params;
  const overrideSettings: Record<string, unknown> = {};

  const checkpoint = p.sd_model_checkpoint;
  if (typeof checkpoint === 'string' && checkpoint.trim() !== '') {
    overrideSettings.sd_model_checkpoint = checkpoint;
  }

  const batchSize = num(p.batch_size, 1);
  const nIter = num(req.n, 1);
  if (batchSize > 1 || nIter > 1) {
    // Avoid a trailing grid image polluting the output list (A1111 default behavior).
    overrideSettings.return_grid = false;
  }

  const fields: BaseFields = {
    prompt: str(p.prompt),
    negative_prompt: str(p.negative_prompt),
    seed: num(p.seed ?? req.seed, -1),
    sampler_name: str(p.sampler_name, 'Euler a'),
    scheduler: str(p.scheduler, 'Automatic'),
    steps: num(p.steps, 20),
    cfg_scale: num(p.cfg_scale, 7),
    width: num(p.width, 512),
    height: num(p.height, 512),
    batch_size: batchSize,
    n_iter: nIter,
    override_settings: overrideSettings,
    override_settings_restore_afterwards: true,
    send_images: true,
    save_images: false,
  };

  if (typeof p.distilled_cfg_scale === 'number') {
    fields.distilled_cfg_scale = p.distilled_cfg_scale;
  }

  return fields;
}

function buildTxt2ImgBody(req: GenerateRequest): Record<string, unknown> {
  const p = req.params;
  const body: Record<string, unknown> = { ...buildBaseFields(req) };

  if (bool(p.enable_hr)) {
    body.enable_hr = true;
    body.hr_scale = num(p.hr_scale, 2);
    body.hr_upscaler = str(p.hr_upscaler, 'Latent');
    body.hr_second_pass_steps = 0;
    body.denoising_strength = num(p.denoising_strength, 0.7);
  } else {
    body.enable_hr = false;
  }

  return body;
}

async function buildImg2ImgBody(req: GenerateRequest): Promise<Record<string, unknown>> {
  const p = req.params;
  const body: Record<string, unknown> = {
    ...buildBaseFields(req),
    denoising_strength: num(p.denoising_strength, 0.75),
    resize_mode: 0,
  };

  const imageInput = p.image;
  if (!isMediaInput(imageInput)) {
    throw new Error('a1111 img2img/inpaint requires an "image" param (MediaInput)');
  }
  body.init_images = [await blobToBase64(imageInput.blob)];

  const maskInput = p.mask;
  if (isMediaInput(maskInput)) {
    body.mask = await blobToBase64(maskInput.blob);
    body.mask_blur = num(p.mask_blur, 4);
    const fillLabel = str(p.inpainting_fill, 'original');
    body.inpainting_fill = INPAINT_FILL_CODES[fillLabel] ?? 1;
    body.inpaint_full_res = true;
    body.inpaint_full_res_padding = 0;
    body.inpainting_mask_invert = 0;
  }

  return body;
}

async function buildUpscaleBody(req: GenerateRequest): Promise<Record<string, unknown>> {
  const p = req.params;
  const imageInput = p.image;
  if (!isMediaInput(imageInput)) {
    throw new Error('a1111 upscale requires an "image" param (MediaInput)');
  }
  return {
    image: await blobToBase64(imageInput.blob),
    upscaler_1: str(p.upscaler_1, 'R-ESRGAN 4x+'),
    upscaling_resize: num(p.upscaling_resize, 2),
    resize_mode: 0,
    show_extras_results: true,
  };
}

function endpointForCapability(capability: Capability): string {
  switch (capability) {
    case 'text2image':
      return 'http://localhost/sdapi/v1/txt2img';
    case 'image2image':
    case 'inpaint':
      return 'http://localhost/sdapi/v1/img2img';
    case 'upscale':
      return 'http://localhost/sdapi/v1/extra-single-image';
    default:
      throw new Error(`a1111 adapter does not support capability: ${capability}`);
  }
}

// ---------------------------------------------------------------------------
// Response parsing
// ---------------------------------------------------------------------------

interface Txt2ImgLikeResponse {
  images: string[];
  parameters?: Record<string, unknown>;
  info: string;
}

interface ExtraSingleImageResponse {
  html_info?: string;
  image: string;
}

interface A1111Info {
  seed?: number;
  all_seeds?: number[];
  width?: number;
  height?: number;
  [key: string]: unknown;
}

function parseInfo(infoStr: string | undefined): A1111Info {
  if (!infoStr) return {};
  try {
    return JSON.parse(infoStr) as A1111Info;
  } catch {
    return {};
  }
}

// `all_seeds` has one entry per image, in the same order as `images`, so we zip
// them by index; single-image responses are just the i=0 case of the same logic.
function outputsFromGeneration(data: Txt2ImgLikeResponse): NormalizedOutput[] {
  const info = parseInfo(data.info);
  const seeds = Array.isArray(info.all_seeds) ? info.all_seeds : undefined;
  const width = typeof info.width === 'number' ? info.width : undefined;
  const height = typeof info.height === 'number' ? info.height : undefined;
  const fallbackSeed = typeof info.seed === 'number' ? info.seed : undefined;

  return (data.images ?? []).map((b64, i) => ({
    kind: 'image',
    source: 'base64',
    mime: 'image/png',
    data: b64,
    width,
    height,
    seed: seeds?.[i] ?? fallbackSeed,
  })) as NormalizedOutput[];
}

function outputsFromUpscale(data: ExtraSingleImageResponse): NormalizedOutput[] {
  return [{ kind: 'image', source: 'base64', mime: 'image/png', data: data.image }];
}

// ---------------------------------------------------------------------------
// Adapter methods
// ---------------------------------------------------------------------------

async function listModels(ctx: AdapterContext): Promise<ModelSpec[]> {
  const timeout = AbortSignal.timeout(3000);
  const signal = ctx.signal ? AbortSignal.any([ctx.signal, timeout]) : timeout;

  async function fetchJsonSafe<T>(path: string): Promise<T | undefined> {
    try {
      const res = await ctx.fetch(`http://localhost${path}`, { method: 'GET', signal });
      if (!res.ok) return undefined;
      return (await res.json()) as T;
    } catch {
      return undefined;
    }
  }

  const [models, samplers, schedulers, upscalers, forgeProbe] = await Promise.all([
    fetchJsonSafe<{ title: string; model_name: string; hash?: string }[]>('/sdapi/v1/sd-models'),
    fetchJsonSafe<{ name: string; aliases?: string[] }[]>('/sdapi/v1/samplers'),
    fetchJsonSafe<{ name: string; label?: string }[]>('/sdapi/v1/schedulers'),
    fetchJsonSafe<{ name: string; model_name?: string; scale?: number }[]>('/sdapi/v1/upscalers'),
    fetchJsonSafe<unknown>('/sdapi/v1/sd-modules'),
  ]);

  return buildModelSpecs({
    checkpoints: models?.map((m) => m.title),
    samplers: samplers?.map((s) => s.name),
    schedulers: schedulers?.map((s) => s.name),
    upscalers: upscalers?.map((u) => u.name),
    isForge: forgeProbe !== undefined,
  });
}

async function submit(req: GenerateRequest, ctx: AdapterContext): Promise<JobHandle> {
  const endpoint = endpointForCapability(req.capability);

  let body: Record<string, unknown>;
  if (req.capability === 'text2image') {
    body = buildTxt2ImgBody(req);
  } else if (req.capability === 'image2image' || req.capability === 'inpaint') {
    body = await buildImg2ImgBody(req);
  } else if (req.capability === 'upscale') {
    body = await buildUpscaleBody(req);
  } else {
    throw new Error(`a1111 adapter does not support capability: ${req.capability}`);
  }

  const jobId = crypto.randomUUID();
  const entry: PendingJob = { capability: req.capability, settled: false, promise: Promise.resolve() };
  pendingJobs.set(jobId, entry);

  entry.promise = ctx
    .fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctx.signal,
    })
    .then(async (res) => {
      entry.settled = true;
      if (!res.ok) {
        entry.error = `A1111 request failed (${res.status}): ${(await safeText(res)).slice(0, 500)}`;
      } else {
        entry.response = res;
      }
    })
    .catch((err: unknown) => {
      entry.settled = true;
      entry.error = err instanceof Error ? err.message : String(err);
    });

  ctx.log(`a1111: submitted ${req.capability} job ${jobId} -> ${endpoint}`);

  const providerRef: A1111JobRef = { jobId, endpoint };
  return {
    provider_id: 'a1111',
    model_id: req.model_id,
    capability: req.capability,
    provider_ref: providerRef,
    submitted_at: Date.now(),
  };
}

interface A1111Progress {
  progress: number;
  eta_relative: number;
  state: { skipped: boolean; interrupted: boolean; job: string; sampling_step: number; sampling_steps: number };
  current_image: string | null;
}

async function pollProgress(ctx: AdapterContext): Promise<JobStatus> {
  try {
    const res = await ctx.fetch('http://localhost/sdapi/v1/progress', { method: 'GET', signal: ctx.signal });
    if (!res.ok) return { state: 'processing' };
    const data = (await res.json()) as A1111Progress;
    if (data.state?.interrupted) return { state: 'cancelled' };
    return {
      state: 'processing',
      progress: typeof data.progress === 'number' ? data.progress : undefined,
      eta_seconds: typeof data.eta_relative === 'number' ? data.eta_relative : undefined,
      message: data.state?.job || undefined,
    };
  } catch {
    return { state: 'processing' };
  }
}

async function poll(h: JobHandle, ctx: AdapterContext): Promise<JobStatus> {
  const ref = h.provider_ref as A1111JobRef | undefined;
  const jobId = ref?.jobId;
  const entry = jobId ? pendingJobs.get(jobId) : undefined;

  if (!entry) {
    return { state: 'failed', error: 'a1111: job not found in memory (adapter state resets on page reload)' };
  }

  if (entry.finalStatus) return entry.finalStatus;

  if (!entry.settled) {
    return pollProgress(ctx);
  }

  if (entry.error) {
    entry.finalStatus = { state: 'failed', error: entry.error };
    return entry.finalStatus;
  }

  try {
    const res = entry.response!;
    let outputs: NormalizedOutput[];
    if (h.capability === 'upscale') {
      outputs = outputsFromUpscale((await res.json()) as ExtraSingleImageResponse);
    } else {
      const data = (await res.json()) as Txt2ImgLikeResponse;
      outputs = outputsFromGeneration(data);
    }
    entry.finalStatus = { state: 'succeeded', outputs };
  } catch (err) {
    entry.finalStatus = { state: 'failed', error: err instanceof Error ? err.message : String(err) };
  }

  return entry.finalStatus;
}

async function cancel(h: JobHandle, ctx: AdapterContext): Promise<void> {
  try {
    await ctx.fetch('http://localhost/sdapi/v1/interrupt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
  } finally {
    const ref = h.provider_ref as A1111JobRef | undefined;
    const entry = ref?.jobId ? pendingJobs.get(ref.jobId) : undefined;
    if (entry && !entry.finalStatus) {
      entry.finalStatus = { state: 'cancelled' };
    }
  }
}

async function testCredential(ctx: AdapterContext): Promise<{ ok: boolean; message?: string }> {
  try {
    const progressRes = await ctx.fetch('http://localhost/sdapi/v1/progress', { method: 'GET' });
    if (!progressRes.ok) {
      return {
        ok: false,
        message: `A1111/Forge responded with ${progressRes.status}. Make sure it was launched with --api.`,
      };
    }
    const modelsRes = await ctx.fetch('http://localhost/sdapi/v1/sd-models', { method: 'GET' });
    if (!modelsRes.ok) {
      return { ok: false, message: 'A1111/Forge is reachable but /sdapi/v1/sd-models failed; check the --api flag.' };
    }
    return { ok: true, message: 'A1111/Forge connected' };
  } catch (err) {
    return { ok: false, message: `Could not reach A1111/Forge: ${err instanceof Error ? err.message : String(err)}` };
  }
}

export const a1111Adapter: ProviderAdapter = {
  spec,
  capabilities: ['text2image', 'image2image', 'inpaint', 'upscale'] as Capability[],
  listModels,
  submit,
  poll,
  cancel,
  testCredential,
};
