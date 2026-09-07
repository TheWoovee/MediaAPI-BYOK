import type { ModelSpec, ParamSchema } from '@shared/types';

const PROVIDER_ID = 'cf-workers-ai';

const promptParam: ParamSchema = { type: 'string', label: 'Prompt', required: true, placeholder: 'Describe the image…' };
const negPromptParam: ParamSchema = { type: 'string', label: 'Negative prompt', advanced: true };
const stepsParam = (max: number, def: number): ParamSchema => ({ type: 'integer', label: 'Steps', min: 1, max, default: def, advanced: true });
const guidanceParam: ParamSchema = { type: 'number', label: 'Guidance', min: 0, max: 20, step: 0.5, default: 7.5, advanced: true };
const seedParam: ParamSchema = { type: 'integer', label: 'Seed', min: 0, advanced: true };
const widthParam = (min: number, max: number, def: number): ParamSchema => ({ type: 'integer', label: 'Width', min, max, step: 64, default: def });
const heightParam = (min: number, max: number, def: number): ParamSchema => ({ type: 'integer', label: 'Height', min, max, step: 64, default: def });

export const SD_MODELS = new Set([
  '@cf/stabilityai/stable-diffusion-xl-base-1.0',
  '@cf/stabilityai/stable-diffusion-xl-lightning',
  '@cf/bytedance/stable-diffusion-xl-lightning',
  '@cf/lykon/dreamshaper-8-lcm',
  '@cf/runwayml/stable-diffusion-v1-5-img2img',
  '@cf/runwayml/stable-diffusion-v1-5-inpainting',
]);

export const models: ModelSpec[] = [
  {
    id: '@cf/black-forest-labs/flux-1-schnell',
    provider_id: PROVIDER_ID,
    label: 'FLUX.1 Schnell',
    description: 'Fast 4-step Flux model, ~58 neurons per 1024² image',
    capabilities: ['text2image'],
    params: { prompt: promptParam, steps: stepsParam(8, 4), seed: seedParam },
    priceHint: '~58 neurons/image (1024²), ~170 free/day',
  },
  {
    id: '@cf/black-forest-labs/flux-2-klein-4b',
    provider_id: PROVIDER_ID,
    label: 'FLUX.2 Klein 4B',
    description: 'BFL partner model, generation + editing',
    capabilities: ['text2image'],
    params: { prompt: promptParam, seed: seedParam },
    priceHint: '~105 neurons/image (1024²)',
  },
  {
    id: '@cf/black-forest-labs/flux-2-klein-9b',
    provider_id: PROVIDER_ID,
    label: 'FLUX.2 Klein 9B',
    description: 'BFL partner model, higher quality',
    capabilities: ['text2image'],
    params: { prompt: promptParam, seed: seedParam },
    priceHint: '~1364 neurons first MP',
  },
  {
    id: '@cf/black-forest-labs/flux-2-dev',
    provider_id: PROVIDER_ID,
    label: 'FLUX.2 Dev',
    description: 'BFL partner model, multi-reference editing',
    capabilities: ['text2image'],
    params: { prompt: promptParam, seed: seedParam },
    priceHint: '~56 neurons/step at 1024²',
  },
  {
    id: '@cf/leonardo/lucid-origin',
    provider_id: PROVIDER_ID,
    label: 'Leonardo Lucid Origin',
    description: 'Premium quality, high neuron cost',
    capabilities: ['text2image'],
    params: {
      prompt: promptParam,
      width: widthParam(64, 2500, 1120),
      height: heightParam(64, 2500, 1120),
      guidance: { type: 'number', label: 'Guidance', min: 0, max: 10, step: 0.5, default: 4.5, advanced: true },
      num_steps: stepsParam(40, 20),
      seed: seedParam,
    },
    priceHint: '~3000+ neurons/image; few free/day',
  },
  {
    id: '@cf/leonardo/phoenix-1.0',
    provider_id: PROVIDER_ID,
    label: 'Leonardo Phoenix 1.0',
    capabilities: ['text2image'],
    params: {
      prompt: promptParam,
      width: widthParam(64, 2500, 1120),
      height: heightParam(64, 2500, 1120),
      guidance: { type: 'number', label: 'Guidance', min: 0, max: 10, step: 0.5, default: 4.5, advanced: true },
      num_steps: stepsParam(40, 20),
      seed: seedParam,
    },
    priceHint: '~2500+ neurons/image',
  },
  {
    id: '@cf/stabilityai/stable-diffusion-xl-base-1.0',
    provider_id: PROVIDER_ID,
    label: 'SDXL Base 1.0',
    capabilities: ['text2image'],
    params: {
      prompt: promptParam,
      negative_prompt: negPromptParam,
      width: widthParam(256, 2048, 1024),
      height: heightParam(256, 2048, 1024),
      num_steps: stepsParam(20, 20),
      guidance: guidanceParam,
      seed: seedParam,
    },
  },
  {
    id: '@cf/stabilityai/stable-diffusion-xl-lightning',
    provider_id: PROVIDER_ID,
    label: 'SDXL Lightning',
    capabilities: ['text2image'],
    params: {
      prompt: promptParam,
      negative_prompt: negPromptParam,
      width: widthParam(256, 2048, 1024),
      height: heightParam(256, 2048, 1024),
      num_steps: stepsParam(20, 4),
      guidance: guidanceParam,
      seed: seedParam,
    },
  },
  {
    id: '@cf/lykon/dreamshaper-8-lcm',
    provider_id: PROVIDER_ID,
    label: 'DreamShaper 8 LCM',
    capabilities: ['text2image'],
    params: {
      prompt: promptParam,
      negative_prompt: negPromptParam,
      width: widthParam(256, 2048, 512),
      height: heightParam(256, 2048, 512),
      num_steps: stepsParam(20, 8),
      guidance: guidanceParam,
      seed: seedParam,
    },
  },
];
