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
import { falModels } from './models';

const spec = getProvider('fal')!;

/* ------------------------------------------------------------------ */
/*  fal.ai queue response shapes                                       */
/* ------------------------------------------------------------------ */

interface FalQueueResponse {
  request_id: string;
  status_url: string;
  response_url: string;
  cancel_url: string;
}

interface FalProviderRef {
  request_id: string;
  status_url: string;
  response_url: string;
  cancel_url: string;
}

interface FalStatusResponse {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED';
  queue_position?: number;
  response_url?: string;
}

interface FalImageOutput {
  url: string;
  width?: number;
  height?: number;
  content_type?: string;
}

interface FalResultResponse {
  images?: FalImageOutput[];
  video?: { url: string; content_type?: string };
  seed?: number;
  [key: string]: unknown;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Derive the set of all capabilities across the curated list. */
function allCapabilities(): Capability[] {
  const s = new Set<Capability>();
  for (const m of falModels) for (const c of m.capabilities) s.add(c);
  return [...s];
}

/** Build the JSON body for a fal queue submission from GenerateRequest. */
function buildInput(req: GenerateRequest): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  const p = req.params;

  if (p.prompt != null) input.prompt = p.prompt;
  if (p.negative_prompt != null) input.negative_prompt = p.negative_prompt;
  if (p.image_url != null) input.image_url = p.image_url;
  if (p.image_size != null) input.image_size = p.image_size;
  if (p.aspect_ratio != null) input.aspect_ratio = p.aspect_ratio;
  if (p.strength != null) input.strength = p.strength;
  if (p.guidance_scale != null) input.guidance_scale = p.guidance_scale;
  if (p.num_inference_steps != null) input.num_inference_steps = p.num_inference_steps;
  if (p.num_images != null) input.num_images = p.num_images;
  if (p.enable_safety_checker != null) input.enable_safety_checker = p.enable_safety_checker;
  if (p.safety_tolerance != null) input.safety_tolerance = p.safety_tolerance;
  if (p.style != null) input.style = p.style;
  if (p.raw != null) input.raw = p.raw;
  if (p.output_format != null) input.output_format = p.output_format;
  if (p.upscaling_factor != null) input.upscaling_factor = p.upscaling_factor;
  if (p.duration != null) input.duration = p.duration;
  if (p.resolution != null) input.resolution = p.resolution;
  if (p.num_frames != null) input.num_frames = p.num_frames;
  if (p.generate_audio != null) input.generate_audio = p.generate_audio;

  // Seed can come from req.seed or params.seed
  const seed = req.seed ?? p.seed;
  if (seed != null) input.seed = seed;

  return input;
}

/** Guess mime from a fal output URL or content_type. */
function guessMime(url: string, contentType?: string): string {
  if (contentType) return contentType;
  if (url.endsWith('.mp4') || url.includes('.mp4?')) return 'video/mp4';
  if (url.endsWith('.webm') || url.includes('.webm?')) return 'video/webm';
  if (url.endsWith('.webp') || url.includes('.webp?')) return 'image/webp';
  if (url.endsWith('.jpg') || url.endsWith('.jpeg') || url.includes('.jpg?') || url.includes('.jpeg?')) return 'image/jpeg';
  return 'image/png';
}

/* ------------------------------------------------------------------ */
/*  Adapter                                                            */
/* ------------------------------------------------------------------ */

