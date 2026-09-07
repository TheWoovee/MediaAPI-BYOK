import type {
  ProviderAdapter,
  Capability,
  ModelSpec,
  GenerateRequest,
  JobHandle,
  JobStatus,
  NormalizedOutput,
  AdapterContext,
} from '@shared/types';
import { getProvider } from '@shared/providers/registry';
import { runpodModels } from './models';

const RUNPOD_API = 'https://api.runpod.ai/v2';

/** 7-day expiry for public endpoint output URLs on image.runpod.ai. */
const PUBLIC_OUTPUT_EXPIRY_MS = 7 * 24 * 3600 * 1000;

/*
 * RunPod has a 10 MB payload limit on the /run endpoint (10 * 1024 * 1024 bytes).
 * Keep this in mind when sending base64-encoded images inline.
 * For blobs exceeding ~7 MB, prefer ctx.uploadTemp() to get a URL instead.
 */

interface RunPodProviderRef {
  endpoint_slug: string;
  job_id: string;
}

/** Build the RunPod /run input object from our schema params. */
function buildInput(
  req: GenerateRequest,
): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(req.params)) {
    // Skip meta-params that aren't part of the model input
    if (key === 'endpoint_id' || key === 'input_json') continue;
    if (value !== undefined && value !== '') {
      input[key] = value;
    }
  }
  return input;
}

/**
 * Detect the output kind from a URL or MIME string.
 * Video URLs typically contain video extensions or /video/ path segments.
 */
function guessKind(url: string): 'image' | 'video' {
  const lower = url.toLowerCase();
  if (
    lower.endsWith('.mp4') ||
    lower.endsWith('.webm') ||
    lower.endsWith('.mov') ||
    lower.includes('/video/')
  ) {
    return 'video';
  }
  return 'image';
}

