import type { ProviderAdapter, AdapterContext, GenerateRequest, JobHandle, JobStatus, ModelSpec, Capability, NormalizedOutput, MediaInput } from '@shared/types';
import { getProvider } from '@shared/providers/registry';
import { models } from './models';

const spec = getProvider('xai')!;
const BASE = 'https://api.x.ai/v1';

function blobToDataUri(blob: Blob, data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

export const xaiAdapter: ProviderAdapter = {
  spec,
  capabilities: ['text2image', 'image2image', 'text2video', 'image2video', 'video_extend'] as Capability[],

  async listModels(_ctx: AdapterContext): Promise<ModelSpec[]> {
    return models;
  },

  async submit(req: GenerateRequest, ctx: AdapterContext): Promise<JobHandle> {
    const params = req.params as Record<string, unknown>;
    const model = req.model_id;

    if (req.capability === 'text2image') {
      const body: Record<string, unknown> = {
        model,
        prompt: params.prompt,
        response_format: 'b64_json',
      };
      if (params.aspect_ratio) body.aspect_ratio = params.aspect_ratio;
      if (params.resolution) body.resolution = params.resolution;
      if (params.quality) body.quality = params.quality;
      if (params.n) body.n = params.n;

      const res = await ctx.fetch(new Request(`${BASE}/images/generations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }));

      if (!res.ok) throw new Error(`xAI images/generations ${res.status}: ${await res.text()}`);
      const json = await res.json() as { data: { b64_json?: string; url?: string }[] };

      return {
        provider_id: spec.id, model_id: model, capability: req.capability,
        provider_ref: { sync: true, images: json.data },
        submitted_at: Date.now(),
      };
    }

    if (req.capability === 'image2image') {
      const image = params.image as MediaInput | undefined;
      let imageDataUri: string | undefined;
      if (image?.blob) {
        const buf = await image.blob.arrayBuffer();
        imageDataUri = blobToDataUri(image.blob, buf);
      }

      const body: Record<string, unknown> = {
        model,
        prompt: params.prompt,
        response_format: 'b64_json',
      };
      if (imageDataUri) {
        body.image = { type: 'image_url', image_url: { url: imageDataUri } };
      }
      if (params.aspect_ratio) body.aspect_ratio = params.aspect_ratio;
      if (params.resolution) body.resolution = params.resolution;
      if (params.quality) body.quality = params.quality;
      if (params.n) body.n = params.n;

      const res = await ctx.fetch(new Request(`${BASE}/images/edits`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }));

      if (!res.ok) throw new Error(`xAI images/edits ${res.status}: ${await res.text()}`);
      const json = await res.json() as { data: { b64_json?: string; url?: string }[] };

      return {
        provider_id: spec.id, model_id: model, capability: req.capability,
        provider_ref: { sync: true, images: json.data },
        submitted_at: Date.now(),
      };
    }

    if (req.capability === 'text2video' || req.capability === 'image2video') {
      const body: Record<string, unknown> = {
        model,
        prompt: params.prompt,
      };
      if (params.duration) body.duration = params.duration;
      if (params.aspect_ratio) body.aspect_ratio = params.aspect_ratio;
      if (params.resolution) body.resolution = params.resolution;
      if (params.generate_audio != null) body.generate_audio = params.generate_audio;

      if (req.capability === 'image2video') {
        const image = params.image as MediaInput | undefined;
        if (image?.blob) {
          const buf = await image.blob.arrayBuffer();
          body.image = { url: blobToDataUri(image.blob, buf) };
        }
      }

      const res = await ctx.fetch(new Request(`${BASE}/videos/generations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }));

      if (!res.ok) throw new Error(`xAI videos/generations ${res.status}: ${await res.text()}`);
      const json = await res.json() as { request_id: string };

      return {
        provider_id: spec.id, model_id: model, capability: req.capability,
        provider_ref: { request_id: json.request_id },
        poll_url: `${BASE}/videos/${json.request_id}`,
        submitted_at: Date.now(),
      };
    }

    if (req.capability === 'video_extend') {
      const video = params.video as MediaInput | undefined;
      let videoUrl: string | undefined;
      if (video?.blob) {
        videoUrl = await ctx.uploadTemp(video.blob);
      } else if (typeof params.video_url === 'string') {
        videoUrl = params.video_url;
      }

      const body: Record<string, unknown> = {
        model,
        prompt: params.prompt,
      };
      if (params.duration) body.duration = params.duration;
      if (videoUrl) body.video = { url: videoUrl };

      const res = await ctx.fetch(new Request(`${BASE}/videos/extensions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }));

      if (!res.ok) throw new Error(`xAI videos/extensions ${res.status}: ${await res.text()}`);
      const json = await res.json() as { request_id: string };

      return {
        provider_id: spec.id, model_id: model, capability: req.capability,
        provider_ref: { request_id: json.request_id },
        poll_url: `${BASE}/videos/${json.request_id}`,
        submitted_at: Date.now(),
      };
    }

    throw new Error(`Unsupported capability: ${req.capability}`);
  },

  async poll(h: JobHandle, ctx: AdapterContext): Promise<JobStatus> {
    const ref = h.provider_ref as { sync?: boolean; images?: { b64_json?: string; url?: string }[]; request_id?: string };

    if (ref.sync && ref.images) {
      const outputs: NormalizedOutput[] = ref.images.map((img) => {
        if (img.b64_json) {
          return { kind: 'image' as const, source: 'base64' as const, mime: 'image/jpeg', data: img.b64_json };
        }
        return { kind: 'image' as const, source: 'url' as const, mime: 'image/jpeg', data: img.url!, expires_at: Date.now() + 3600_000 };
      });
      return { state: 'succeeded', outputs };
    }

    if (!h.poll_url) throw new Error('No poll URL for async job');

    const res = await ctx.fetch(new Request(h.poll_url, { method: 'GET' }));
    if (!res.ok) throw new Error(`xAI poll ${res.status}: ${await res.text()}`);

    const json = await res.json() as {
      status: 'pending' | 'done' | 'failed' | 'expired';
      video?: { url: string; duration?: number };
    };

    if (json.status === 'pending') {
      return { state: 'processing' };
    }

    if (json.status === 'failed') {
      return { state: 'failed', error: 'Video generation failed' };
    }

    if (json.status === 'expired') {
      return { state: 'failed', error: 'Video result expired before download' };
    }

    if (json.status === 'done') {
      if (!json.video?.url) {
        return { state: 'failed', error: 'Video moderated or URL withheld' };
      }
      return {
        state: 'succeeded',
        outputs: [{
          kind: 'video',
          source: 'url',
          mime: 'video/mp4',
          data: json.video.url,
          expires_at: Date.now() + 24 * 3600_000,
          duration_s: json.video.duration,
        }],
      };
    }

    return { state: 'processing' };
  },

  async testCredential(ctx: AdapterContext): Promise<{ ok: boolean; message?: string }> {
    try {
      const res = await ctx.fetch(new Request(`${BASE}/models`, { method: 'GET' }));
      if (!res.ok) return { ok: false, message: `xAI API returned ${res.status}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, message: String(e) };
    }
  },
};
