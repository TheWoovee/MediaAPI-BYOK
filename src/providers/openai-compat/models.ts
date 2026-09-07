import type { ModelSpec, ParamSchema } from '@shared/types';

const PROVIDER_ID = 'openai-compat';

const promptParam: ParamSchema = { type: 'string', label: 'Prompt', required: true, placeholder: 'Describe the image…' };

export const defaultModels: ModelSpec[] = [
  {
    id: 'default',
    provider_id: PROVIDER_ID,
    label: 'Default Model',
    description: 'Uses whatever model the server defaults to',
    capabilities: ['text2image'],
    params: {
      prompt: promptParam,
      model: { type: 'string', label: 'Model ID', help: 'Model identifier to send to the server', advanced: true },
      size: { type: 'string', label: 'Size', placeholder: '1024x1024', advanced: true },
      n: { type: 'integer', label: 'Count', min: 1, max: 10, default: 1 },
    },
  },
];
