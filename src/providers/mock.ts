import type { ProviderAdapter, ProviderSpec, ModelSpec, GenerateRequest, JobHandle, JobStatus, AdapterContext } from '@shared/types';

const mockSpec: ProviderSpec = {
  id: 'mock',
  label: 'Mock Provider',
  wave: 1,
  transport: 'proxy',
  hosts: ['mock.test'],
  auth: { header: 'Authorization', scheme: 'Bearer', help: 'Any string' },
  outputHosts: [],
  inputModes: ['base64'],
  docsPath: '',
};

export const mockAdapter: ProviderAdapter = {
  spec: mockSpec,
  async listModels(_ctx: AdapterContext): Promise<ModelSpec[]> {
    return [
      {
        id: 'mock-image-1',
        label: 'Mock Image v1',
        capabilities: ['text2image'],
        params: {
          prompt: { type: 'string', label: 'Prompt', required: true },
          width: { type: 'integer', label: 'Width', default: 512, min: 256, max: 1024, step: 64 },
          height: { type: 'integer', label: 'Height', default: 512, min: 256, max: 1024, step: 64 },
        },
      },
    ];
  },
  async submit(_req: GenerateRequest, _ctx: AdapterContext): Promise<JobHandle> {
    return { provider_id: 'mock', provider_ref: { id: crypto.randomUUID() } };
  },
  async poll(_h: JobHandle, _ctx: AdapterContext): Promise<JobStatus> {
    const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    return {
      state: 'succeeded',
      outputs: [{ kind: 'image', source: 'base64', mime: 'image/png', data: pixel }],
    };
  },
};
