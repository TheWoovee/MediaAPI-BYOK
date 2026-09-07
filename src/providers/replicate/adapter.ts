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
import { models } from './models';

const spec = getProvider('replicate')!;

/** Capabilities that typically finish quickly enough for `Prefer: wait`. */
const IMAGE_CAPS = new Set<Capability>(['text2image', 'image2image', 'inpaint', 'upscale', 'remove_bg']);

/** Replicate output URLs are valid for ~1 hour. */
const OUTPUT_TTL_MS = 3_600_000;

/* ── helpers ────────────────────────────────────────────────── */

interface ReplicatePrediction {
  id: string;
  status: 'starting' | 'processing' | 'succeeded' | 'failed' | 'canceled';
  output?: unknown;
  error?: string | null;
  metrics?: { predict_time?: number };
  urls: { get: string; cancel: string };
}

interface ProviderRef {
  id: string;
  get_url: string;
  cancel_url: string;
}

function splitModelId(modelId: string): { owner: string; name: string } {
  const [owner, name] = modelId.split('/');
  return { owner, name };
}

function isImageCapability(cap: Capability): boolean {
  return IMAGE_CAPS.has(cap);
}

function guessOutputKind(url: string, cap: Capability): 'image' | 'video' {
  if (cap === 'text2video' || cap === 'image2video' || cap === 'video2video' || cap === 'video_extend') {
    return 'video';
  }
  const lower = url.toLowerCase();
  if (lower.endsWith('.mp4') || lower.endsWith('.webm') || lower.endsWith('.mov')) {
    return 'video';
  }
  return 'image';
}

function guessMime(url: string, kind: 'image' | 'video'): string {
  const lower = url.toLowerCase();
  if (kind === 'video') {
    if (lower.endsWith('.webm')) return 'video/webm';
    return 'video/mp4';
  }
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  return 'image/webp'; // Replicate default for many FLUX models
}

function normalizeOutputUrls(raw: unknown, cap: Capability): NormalizedOutput[] {
  const urls: string[] = [];
  if (typeof raw === 'string') {
    urls.push(raw);
  } else if (Array.isArray(raw)) {
    for (const item of raw) {
      if (typeof item === 'string') urls.push(item);
    }
  }

  const now = Date.now();
  return urls.map((url) => {
    const kind = guessOutputKind(url, cap);
    return {
      kind,
      source: 'url' as const,
      mime: guessMime(url, kind),
      data: url,
      expires_at: now + OUTPUT_TTL_MS,
    };
  });
}

function mapStatus(
  prediction: ReplicatePrediction,
  cap: Capability,
): JobStatus {
  switch (prediction.status) {
    case 'starting':
      return { state: 'queued' };
    case 'processing':
      return { state: 'processing' };
    case 'succeeded': {
      const outputs = normalizeOutputUrls(prediction.output, cap);
      return { state: 'succeeded', outputs };
    }
    case 'failed':
      return {
        state: 'failed',
        error: prediction.error ?? 'Prediction failed',
      };
    case 'canceled':
      return { state: 'cancelled' };
    default:
      return { state: 'processing' };
  }
}

/* ── adapter ────────────────────────────────────────────────── */

export const replicateAdapter: ProviderAdapter = {
  spec,

  capabilities: [...new Set(models.flatMap((m) => m.capabilities))],

  async listModels(_ctx: AdapterContext): Promise<ModelSpec[]> {
    return models;
  },

  async submit(req: GenerateRequest, ctx: AdapterContext): Promise<JobHandle> {
    const { owner, name } = splitModelId(req.model_id);
    const url = `https://api.replicate.com/v1/models/${owner}/${name}/predictions`;

    const input: Record<string, unknown> = { ...req.params };
    if (req.seed != null) input.seed = req.seed;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    // Use Prefer: wait for image models (typically fast) so we can get
    // the result in a single round-trip instead of polling.
    if (isImageCapability(req.capability)) {
      headers['Prefer'] = 'wait=55';
    }

    const res = await ctx.fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ input }),
      signal: ctx.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Replicate submit failed (${res.status}): ${text}`);
    }

    const prediction: ReplicatePrediction = await res.json() as ReplicatePrediction;

    return {
      provider_id: 'replicate',
      model_id: req.model_id,
      capability: req.capability,
      provider_ref: {
        id: prediction.id,
        get_url: prediction.urls.get,
        cancel_url: prediction.urls.cancel,
      } satisfies ProviderRef,
      poll_url: prediction.urls.get,
      submitted_at: Date.now(),
    };
  },

  async poll(h: JobHandle, ctx: AdapterContext): Promise<JobStatus> {
    const ref = h.provider_ref as ProviderRef;
    const res = await ctx.fetch(ref.get_url, { signal: ctx.signal });

    if (!res.ok) {
      const text = await res.text();
      return { state: 'failed' as const, error: `Replicate poll failed (${res.status}): ${text}` };
    }

    const prediction: ReplicatePrediction = await res.json() as ReplicatePrediction;
    return mapStatus(prediction, h.capability);
  },

  async cancel(h: JobHandle, ctx: AdapterContext): Promise<void> {
    const ref = h.provider_ref as ProviderRef;
    const res = await ctx.fetch(ref.cancel_url, {
      method: 'POST',
      signal: ctx.signal,
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Replicate cancel failed (${res.status}): ${text}`);
    }
  },

  async testCredential(ctx: AdapterContext): Promise<{ ok: boolean; message?: string }> {
    const res = await ctx.fetch('https://api.replicate.com/v1/account', {
      signal: ctx.signal,
    });

    if (res.ok) {
      const data = await res.json() as { username?: string; type?: string };
      return {
        ok: true,
        message: `Authenticated as ${data.username ?? 'unknown'} (${data.type ?? 'user'})`,
      };
    }

    if (res.status === 401) {
      return { ok: false, message: 'Invalid API token' };
    }

    return { ok: false, message: `Unexpected status ${res.status}` };
  },
};
