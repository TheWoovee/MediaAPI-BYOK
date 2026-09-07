import type { ModelSpec } from '@shared/types';

export const models: ModelSpec[] = [
  {
    id: 'hf-space-custom',
    provider_id: 'hf-space',
    label: 'Space by URL',
    description:
      'Connect to any Gradio Space on Hugging Face. Parameters are discovered from the Space API.',
    capabilities: ['text2image', 'image2image', 'text2video', 'image2video'],
    params: {
      space_id: {
        type: 'string',
        label: 'Space ID',
        required: true,
        placeholder: 'owner/space-name',
        help: 'Hugging Face Space ID (e.g., black-forest-labs/FLUX.1-schnell)',
      },
      api_name: {
        type: 'string',
        label: 'API Endpoint',
        required: true,
        default: '/infer',
        placeholder: '/infer',
        help: 'The Gradio API endpoint name',
      },
    },
    priceHint: 'Free (ZeroGPU quota)',
  },
];
