import type {
  ProviderAdapter,
  ModelSpec,
  GenerateRequest,
  JobHandle,
  JobStatus,
  AdapterContext,
  Capability,
  NormalizedOutput,
} from '@shared/types';
import { getProvider } from '@shared/providers/registry';
import { models, providerMapping } from './models';

const ROUTER_BASE = 'https://router.huggingface.co';

/** Reference data stashed in provider_ref to distinguish sync vs async jobs. */
interface FalQueueRef {
  kind: 'fal-queue';
  requestId: string;
  statusPathname: string;
  resultPathname: string;
}

interface SyncBytesRef {
  kind: 'sync-bytes';
  mime: string;
  base64: string;
}

type ProviderRef = FalQueueRef | SyncBytesRef;

function lookupMapping(modelId: string): { provider: string; providerId: string } {
  const mapping = providerMapping[modelId];
  if (!mapping) throw new Error(`No provider mapping for model: ${modelId}`);
  return mapping;
}

function isVideoCapability(cap: Capability): boolean {
  return cap === 'text2video' || cap === 'image2video' || cap === 'video2video' || cap === 'video_extend';
}

export const hfInferenceAdapter: ProviderAdapter = {
  spec: getProvider('hf-inference')!,
  capabilities: ['text2image', 'image2image', 'text2video'] as Capability[],

  async listModels(_ctx: AdapterContext): Promise<ModelSpec[]> {
    // The hub API (huggingface.co) is not in the proxy allowlist
    // (only router.huggingface.co is), so we return the static catalogue.
    return models;
  },

  async submit(req: GenerateRequest, ctx: AdapterContext): Promise<JobHandle> {
    const mapping = lookupMapping(req.model_id);

    if (mapping.provider === 'hf-inference') {
      return submitHfInferenceNative(req, ctx, mapping);
    }
    // fal-ai via HF router (queue-based)
    return submitFalQueue(req, ctx, mapping);
  },

  async poll(h: JobHandle, ctx: AdapterContext): Promise<JobStatus> {
    const ref = h.provider_ref as ProviderRef;

    if (ref.kind === 'sync-bytes') {
      return pollSyncResult(ref, h);
    }
    return pollFalQueue(ref, h, ctx);
  },

  async cancel(_h: JobHandle, _ctx: AdapterContext): Promise<void> {
    // The HF router does not expose a cancel endpoint for routed jobs.
  },

  async testCredential(ctx: AdapterContext): Promise<{ ok: boolean; message?: string }> {
    try {
      // Minimal inference request to validate the token.
      // If auth fails the router returns 401/403.
      const url = `${ROUTER_BASE}/hf-inference/models/stabilityai/stable-diffusion-3-medium-diffusers`;
      const res = await ctx.fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inputs: 'test', parameters: { num_inference_steps: 1 } }),
        signal: ctx.signal,
      });

      if (res.status === 401 || res.status === 403) {
        return { ok: false, message: 'Invalid or expired Hugging Face token' };
      }
      // Any other response (200, 503 model loading, 422 bad params) means the token itself is valid.
      return { ok: true };
    } catch (err) {
      return { ok: false, message: `Connection error: ${(err as Error).message}` };
    }
  },
};

// ---------------------------------------------------------------------------
// hf-inference native (synchronous, returns raw bytes)
// ---------------------------------------------------------------------------

