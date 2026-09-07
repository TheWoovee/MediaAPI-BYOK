import type { ProviderAdapter, AdapterContext, GenerateRequest, JobHandle, JobStatus, ModelSpec, Capability, NormalizedOutput, MediaInput } from '@shared/types';
import { getProvider } from '@shared/providers/registry';
import { models, GPT_MODELS, DALLE_MODELS } from './models';

const spec = getProvider('openai')!;
const BASE = 'https://api.openai.com/v1';

function blobToDataUri(blob: Blob, data: ArrayBuffer): string {
  const bytes = new Uint8Array(data);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return `data:${blob.type || 'image/png'};base64,${btoa(binary)}`;
}

function mimeForFormat(fmt?: string): string {
  if (fmt === 'jpeg') return 'image/jpeg';
  if (fmt === 'webp') return 'image/webp';
  return 'image/png';
}

export const openaiAdapter: ProviderAdapter = {
  spec,
  capabilities: ['text2image', 'image2image', 'inpaint'] as Capability[],

  async listModels(_ctx: AdapterContext): Promise<ModelSpec[]> {
    return models;
  },

  async submit(req: GenerateRequest, ctx: AdapterContext): Promise<JobHandle> {
    const params = req.params as Record<string, unknown>;
    const model = req.model_id;
    const isGpt = GPT_MODELS.has(model);
    const isDalle = DALLE_MODELS.has(model);

    if (req.capability === 'text2image') {
      const body: Record<string, unknown> = {
        model,
        prompt: params.prompt,
      };
      if (params.size) body.size = params.size;
      if (params.quality) body.quality = params.quality;
      if (params.n) body.n = params.n;
      if (isGpt) {
        if (params.output_format) body.output_format = params.output_format;
        if (params.background) body.background = params.background;
        if (params.moderation) body.moderation = params.moderation;
      }
      if (isDalle && model === 'dall-e-3' && params.style) body.style = params.style;
      if (isDalle) body.response_format = 'b64_json';

      const res = await ctx.fetch(new Request(`${BASE}/images/generations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }));

      if (!res.ok) throw new Error(`OpenAI images/generations ${res.status}: ${await res.text()}`);
      const json = await res.json() as { data: { b64_json?: string; url?: string; revised_prompt?: string }[] };

      const outputMime = mimeForFormat(params.output_format as string);
      return {
        provider_id: spec.id, model_id: model, capability: req.capability,
        provider_ref: { sync: true, data: json.data, mime: outputMime },
        submitted_at: Date.now(),
      };
    }

    if (req.capability === 'image2image' || req.capability === 'inpaint') {
      const image = params.image as MediaInput | undefined;
      const mask = params.mask as MediaInput | undefined;

      if (isGpt) {
        const body: Record<string, unknown> = {
          model,
          prompt: params.prompt,
        };

        if (image?.blob) {
          const buf = await image.blob.arrayBuffer();
          body.images = [{ image_url: blobToDataUri(image.blob, buf) }];
        }
        if (mask?.blob) {
          const buf = await mask.blob.arrayBuffer();
          body.mask = { image_url: blobToDataUri(mask.blob, buf) };
        }
        if (params.size) body.size = params.size;
        if (params.quality) body.quality = params.quality;
        if (params.n) body.n = params.n;
        if (params.output_format) body.output_format = params.output_format;
        if (params.background) body.background = params.background;
        if (params.input_fidelity && model !== 'gpt-image-1-mini') body.input_fidelity = params.input_fidelity;

        const res = await ctx.fetch(new Request(`${BASE}/images/edits`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
        }));

        if (!res.ok) throw new Error(`OpenAI images/edits ${res.status}: ${await res.text()}`);
        const json = await res.json() as { data: { b64_json?: string }[] };

        const outputMime = mimeForFormat(params.output_format as string);
        return {
          provider_id: spec.id, model_id: model, capability: req.capability,
          provider_ref: { sync: true, data: json.data, mime: outputMime },
          submitted_at: Date.now(),
        };
      }

      const form = new FormData();
      form.append('model', model);
      form.append('prompt', params.prompt as string);
      if (image?.blob) form.append('image', image.blob, image.name ?? 'image.png');
      if (mask?.blob) form.append('mask', mask.blob, mask.name ?? 'mask.png');
      if (params.size) form.append('size', params.size as string);
      if (params.n) form.append('n', String(params.n));
      form.append('response_format', 'b64_json');

      const res = await ctx.fetch(new Request(`${BASE}/images/edits`, {
        method: 'POST',
        body: form,
      }));

      if (!res.ok) throw new Error(`OpenAI images/edits ${res.status}: ${await res.text()}`);
      const json = await res.json() as { data: { b64_json?: string; url?: string }[] };

      return {
        provider_id: spec.id, model_id: model, capability: req.capability,
        provider_ref: { sync: true, data: json.data, mime: 'image/png' },
        submitted_at: Date.now(),
      };
    }

    throw new Error(`Unsupported capability: ${req.capability}`);
  },

  async poll(h: JobHandle, _ctx: AdapterContext): Promise<JobStatus> {
    const ref = h.provider_ref as { sync: boolean; data: { b64_json?: string; url?: string }[]; mime: string };

    const outputs: NormalizedOutput[] = ref.data.map((item) => {
      if (item.b64_json) {
        return { kind: 'image' as const, source: 'base64' as const, mime: ref.mime, data: item.b64_json };
      }
      return { kind: 'image' as const, source: 'url' as const, mime: ref.mime, data: item.url!, expires_at: Date.now() + 3600_000 };
    });

    return { state: 'succeeded', outputs };
  },

  async testCredential(ctx: AdapterContext): Promise<{ ok: boolean; message?: string }> {
    try {
      const res = await ctx.fetch(new Request(`${BASE}/models`, { method: 'GET' }));
      if (!res.ok) return { ok: false, message: `OpenAI API returned ${res.status}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, message: String(e) };
    }
  },
};