export const falAdapter: ProviderAdapter = {
  spec,
  capabilities: allCapabilities(),

  async listModels(ctx: AdapterContext): Promise<ModelSpec[]> {
    // Try live refresh; fall back to static list on any failure.
    try {
      const res = await ctx.fetch('https://api.fal.ai/v1/models?limit=50', {
        method: 'GET',
        headers: { 'X-Proxy-Host': 'api.fal.ai' },
      });
      if (res.ok) {
        ctx.log('fal: live model list fetched');
      }
    } catch {
      ctx.log('fal: live model list unavailable, using static catalogue');
    }
    // Always return curated static list (live data enrichment is future work).
    return falModels;
  },

  async submit(req: GenerateRequest, ctx: AdapterContext): Promise<JobHandle> {
    const input = buildInput(req);
    const url = `https://queue.fal.run/${req.model_id}`;

    ctx.log(`fal: submitting to ${url}`);

    const res = await ctx.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Proxy-Host': 'queue.fal.run' },
      body: JSON.stringify(input),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`fal submit failed (${res.status}): ${text}`);
    }

    const data = (await res.json()) as FalQueueResponse;

    const ref: FalProviderRef = {
      request_id: data.request_id,
      status_url: data.status_url,
      response_url: data.response_url,
      cancel_url: data.cancel_url,
    };

    return {
      provider_id: 'fal',
      model_id: req.model_id,
      capability: req.capability,
      provider_ref: ref,
      poll_url: data.status_url,
      submitted_at: Date.now(),
    };
  },

  async poll(h: JobHandle, ctx: AdapterContext): Promise<JobStatus> {
    const ref = h.provider_ref as FalProviderRef;

    const statusRes = await ctx.fetch(ref.status_url, {
      method: 'GET',
      headers: { 'X-Proxy-Host': new URL(ref.status_url).hostname },
    });

    if (!statusRes.ok) {
      const text = await statusRes.text();
      return { state: 'failed', error: `fal status check failed (${statusRes.status}): ${text}` };
    }

    const status = (await statusRes.json()) as FalStatusResponse;

    if (status.status === 'IN_QUEUE') {
      return {
        state: 'queued',
        message: status.queue_position != null ? `Queue position: ${status.queue_position}` : undefined,
      };
    }

    if (status.status === 'IN_PROGRESS') {
      return { state: 'processing' };
    }

    if (status.status === 'COMPLETED') {
      // Fetch the actual result from response_url.
      const resultRes = await ctx.fetch(ref.response_url, {
        method: 'GET',
        headers: { 'X-Proxy-Host': new URL(ref.response_url).hostname },
      });

      if (!resultRes.ok) {
        const text = await resultRes.text();
        return { state: 'failed', error: `fal result fetch failed (${resultRes.status}): ${text}` };
      }

      const result = (await resultRes.json()) as FalResultResponse;
      const outputs: NormalizedOutput[] = [];

      // Normalize image outputs
      if (result.images && result.images.length > 0) {
        for (const img of result.images) {
          outputs.push({
            kind: 'image',
            source: 'url',
            mime: guessMime(img.url, img.content_type),
            data: img.url,
            width: img.width,
            height: img.height,
            seed: result.seed as number | undefined,
          });
        }
      }

      // Normalize video output
      if (result.video?.url) {
        outputs.push({
          kind: 'video',
          source: 'url',
          mime: guessMime(result.video.url, result.video.content_type),
          data: result.video.url,
          seed: result.seed as number | undefined,
        });
      }

      if (outputs.length === 0) {
        return { state: 'failed', error: 'fal: completed but no recognized outputs in response' };
      }

      return { state: 'succeeded', outputs };
    }

    // Unknown status
    return { state: 'failed', error: `fal: unexpected status "${status.status as string}"` };
  },

  async cancel(h: JobHandle, ctx: AdapterContext): Promise<void> {
    const ref = h.provider_ref as FalProviderRef;
    await ctx.fetch(ref.cancel_url, {
      method: 'PUT',
      headers: { 'X-Proxy-Host': new URL(ref.cancel_url).hostname },
    });
  },

  async testCredential(ctx: AdapterContext): Promise<{ ok: boolean; message?: string }> {
    try {
      const res = await ctx.fetch('https://api.fal.ai/v1/models?limit=1', {
        method: 'GET',
        headers: { 'X-Proxy-Host': 'api.fal.ai' },
      });
      if (res.ok) {
        return { ok: true };
      }
      const text = await res.text();
      return { ok: false, message: `fal auth failed (${res.status}): ${text}` };
    } catch (err) {
      return { ok: false, message: `fal auth error: ${(err as Error).message}` };
    }
  },
};