async function submitHfInferenceNative(
  req: GenerateRequest,
  ctx: AdapterContext,
  mapping: { providerId: string },
): Promise<JobHandle> {
  const url = `${ROUTER_BASE}/hf-inference/models/${mapping.providerId}`;
  const body: Record<string, unknown> = {
    inputs: req.params.prompt as string,
    parameters: {} as Record<string, unknown>,
  };

  const params = body.parameters as Record<string, unknown>;
  if (req.params.negative_prompt) params.negative_prompt = req.params.negative_prompt;
  if (req.params.guidance_scale != null) params.guidance_scale = req.params.guidance_scale;
  if (req.params.num_inference_steps != null) params.num_inference_steps = req.params.num_inference_steps;
  if (req.seed != null) params.seed = req.seed;
  if (req.params.seed != null) params.seed = req.params.seed;

  ctx.log(`HF-inference native POST ${url}`);

  const res = await ctx.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: ctx.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HF inference error ${res.status}: ${text}`);
  }

  const contentType = res.headers.get('content-type') ?? 'image/png';
  const buf = await res.arrayBuffer();
  const base64 = arrayBufferToBase64(buf);

  const ref: SyncBytesRef = { kind: 'sync-bytes', mime: contentType, base64 };
  return {
    provider_id: req.provider_id,
    model_id: req.model_id,
    capability: req.capability,
    provider_ref: ref,
    submitted_at: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// fal-ai queue via HF router
// ---------------------------------------------------------------------------

interface FalQueueResponse {
  request_id: string;
  response_url: string;
  status_url: string;
  queue_position?: number;
}

async function submitFalQueue(
  req: GenerateRequest,
  ctx: AdapterContext,
  mapping: { provider: string; providerId: string },
): Promise<JobHandle> {
  const url = `${ROUTER_BASE}/${mapping.providerId}?_subdomain=queue`;
  const body = buildFalBody(req);

  ctx.log(`HF fal-queue POST ${url}`);

  const res = await ctx.fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: ctx.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HF fal-queue submit error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as FalQueueResponse;

  // Extract pathnames from response URLs so we can rebuild them through the router.
  const statusPathname = extractPathname(data.status_url);
  const resultPathname = extractPathname(data.response_url);

  const ref: FalQueueRef = {
    kind: 'fal-queue',
    requestId: data.request_id,
    statusPathname,
    resultPathname,
  };

  return {
    provider_id: req.provider_id,
    model_id: req.model_id,
    capability: req.capability,
    provider_ref: ref,
    poll_url: `${ROUTER_BASE}/fal-ai${statusPathname}?_subdomain=queue`,
    submitted_at: Date.now(),
  };
}

function buildFalBody(req: GenerateRequest): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  const p = req.params;

  body.prompt = p.prompt;

  if (p.width != null || p.height != null) {
    body.image_size = {
      width: (p.width as number) ?? 1024,
      height: (p.height as number) ?? 1024,
    };
  }

  if (p.guidance_scale != null) body.guidance_scale = p.guidance_scale;
  if (p.num_inference_steps != null) body.num_inference_steps = p.num_inference_steps;
  if (p.num_frames != null) body.num_frames = p.num_frames;
  if (p.fps != null) body.fps = p.fps;

  // Seed: prefer params.seed, fall back to top-level
  if (p.seed != null) body.seed = p.seed;
  else if (req.seed != null) body.seed = req.seed;

  // image2image: pass the image input
  if (p.image != null) body.image_url = p.image;

  return body;
}

// ---------------------------------------------------------------------------
// Polling
// ---------------------------------------------------------------------------

interface FalStatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED';
  queue_position?: number;
  response_url?: string;
}

interface FalResultResponse {
  images?: { url: string; width?: number; height?: number; content_type?: string }[];
  video?: { url: string; content_type?: string };
  seed?: number;
}

function pollSyncResult(ref: SyncBytesRef, h: JobHandle): JobStatus {
  const kind = isVideoCapability(h.capability) ? 'video' : 'image';
  return {
    state: 'succeeded',
    outputs: [
      {
        kind,
        source: 'base64',
        mime: ref.mime,
        data: ref.base64,
      } as NormalizedOutput,
    ],
  };
}

async function pollFalQueue(ref: FalQueueRef, h: JobHandle, ctx: AdapterContext): Promise<JobStatus> {
  const statusUrl = `${ROUTER_BASE}/fal-ai${ref.statusPathname}?_subdomain=queue`;

  ctx.log(`HF fal-queue poll GET ${statusUrl}`);

  const res = await ctx.fetch(statusUrl, {
    method: 'GET',
    signal: ctx.signal,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HF fal-queue poll error ${res.status}: ${text}`);
  }

  const data = (await res.json()) as FalStatusResponse;

  switch (data.status) {
    case 'IN_QUEUE':
      return {
        state: 'queued',
        message: data.queue_position != null ? `Queue position: ${data.queue_position}` : undefined,
      };

    case 'IN_PROGRESS':
      return { state: 'processing' };

    case 'FAILED':
      return { state: 'failed', error: 'Job failed on provider' };

    case 'COMPLETED': {
      // Fetch the result
      const resultUrl = `${ROUTER_BASE}/fal-ai${ref.resultPathname}?_subdomain=queue`;
      ctx.log(`HF fal-queue result GET ${resultUrl}`);

      const resultRes = await ctx.fetch(resultUrl, {
        method: 'GET',
        signal: ctx.signal,
      });

      if (!resultRes.ok) {
        const text = await resultRes.text();
        return { state: 'failed', error: `Failed to fetch result: ${text}` };
      }

      const result = (await resultRes.json()) as FalResultResponse;
      return normalizeFalResult(result, h.capability);
    }

    default:
      return { state: 'processing' };
  }
}

function normalizeFalResult(result: FalResultResponse, _capability: Capability): JobStatus {
  const outputs: NormalizedOutput[] = [];

  if (result.images) {
    for (const img of result.images) {
      outputs.push({
        kind: 'image',
        source: 'url',
        mime: img.content_type ?? 'image/png',
        data: img.url,
        width: img.width,
        height: img.height,
        seed: result.seed,
      });
    }
  }

  if (result.video) {
    outputs.push({
      kind: 'video',
      source: 'url',
      mime: result.video.content_type ?? 'video/mp4',
      data: result.video.url,
      seed: result.seed,
    });
  }

  if (outputs.length === 0) {
    return { state: 'failed', error: 'No outputs returned by provider' };
  }

  return { state: 'succeeded', outputs };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractPathname(fullUrl: string): string {
  try {
    const url = new URL(fullUrl);
    return url.pathname;
  } catch {
    // If the URL cannot be parsed, return it as-is (it may already be a pathname).
    return fullUrl;
  }
}

function arrayBufferToBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