/** Guess MIME from URL extension. */
function guessMime(url: string): string {
  const ext = url.split(/[?#]/)[0].split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    default:
      return 'image/jpeg';
  }
}

/**
 * Normalise a RunPod job output into our standard output format.
 *
 * Public endpoints return:
 *   { image_url: "https://image.runpod.ai/..." }
 *   { video_url: "https://image.runpod.ai/..." }
 *
 * Custom endpoints (e.g. worker-sdxl) may return:
 *   - a plain string URL
 *   - { image_url: "..." }
 *   - { images: ["data:image/png;base64,...", ...] }
 *   - { output: "..." } (nested)
 */
function normalizeOutput(output: unknown): NormalizedOutput[] {
  if (!output) return [];
  const results: NormalizedOutput[] = [];

  // Case 1: output is a string URL
  if (typeof output === 'string' && output.startsWith('http')) {
    results.push({
      kind: guessKind(output),
      source: 'url',
      mime: guessMime(output),
      data: output,
      expires_at: Date.now() + PUBLIC_OUTPUT_EXPIRY_MS,
    });
    return results;
  }

  if (typeof output !== 'object' || output === null) return results;

  const obj = output as Record<string, unknown>;

  // Case 2: { image_url: "..." }
  if (typeof obj.image_url === 'string') {
    const url = obj.image_url;
    results.push({
      kind: 'image',
      source: 'url',
      mime: guessMime(url),
      data: url,
      expires_at: Date.now() + PUBLIC_OUTPUT_EXPIRY_MS,
    });
  }

  // Case 3: { video_url: "..." }
  if (typeof obj.video_url === 'string') {
    const url = obj.video_url;
    results.push({
      kind: 'video',
      source: 'url',
      mime: guessMime(url),
      data: url,
      expires_at: Date.now() + PUBLIC_OUTPUT_EXPIRY_MS,
    });
  }

  // Case 4: { images: [...] } (worker-sdxl pattern, base64 data URIs)
  if (Array.isArray(obj.images)) {
    for (const img of obj.images) {
      if (typeof img === 'string') {
        if (img.startsWith('data:')) {
          // data:image/png;base64,...
          const mimeMatch = img.match(/^data:([^;]+);base64,/);
          const mime = mimeMatch?.[1] ?? 'image/png';
          const base64 = img.replace(/^data:[^;]+;base64,/, '');
          results.push({
            kind: 'image',
            source: 'base64',
            mime,
            data: base64,
          });
        } else if (img.startsWith('http')) {
          results.push({
            kind: 'image',
            source: 'url',
            mime: guessMime(img),
            data: img,
            expires_at: Date.now() + PUBLIC_OUTPUT_EXPIRY_MS,
          });
        }
      }
    }
  }

  return results;
}

export const runpodAdapter: ProviderAdapter = {
  spec: getProvider('runpod')!,

  capabilities: [
    'text2image',
    'image2image',
    'text2video',
    'image2video',
  ] as Capability[],

  async listModels(_ctx: AdapterContext): Promise<ModelSpec[]> {
    return runpodModels;
  },

  async submit(req: GenerateRequest, ctx: AdapterContext): Promise<JobHandle> {
    const isCustom = req.model_id === 'runpod-custom-endpoint';

    let endpointSlug: string;
    let input: Record<string, unknown>;

    if (isCustom) {
      // Custom endpoint: user provides endpoint_id and raw JSON input
      endpointSlug = req.params.endpoint_id as string;
      if (!endpointSlug) {
        throw new Error('endpoint_id is required for custom endpoint');
      }

      const rawJson = req.params.input_json as string;
      if (!rawJson) {
        throw new Error('input_json is required for custom endpoint');
      }

      try {
        input = JSON.parse(rawJson) as Record<string, unknown>;
      } catch {
        throw new Error('input_json must be valid JSON');
      }
    } else {
      // Public endpoint: model_id IS the endpoint slug
      endpointSlug = req.model_id;
      input = buildInput(req);
    }

    const url = `${RUNPOD_API}/${endpointSlug}/run`;
    ctx.log(`POST ${url}`);

    const res = await ctx.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input }),
      signal: ctx.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`RunPod submit failed: ${res.status} ${text}`);
    }

    const json = (await res.json()) as { id: string; status: string };

    const providerRef: RunPodProviderRef = {
      endpoint_slug: endpointSlug,
      job_id: json.id,
    };

    return {
      provider_id: 'runpod',
      model_id: req.model_id,
      capability: req.capability,
      provider_ref: providerRef,
      submitted_at: Date.now(),
    };
  },

  async poll(h: JobHandle, ctx: AdapterContext): Promise<JobStatus> {
    const ref = h.provider_ref as RunPodProviderRef;
    const url = `${RUNPOD_API}/${ref.endpoint_slug}/status/${ref.job_id}`;

    const res = await ctx.fetch(url, { signal: ctx.signal });

    if (!res.ok) {
      return {
        state: 'failed',
        error: `Poll request failed: ${res.status}`,
      };
    }

    const json = (await res.json()) as {
      status: string;
      output?: unknown;
      error?: string;
    };

    switch (json.status) {
      case 'IN_QUEUE':
        return { state: 'queued' };

      case 'IN_PROGRESS':
      case 'RUNNING':
        return { state: 'processing' };

      case 'COMPLETED': {
        const outputs = normalizeOutput(json.output);
        if (outputs.length === 0 && json.output) {
          // Output exists but we couldn't parse it - still mark succeeded
          // so the caller can inspect provider_ref for raw output
          return {
            state: 'succeeded',
            outputs: [],
            message: 'Output returned but could not be normalized',
          };
        }
        return { state: 'succeeded', outputs };
      }

      case 'FAILED':
        return {
          state: 'failed',
          error: json.error ?? 'Job failed',
        };

      case 'CANCELLED':
        return { state: 'cancelled' };

      case 'TIMED_OUT':
        return {
          state: 'failed',
          error: 'Job timed out',
        };

      default:
        return {
          state: 'processing',
          message: `Unknown status: ${json.status}`,
        };
    }
  },

  async cancel(h: JobHandle, ctx: AdapterContext): Promise<void> {
    const ref = h.provider_ref as RunPodProviderRef;
    const url = `${RUNPOD_API}/${ref.endpoint_slug}/cancel/${ref.job_id}`;

    ctx.log(`POST ${url}`);

    const res = await ctx.fetch(url, {
      method: 'POST',
      signal: ctx.signal,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`RunPod cancel failed: ${res.status} ${text}`);
    }
  },

  async testCredential(ctx: AdapterContext): Promise<{ ok: boolean; message?: string }> {
    // Use the schnell public endpoint health check as a credential test.
    // A valid API key returns 200; an invalid one returns 401.
    const url = `${RUNPOD_API}/black-forest-labs-flux-1-schnell/health`;

    const res = await ctx.fetch(url, { signal: ctx.signal });

    if (res.ok) {
      return { ok: true, message: 'RunPod API key is valid' };
    }

    if (res.status === 401) {
      return { ok: false, message: 'Invalid RunPod API key' };
    }

    return { ok: false, message: `Unexpected response: ${res.status}` };
  },
};
