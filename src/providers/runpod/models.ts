import type { ModelSpec } from '@shared/types';

export const runpodModels: ModelSpec[] = [
  // ── Public Endpoints (fixed schemas) ────────────────────────────
  {
    id: 'black-forest-labs-flux-1-dev',
    provider_id: 'runpod',
    label: 'FLUX.1 Dev',
    description: 'RunPod Public Endpoint - FLUX.1 Dev',
    capabilities: ['text2image'],
    params: {
      prompt: { type: 'string', label: 'Prompt', required: true, multiline: true },
      negative_prompt: { type: 'string', label: 'Negative Prompt', multiline: true, advanced: true },
      width: { type: 'integer', label: 'Width', default: 1024, min: 256, max: 2048, step: 64 },
      height: { type: 'integer', label: 'Height', default: 1024, min: 256, max: 2048, step: 64 },
      num_inference_steps: { type: 'integer', label: 'Steps', default: 28, min: 1, max: 50, advanced: true },
      guidance: { type: 'number', label: 'Guidance', default: 7.5, min: 0, max: 20, step: 0.5, advanced: true },
      seed: { type: 'integer', label: 'Seed', default: -1, min: -1, advanced: true, help: '-1 for random' },
      image_format: { type: 'enum', label: 'Format', default: 'jpeg', enum: ['jpeg', 'png'], advanced: true },
    },
    priceHint: '$0.02/megapixel',
  },
  {
    id: 'black-forest-labs-flux-1-schnell',
    provider_id: 'runpod',
    label: 'FLUX.1 Schnell',
    description: 'RunPod Public Endpoint - FLUX.1 Schnell (fast)',
    capabilities: ['text2image'],
    params: {
      prompt: { type: 'string', label: 'Prompt', required: true, multiline: true },
      negative_prompt: { type: 'string', label: 'Negative Prompt', multiline: true, advanced: true },
      width: { type: 'integer', label: 'Width', default: 1024, min: 256, max: 2048, step: 64 },
      height: { type: 'integer', label: 'Height', default: 1024, min: 256, max: 2048, step: 64 },
      num_inference_steps: { type: 'integer', label: 'Steps', default: 4, min: 1, max: 12, advanced: true },
      guidance: { type: 'number', label: 'Guidance', default: 7.5, min: 0, max: 20, step: 0.5, advanced: true },
      seed: { type: 'integer', label: 'Seed', default: -1, min: -1, advanced: true, help: '-1 for random' },
      image_format: { type: 'enum', label: 'Format', default: 'jpeg', enum: ['jpeg', 'png'], advanced: true },
    },
    priceHint: '$0.0024/megapixel',
  },
  {
    id: 'black-forest-labs-flux-1-kontext-dev',
    provider_id: 'runpod',
    label: 'FLUX.1 Kontext Dev',
    description: 'RunPod Public Endpoint - FLUX.1 Kontext Dev (image editing)',
    capabilities: ['image2image'],
    params: {
      prompt: { type: 'string', label: 'Prompt', required: true, multiline: true, help: 'Describe the desired edit' },
      image: { type: 'image', label: 'Input Image', required: true },
      width: { type: 'integer', label: 'Width', default: 1024, min: 256, max: 2048, step: 64, advanced: true },
      height: { type: 'integer', label: 'Height', default: 1024, min: 256, max: 2048, step: 64, advanced: true },
      num_inference_steps: { type: 'integer', label: 'Steps', default: 28, min: 1, max: 50, advanced: true },
      guidance: { type: 'number', label: 'Guidance', default: 7.5, min: 0, max: 20, step: 0.5, advanced: true },
      seed: { type: 'integer', label: 'Seed', default: -1, min: -1, advanced: true, help: '-1 for random' },
      image_format: { type: 'enum', label: 'Format', default: 'jpeg', enum: ['jpeg', 'png'], advanced: true },
    },
    priceHint: '$0.025/image',
  },

  // ── Custom Serverless Endpoint ──────────────────────────────────
  {
    id: 'runpod-custom-endpoint',
    provider_id: 'runpod',
    label: 'Custom Serverless Endpoint',
    description:
      'Run any RunPod serverless endpoint by providing the endpoint ID and raw JSON input',
    capabilities: ['text2image', 'image2image', 'text2video', 'image2video'],
    params: {
      endpoint_id: {
        type: 'string',
        label: 'Endpoint ID',
        required: true,
        placeholder: 'your-endpoint-id',
        help: 'The RunPod serverless endpoint ID from your dashboard',
      },
      input_json: {
        type: 'string',
        label: 'Input JSON',
        required: true,
        multiline: true,
        placeholder: '{"prompt": "a cat", "width": 1024, "height": 1024}',
        help: 'Raw JSON object to send as the "input" field',
      },
    },
    priceHint: 'Varies by endpoint',
  },
];
