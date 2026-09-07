import type { ModelSpec } from '@shared/types';

/** Mapping from HF model repo ID to the inference provider route on the HF router. */
export const providerMapping: Record<string, { provider: string; providerId: string }> = {
  'black-forest-labs/FLUX.1-dev': { provider: 'fal-ai', providerId: 'fal-ai/flux/dev' },
  'black-forest-labs/FLUX.1-schnell': { provider: 'fal-ai', providerId: 'fal-ai/flux/schnell' },
  'stabilityai/stable-diffusion-3-medium-diffusers': {
    provider: 'hf-inference',
    providerId: 'stabilityai/stable-diffusion-3-medium-diffusers',
  },
  'black-forest-labs/FLUX.1-Kontext-dev': { provider: 'fal-ai', providerId: 'fal-ai/flux-pro/kontext' },
  'Wan-AI/Wan2.2-TI2V-5B': { provider: 'fal-ai', providerId: 'fal-ai/wan/v2.2-5b/text-to-video' },
  'tencent/HunyuanVideo': { provider: 'fal-ai', providerId: 'fal-ai/hunyuan-video' },
};

const fluxImageParams: Record<string, import('@shared/types').ParamSchema> = {
  prompt: { type: 'string', label: 'Prompt', required: true, multiline: true },
  width: { type: 'integer', label: 'Width', default: 1024, min: 256, max: 1536, step: 64 },
  height: { type: 'integer', label: 'Height', default: 1024, min: 256, max: 1536, step: 64 },
  guidance_scale: { type: 'number', label: 'Guidance Scale', default: 3.5, min: 0, max: 20, step: 0.5, advanced: true },
  num_inference_steps: { type: 'integer', label: 'Steps', default: 28, min: 1, max: 50, advanced: true },
  seed: { type: 'integer', label: 'Seed', min: 0, advanced: true },
};

export const models: ModelSpec[] = [
  // --- text-to-image ---
  {
    id: 'black-forest-labs/FLUX.1-dev',
    provider_id: 'hf-inference',
    label: 'FLUX.1 Dev (via HF)',
    description: 'FLUX.1 Dev routed through HF Inference Providers (fal-ai backend)',
    capabilities: ['text2image'],
    params: { ...fluxImageParams },
    priceHint: 'Provider rate (no HF markup)',
  },
  {
    id: 'black-forest-labs/FLUX.1-schnell',
    provider_id: 'hf-inference',
    label: 'FLUX.1 Schnell (via HF)',
    description: 'FLUX.1 Schnell routed through HF Inference Providers (fal-ai backend). Fastest FLUX variant.',
    capabilities: ['text2image'],
    params: {
      prompt: { type: 'string', label: 'Prompt', required: true, multiline: true },
      width: { type: 'integer', label: 'Width', default: 1024, min: 256, max: 1536, step: 64 },
      height: { type: 'integer', label: 'Height', default: 1024, min: 256, max: 1536, step: 64 },
      num_inference_steps: { type: 'integer', label: 'Steps', default: 4, min: 1, max: 12, advanced: true },
      seed: { type: 'integer', label: 'Seed', min: 0, advanced: true },
    },
    priceHint: 'Provider rate (no HF markup)',
  },
  {
    id: 'stabilityai/stable-diffusion-3-medium-diffusers',
    provider_id: 'hf-inference',
    label: 'Stable Diffusion 3 Medium (via HF)',
    description: 'SD3 Medium via native HF Inference API. Synchronous, returns raw image bytes.',
    capabilities: ['text2image'],
    params: {
      prompt: { type: 'string', label: 'Prompt', required: true, multiline: true },
      negative_prompt: { type: 'string', label: 'Negative Prompt', multiline: true, advanced: true },
      guidance_scale: { type: 'number', label: 'Guidance Scale', default: 7, min: 0, max: 20, step: 0.5, advanced: true },
      num_inference_steps: { type: 'integer', label: 'Steps', default: 28, min: 1, max: 50, advanced: true },
      seed: { type: 'integer', label: 'Seed', min: 0, advanced: true },
    },
    priceHint: 'Free tier available',
  },

  // --- image-to-image ---
  {
    id: 'black-forest-labs/FLUX.1-Kontext-dev',
    provider_id: 'hf-inference',
    label: 'FLUX.1 Kontext Dev (via HF)',
    description: 'FLUX.1 Kontext for image editing / image-to-image via HF Inference Providers (fal-ai backend)',
    capabilities: ['image2image'],
    params: {
      prompt: { type: 'string', label: 'Prompt', required: true, multiline: true },
      image: { type: 'image', label: 'Input Image', required: true },
      guidance_scale: { type: 'number', label: 'Guidance Scale', default: 3.5, min: 0, max: 20, step: 0.5, advanced: true },
      num_inference_steps: { type: 'integer', label: 'Steps', default: 28, min: 1, max: 50, advanced: true },
      seed: { type: 'integer', label: 'Seed', min: 0, advanced: true },
    },
    priceHint: 'Provider rate (no HF markup)',
  },

  // --- text-to-video ---
  {
    id: 'Wan-AI/Wan2.2-TI2V-5B',
    provider_id: 'hf-inference',
    label: 'Wan 2.2 T2V 5B (via HF)',
    description: 'Wan 2.2 text-to-video 5B parameter model via HF Inference Providers (fal-ai backend)',
    capabilities: ['text2video'],
    params: {
      prompt: { type: 'string', label: 'Prompt', required: true, multiline: true },
      num_frames: { type: 'integer', label: 'Frames', default: 81, min: 16, max: 129, step: 1, advanced: true },
      fps: { type: 'integer', label: 'FPS', default: 16, min: 8, max: 30, advanced: true },
      seed: { type: 'integer', label: 'Seed', min: 0, advanced: true },
    },
    priceHint: 'Provider rate (no HF markup)',
  },
  {
    id: 'tencent/HunyuanVideo',
    provider_id: 'hf-inference',
    label: 'HunyuanVideo (via HF)',
    description: 'Tencent HunyuanVideo text-to-video via HF Inference Providers (fal-ai backend)',
    capabilities: ['text2video'],
    params: {
      prompt: { type: 'string', label: 'Prompt', required: true, multiline: true },
      width: { type: 'integer', label: 'Width', default: 854, min: 256, max: 1280, step: 64, advanced: true },
      height: { type: 'integer', label: 'Height', default: 480, min: 256, max: 720, step: 64, advanced: true },
      num_frames: { type: 'integer', label: 'Frames', default: 49, min: 16, max: 129, step: 1, advanced: true },
      seed: { type: 'integer', label: 'Seed', min: 0, advanced: true },
    },
    priceHint: 'Provider rate (no HF markup)',
  },
];
