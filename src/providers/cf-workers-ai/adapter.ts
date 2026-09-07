import type { ProviderAdapter, AdapterContext, GenerateRequest, JobHandle, JobStatus, ModelSpec, Capability } from '@shared/types';
import { getProvider } from '@shared/providers/registry';
import { models, SD_MODELS } from './models';

const spec = getProvider('cf-workers-ai')!;

function useBinding(ctx: AdapterContext): boolean {
  return !ctx.credential;
}

function buildRestUrl(accountId: string, model: string): string {
  return `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`;
}

export const cfWorkersAiAdapter: ProviderAdapter = {
  spec,
  capabilities: ['text2image'] as Capability[],

  async listModels(_ctx: AdapterContext): Promise<ModelSpec[]> {
    return models;
  },

  async submit(req: GenerateRequest, ctx: AdapterContext): Promise<JobHandle> {
    const model = req.model_id;
    const params = req.params as Record<string, unknown>;

    const body: Record<string, unknown> = { prompt: params.prompt };
    if (params.negative_prompt) body.negative_prompt = params.negative_prompt;
    if (params.steps != null) body.steps = params.steps;
    if (params.num_steps != null) body.num_steps = params.num_steps;
    if (params.width != null) body.width = params.width;
    if (params.height != null) body.height = params.height;
    if (params.guidance != null) body.guidance = params.guidance;
    if (params.seed != null) body.seed = params.seed;
    if (params.strength != null) body.strength = params.strength;

    let response: Response;

    if (useBinding(ctx)) {
      const url = ctx.resolveUrl(`/api/ai/run/${model}`);
      response = await ctx.fetch(new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }));
    } else {
      const credential = ctx.credential!;
      const parts = credential.split(':');
      let accountId: string;
      if (parts.length >= 2) {
        accountId = parts[0];
      } else {
        throw new Error('Credential must be in format accountId:token for REST API access');
      }

      const url = buildRestUrl(accountId, model);
      response = await ctx.fetch(new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }));
    }

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Workers AI error ${response.status}: ${text}`);
    }

    const isSD = SD_MODELS.has(model);

    if (isSD) {
      const buf = await response.arrayBuffer();
      return {
        provider_id: spec.id,
        model_id: model,
        capability: req.capability,
        provider_ref: { sync: true, bytes: buf, mime: 'image/png' },
        submitted_at: Date.now(),
      };
    }

    const json = await response.json() as { image?: string; result?: { image?: string }; success?: boolean; errors?: unknown[] };

    let base64: string | undefined;
    if (json.image) {
      base64 = json.image;
    } else if (json.result?.image) {
      base64 = json.result.image;
    }

    if (!base64) {
      throw new Error('No image returned from Workers AI');
    }

    return {
      provider_id: spec.id,
      model_id: model,
      capability: req.capability,
      provider_ref: { sync: true, base64 },
      submitted_at: Date.now(),
    };
  },

  async poll(h: JobHandle, _ctx: AdapterContext): Promise<JobStatus> {
    const ref = h.provider_ref as { sync: boolean; base64?: string; bytes?: ArrayBuffer; mime?: string };

    if (ref.bytes) {
      const uint8 = new Uint8Array(ref.bytes);
      let binary = '';
      for (let i = 0; i < uint8.length; i++) {
        binary += String.fromCharCode(uint8[i]);
      }
      const b64 = btoa(binary);
      return {
        state: 'succeeded',
        outputs: [{ kind: 'image', source: 'base64', mime: ref.mime ?? 'image/png', data: b64 }],
      };
    }

    return {
      state: 'succeeded',
      outputs: [{ kind: 'image', source: 'base64', mime: 'image/png', data: ref.base64! }],
    };
  },

  async testCredential(ctx: AdapterContext): Promise<{ ok: boolean; message?: string }> {
    try {
      if (useBinding(ctx)) {
        const url = ctx.resolveUrl('/api/ai/run/@cf/black-forest-labs/flux-1-schnell');
        const response = await ctx.fetch(new Request(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ prompt: 'test', steps: 4, width: 256, height: 256 }),
        }));
        if (!response.ok) return { ok: false, message: `Binding test failed: ${response.status}` };
        return { ok: true };
      }

      const credential = ctx.credential!;
      const parts = credential.split(':');
      if (parts.length < 2) {
        return { ok: false, message: 'Credential must be in format accountId:token' };
      }
      const accountId = parts[0];
      const url = buildRestUrl(accountId, '@cf/black-forest-labs/flux-1-schnell');
      const response = await ctx.fetch(new Request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prompt: 'test', steps: 4, width: 256, height: 256 }),
      }));
      if (!response.ok) return { ok: false, message: `REST API test failed: ${response.status}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, message: String(e) };
    }
  },
};
