import type { ProviderAdapter, AdapterContext, GenerateRequest, JobHandle, JobStatus, ModelSpec, Capability, NormalizedOutput } from '@shared/types';
import { getProvider } from '@shared/providers/registry';
import { defaultModels } from './models';

const spec = getProvider('openai-compat')!;

export const openaiCompatAdapter: ProviderAdapter = {
  spec,
  capabilities: ['text2image'] as Capability[],

  async listModels(ctx: AdapterContext): Promise<ModelSpec[]> {
    try {
      const res = await ctx.fetch(new Request(ctx.resolveUrl('/v1/models'), { method: 'GET' }));
      if (res.ok) {
        const json = await res.json() as { data?: { id: string }[] };
        if (json.data && json.data.length > 0) {
          return json.data.map((m) => ({
            id: m.id,
            provider_id: spec.id,
            label: m.id,
            capabilities: ['text2image'] as Capability[],
            params: {
              prompt: { type: 'string' as const, label: 'Prompt', required: true },
              size: { type: 'string' as const, label: 'Size', placeholder: '1024x1024', advanced: true },
              n: { type: 'integer' as const, label: 'Count', min: 1, max: 10, default: 1 },
            },
          }));
        }
      }
    } catch {
      // fall through to defaults
    }
    return defaultModels;
  },

  async submit(req: GenerateRequest, ctx: AdapterContext): Promise<JobHandle> {
    const params = req.params as Record<string, unknown>;

    const body: Record<string, unknown> = {
      prompt: params.prompt,
      response_format: 'b64_json',
    };

    const modelId = (params.model as string) || req.model_id;
    if (modelId && modelId !== 'default') body.model = modelId;

    if (params.size) body.size = params.size;
    if (params.n) body.n = params.n;

    const res = await ctx.fetch(new Request(ctx.resolveUrl('/v1/images/generations'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }));

    if (!res.ok) throw new Error(`OpenAI-compat server ${res.status}: ${await res.text()}`);
    const json = await res.json() as { data: { b64_json?: string; url?: string }[] };

    return {
      provider_id: spec.id, model_id: modelId, capability: req.capability,
      provider_ref: { sync: true, data: json.data },
      submitted_at: Date.now(),
    };
  },

  async poll(h: JobHandle, _ctx: AdapterContext): Promise<JobStatus> {
    const ref = h.provider_ref as { sync: boolean; data: { b64_json?: string; url?: string }[] };

    const outputs: NormalizedOutput[] = ref.data.map((item) => {
      if (item.b64_json) {
        return { kind: 'image' as const, source: 'base64' as const, mime: 'image/png', data: item.b64_json };
      }
      return { kind: 'image' as const, source: 'url' as const, mime: 'image/png', data: item.url! };
    });

    return { state: 'succeeded', outputs };
  },

  async testCredential(ctx: AdapterContext): Promise<{ ok: boolean; message?: string }> {
    try {
      const res = await ctx.fetch(new Request(ctx.resolveUrl('/v1/models'), { method: 'GET' }));
      if (!res.ok) return { ok: false, message: `Server returned ${res.status}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, message: String(e) };
    }
  },
};
