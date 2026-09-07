import type { ProviderAdapter, AdapterContext, GenerateRequest, JobHandle, JobStatus, ModelSpec, Capability, NormalizedOutput, MediaInput } from '@shared/types';
import { getProvider } from '@shared/providers/registry';
import { models, VEO_MODELS, GEMINI_IMAGE_MODELS } from './models';

const spec = getProvider('google')!;
const BASE = 'https://generativelanguage.googleapis.com/v1beta';

function blobToBase64(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export const googleAdapter: ProviderAdapter = {
  spec,
  capabilities: ['text2image', 'image2image', 'text2video', 'image2video', 'video_extend'] as Capability[],

  async listModels(ctx: AdapterContext): Promise<ModelSpec[]> {
    try {
      const res = await ctx.fetch(new Request(`${BASE}/models`, { method: 'GET' }));
      if (res.ok) {
        const json = await res.json() as { models?: { name: string; displayName?: string; supportedGenerationMethods?: string[] }[] };
        if (json.models) {
          const liveIds = new Set(json.models.map((m) => m.name.replace('models/', '')));
          return models.filter((m) => liveIds.has(m.id) || !GEMINI_IMAGE_MODELS.has(m.id) || liveIds.has(m.id));
        }
      }
    } catch {
      // fall through to static list
    }
    return models;
  },

  async submit(req: GenerateRequest, ctx: AdapterContext): Promise<JobHandle> {
    const params = req.params as Record<string, unknown>;
    const model = req.model_id;

    if (GEMINI_IMAGE_MODELS.has(model)) {
      const parts: Record<string, unknown>[] = [];

      if (req.capability === 'image2image') {
        const image = params.image as MediaInput | undefined;
        if (image?.blob) {
          const buf = await image.blob.arrayBuffer();
          parts.push({
            inlineData: { mimeType: image.blob.type || 'image/png', data: blobToBase64(buf) },
          });
        }
      }

      parts.push({ text: params.prompt as string });

      const body: Record<string, unknown> = {
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['IMAGE'],
          imageConfig: {} as Record<string, unknown>,
        },
      };

      const imageConfig = (body.generationConfig as Record<string, unknown>).imageConfig as Record<string, unknown>;
      if (params.aspectRatio) imageConfig.aspectRatio = params.aspectRatio;
      if (params.imageSize) imageConfig.imageSize = params.imageSize;

      const url = `${BASE}/models/${model}:generateContent`;
      const res = await ctx.fetch(new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }));

      if (!res.ok) throw new Error(`Google generateContent ${res.status}: ${await res.text()}`);
      const json = await res.json() as {
        candidates?: { content?: { parts?: { inlineData?: { mimeType: string; data: string }; text?: string }[] } }[];
      };

      const images: { mime: string; data: string }[] = [];
      for (const candidate of json.candidates ?? []) {
        for (const part of candidate.content?.parts ?? []) {
          if (part.inlineData) {
            images.push({ mime: part.inlineData.mimeType, data: part.inlineData.data });
          }
        }
      }

      if (images.length === 0) throw new Error('No images returned from Gemini');

      return {
        provider_id: spec.id, model_id: model, capability: req.capability,
        provider_ref: { sync: true, images },
        submitted_at: Date.now(),
      };
    }

    if (VEO_MODELS.has(model)) {
      const instance: Record<string, unknown> = {
        prompt: params.prompt,
      };
      const parameters: Record<string, unknown> = {};

      if (params.aspectRatio) parameters.aspectRatio = params.aspectRatio;
      if (params.resolution) parameters.resolution = params.resolution;
      if (params.durationSeconds) parameters.durationSeconds = Number(params.durationSeconds);
      if (params.negativePrompt) parameters.negativePrompt = params.negativePrompt;
      if (params.personGeneration) parameters.personGeneration = params.personGeneration;

      if (req.capability === 'image2video') {
        const image = params.image as MediaInput | undefined;
        if (image?.blob) {
          const buf = await image.blob.arrayBuffer();
          instance.image = { bytesBase64Encoded: blobToBase64(buf), mimeType: image.blob.type || 'image/png' };
        }
      }

      if (req.capability === 'video_extend') {
        if (typeof params.video_uri === 'string') {
          instance.video = { uri: params.video_uri };
        }
      }

      const body = {
        instances: [instance],
        parameters,
      };

      const url = `${BASE}/models/${model}:predictLongRunning`;
      const res = await ctx.fetch(new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }));

      if (!res.ok) throw new Error(`Google predictLongRunning ${res.status}: ${await res.text()}`);
      const json = await res.json() as { name: string };

      return {
        provider_id: spec.id, model_id: model, capability: req.capability,
        provider_ref: { operation: json.name },
        poll_url: `${BASE}/${json.name}`,
        submitted_at: Date.now(),
      };
    }

    throw new Error(`Unknown model: ${model}`);
  },

  async poll(h: JobHandle, ctx: AdapterContext): Promise<JobStatus> {
    const ref = h.provider_ref as {
      sync?: boolean;
      images?: { mime: string; data: string }[];
      operation?: string;
    };

    if (ref.sync && ref.images) {
      const outputs: NormalizedOutput[] = ref.images.map((img) => ({
        kind: 'image' as const,
        source: 'base64' as const,
        mime: img.mime,
        data: img.data,
      }));
      return { state: 'succeeded', outputs };
    }

    if (!h.poll_url) throw new Error('No poll URL for async job');

    const res = await ctx.fetch(new Request(h.poll_url, { method: 'GET' }));
    if (!res.ok) throw new Error(`Google poll ${res.status}: ${await res.text()}`);

    const json = await res.json() as {
      done?: boolean;
      error?: { code: number; message: string };
      response?: {
        generateVideoResponse?: {
          generatedSamples?: { video?: { uri: string } }[];
          raiMediaFilteredCount?: number;
          raiMediaFilteredReasons?: string[];
        };
      };
    };

    if (!json.done) {
      return { state: 'processing' };
    }

    if (json.error) {
      return { state: 'failed', error: json.error.message };
    }

    const samples = json.response?.generateVideoResponse?.generatedSamples ?? [];
    const filtered = json.response?.generateVideoResponse?.raiMediaFilteredCount ?? 0;

    if (samples.length === 0) {
      if (filtered > 0) {
        const reasons = json.response?.generateVideoResponse?.raiMediaFilteredReasons?.join(', ') ?? 'content policy';
        return { state: 'failed', error: `Video filtered: ${reasons}` };
      }
      return { state: 'failed', error: 'No video samples returned' };
    }

    const outputs: NormalizedOutput[] = samples
      .filter((s) => s.video?.uri)
      .map((s) => ({
        kind: 'video' as const,
        source: 'url' as const,
        mime: 'video/mp4',
        data: s.video!.uri,
        expires_at: Date.now() + 48 * 3600_000,
      }));

    return { state: 'succeeded', outputs };
  },

  async testCredential(ctx: AdapterContext): Promise<{ ok: boolean; message?: string }> {
    try {
      const res = await ctx.fetch(new Request(`${BASE}/models`, { method: 'GET' }));
      if (!res.ok) return { ok: false, message: `Google API returned ${res.status}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, message: String(e) };
    }
  },
};
