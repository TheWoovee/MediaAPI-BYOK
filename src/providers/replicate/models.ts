import type { ModelSpec, ParamSchema } from '@shared/types';

/* ── shared param fragments ─────────────────────────────────── */

const prompt: ParamSchema = {
  type: 'string',
  label: 'Prompt',
  required: true,
  placeholder: 'Describe the image or video you want to create',
  multiline: true,
};

const negativePrompt: ParamSchema = {
  type: 'string',
  label: 'Negative prompt',
  help: 'Things to exclude from the output',
  multiline: true,
  advanced: true,
};

const seed: ParamSchema = {
  type: 'integer',
  label: 'Seed',
  help: 'Random seed for reproducibility',
  advanced: true,
};

const imageInput: ParamSchema = {
  type: 'image',
  label: 'Input image',
  required: true,
  accept: 'image/png,image/jpeg,image/webp',
};

const optionalImageInput: ParamSchema = {
  type: 'image',
  label: 'Input image',
  accept: 'image/png,image/jpeg,image/webp',
};

const maskInput: ParamSchema = {
  type: 'mask',
  label: 'Mask',
  required: true,
  accept: 'image/png,image/jpeg,image/webp',
  help: 'White areas will be regenerated',
};

const aspectRatio: ParamSchema = {
  type: 'enum',
  label: 'Aspect ratio',
  default: '1:1',
  options: [
    { value: '1:1', label: '1:1' },
    { value: '16:9', label: '16:9' },
    { value: '9:16', label: '9:16' },
    { value: '4:3', label: '4:3' },
    { value: '3:4', label: '3:4' },
    { value: '3:2', label: '3:2' },
    { value: '2:3', label: '2:3' },
    { value: '21:9', label: '21:9' },
    { value: '9:21', label: '9:21' },
  ],
};

const numOutputs: ParamSchema = {
  type: 'integer',
  label: 'Number of outputs',
  default: 1,
  min: 1,
  max: 4,
  advanced: true,
};

const guidanceScale: ParamSchema = {
  type: 'number',
  label: 'Guidance scale',
  default: 3.5,
  min: 0,
  max: 20,
  step: 0.5,
  advanced: true,
};

const numInferenceSteps: ParamSchema = {
  type: 'integer',
  label: 'Inference steps',
  default: 28,
  min: 1,
  max: 50,
  advanced: true,
};

/* ── model catalog ──────────────────────────────────────────── */

export const models: ModelSpec[] = [
  /* ── Image models ──────────────────────────────────────── */
  {
    id: 'black-forest-labs/flux-schnell',
    provider_id: 'replicate',
    label: 'FLUX Schnell',
    description: 'Fastest FLUX variant. 1-4 steps, great for drafts.',
    capabilities: ['text2image'],
    priceHint: '~$0.003/image',
    pricing: { unit: 'image', amount: 0.003, currency: 'USD' },
    limits: { maxImages: 4 },
    params: {
      prompt,
      aspect_ratio: aspectRatio,
      num_outputs: numOutputs,
      seed,
      num_inference_steps: { ...numInferenceSteps, default: 4, max: 4 },
    },
  },
  {
    id: 'black-forest-labs/flux-dev',
    provider_id: 'replicate',
    label: 'FLUX Dev',
    description: 'High-quality open model. Supports text-to-image and image-to-image.',
    capabilities: ['text2image', 'image2image'],
    priceHint: '~$0.025/image',
    pricing: { unit: 'image', amount: 0.025, currency: 'USD' },
    limits: { maxImages: 4 },
    params: {
      prompt,
      image: { ...optionalImageInput, showWhen: { field: 'capability', value: 'image2image' } },
      prompt_strength: {
        type: 'number',
        label: 'Prompt strength',
        help: 'How much to transform the input image (image-to-image)',
        default: 0.8,
        min: 0,
        max: 1,
        step: 0.05,
        showWhen: { field: 'capability', value: 'image2image' },
      },
      aspect_ratio: aspectRatio,
      num_outputs: numOutputs,
      guidance: guidanceScale,
      num_inference_steps: numInferenceSteps,
      seed,
    },
  },
  {
    id: 'black-forest-labs/flux-1.1-pro',
    provider_id: 'replicate',
    label: 'FLUX 1.1 Pro',
    description: 'High-quality commercial model. Fast inference with excellent prompt following.',
    capabilities: ['text2image'],
    priceHint: '~$0.04/image',
    pricing: { unit: 'image', amount: 0.04, currency: 'USD' },
    params: {
      prompt,
      aspect_ratio: aspectRatio,
      width: { type: 'integer', label: 'Width', min: 256, max: 1440, step: 32, advanced: true },
      height: { type: 'integer', label: 'Height', min: 256, max: 1440, step: 32, advanced: true },
      safety_tolerance: {
        type: 'integer',
        label: 'Safety tolerance',
        default: 2,
        min: 1,
        max: 5,
        advanced: true,
      },
      seed,
    },
  },
  {
    id: 'black-forest-labs/flux-1.1-pro-ultra',
    provider_id: 'replicate',
    label: 'FLUX 1.1 Pro Ultra',
    description: 'Highest-resolution FLUX model. Up to 4MP output.',
    capabilities: ['text2image'],
    priceHint: '~$0.06/image',
    pricing: { unit: 'image', amount: 0.06, currency: 'USD' },
    params: {
      prompt,
      aspect_ratio: aspectRatio,
      raw: {
        type: 'boolean',
        label: 'Raw mode',
        help: 'Generate less processed, more natural-looking images',
        default: false,
        advanced: true,
      },
      safety_tolerance: {
        type: 'integer',
        label: 'Safety tolerance',
        default: 2,
        min: 1,
        max: 5,
        advanced: true,
      },
      seed,
    },
  },
  {
    id: 'black-forest-labs/flux-kontext-pro',
    provider_id: 'replicate',
    label: 'FLUX Kontext Pro',
    description: 'Context-aware image editing. Transform images with text instructions.',
    capabilities: ['image2image'],
    priceHint: '~$0.04/image',
    pricing: { unit: 'image', amount: 0.04, currency: 'USD' },
    params: {
      prompt,
      input_image: imageInput,
      aspect_ratio: aspectRatio,
      safety_tolerance: {
        type: 'integer',
        label: 'Safety tolerance',
        default: 2,
        min: 1,
        max: 5,
        advanced: true,
      },
      seed,
    },
  },
  {
    id: 'black-forest-labs/flux-kontext-max',
    provider_id: 'replicate',
    label: 'FLUX Kontext Max',
    description: 'Highest-quality context-aware editing. Best prompt following.',
    capabilities: ['image2image'],
    priceHint: '~$0.08/image',
    pricing: { unit: 'image', amount: 0.08, currency: 'USD' },
    params: {
      prompt,
      input_image: imageInput,
      aspect_ratio: aspectRatio,
      safety_tolerance: {
        type: 'integer',
        label: 'Safety tolerance',
        default: 2,
        min: 1,
        max: 5,
        advanced: true,
      },
      seed,
    },
  },
  {
    id: 'black-forest-labs/flux-fill-pro',
    provider_id: 'replicate',
    label: 'FLUX Fill Pro',
    description: 'Inpainting with FLUX. Paint over areas to regenerate.',
    capabilities: ['inpaint'],
    priceHint: 'price unverified',
    params: {
      prompt,
      image: imageInput,
      mask: maskInput,
      seed,
    },
  },
  {
    id: 'black-forest-labs/flux-2-pro',
    provider_id: 'replicate',
    label: 'FLUX 2 Pro',
    description: 'Next-gen FLUX. Supports both text-to-image and image-to-image.',
    capabilities: ['text2image', 'image2image'],
    priceHint: '~$0.055/image',
    pricing: { unit: 'image', amount: 0.055, currency: 'USD' },
    params: {
      prompt,
      image: { ...optionalImageInput, showWhen: { field: 'capability', value: 'image2image' } },
      prompt_strength: {
        type: 'number',
        label: 'Prompt strength',
        default: 0.8,
        min: 0,
        max: 1,
        step: 0.05,
        showWhen: { field: 'capability', value: 'image2image' },
      },
      aspect_ratio: aspectRatio,
      guidance: guidanceScale,
      safety_tolerance: {
        type: 'integer',
        label: 'Safety tolerance',
        default: 2,
        min: 1,
        max: 5,
        advanced: true,
      },
      seed,
    },
  },
  {
    id: 'bytedance/seedream-5-lite',
    provider_id: 'replicate',
    label: 'Seedream 5 Lite',
    description: 'ByteDance Seedream text-to-image. Balanced quality and speed.',
    capabilities: ['text2image'],
    priceHint: '~$0.035/image',
    pricing: { unit: 'image', amount: 0.035, currency: 'USD' },
    params: {
      prompt,
      negative_prompt: negativePrompt,
      aspect_ratio: aspectRatio,
      num_outputs: numOutputs,
      seed,
    },
  },

  /* ── Video models ──────────────────────────────────────── */
  {
    id: 'google/veo-3.1',
    provider_id: 'replicate',
    label: 'Veo 3.1',
    description: 'Google Veo 3.1. High-quality video generation with audio.',
    capabilities: ['text2video', 'image2video'],
    priceHint: '$0.20-0.40/s',
    limits: { durations: [5, 8] },
    params: {
      prompt,
      image: { ...optionalImageInput, showWhen: { field: 'capability', value: 'image2video' } },
      duration: {
        type: 'enum',
        label: 'Duration',
        default: '5',
        options: [
          { value: '5', label: '5s' },
          { value: '8', label: '8s' },
        ],
        unit: 's',
      },
      aspect_ratio: {
        ...aspectRatio,
        options: [
          { value: '16:9', label: '16:9' },
          { value: '9:16', label: '9:16' },
        ],
        default: '16:9',
      },
      seed,
    },
  },
  {
    id: 'google/veo-3.1-fast',
    provider_id: 'replicate',
    label: 'Veo 3.1 Fast',
    description: 'Google Veo 3.1 fast variant. Lower cost, faster generation.',
    capabilities: ['text2video', 'image2video'],
    priceHint: '$0.10-0.15/s',
    limits: { durations: [5, 8] },
    params: {
      prompt,
      image: { ...optionalImageInput, showWhen: { field: 'capability', value: 'image2video' } },
      duration: {
        type: 'enum',
        label: 'Duration',
        default: '5',
        options: [
          { value: '5', label: '5s' },
          { value: '8', label: '8s' },
        ],
        unit: 's',
      },
      aspect_ratio: {
        ...aspectRatio,
        options: [
          { value: '16:9', label: '16:9' },
          { value: '9:16', label: '9:16' },
        ],
        default: '16:9',
      },
      seed,
    },
  },
  {
    id: 'wan-video/wan-2.7-t2v',
    provider_id: 'replicate',
    label: 'Wan 2.7 T2V',
    description: 'Wan video text-to-video generation.',
    capabilities: ['text2video'],
    priceHint: '~$0.10/s',
    limits: { durations: [5] },
    params: {
      prompt,
      negative_prompt: negativePrompt,
      aspect_ratio: {
        ...aspectRatio,
        options: [
          { value: '16:9', label: '16:9' },
          { value: '9:16', label: '9:16' },
          { value: '1:1', label: '1:1' },
        ],
        default: '16:9',
      },
      num_frames: {
        type: 'integer',
        label: 'Number of frames',
        default: 81,
        min: 17,
        max: 129,
        step: 4,
        advanced: true,
      },
      guidance_scale: { ...guidanceScale, default: 5.0 },
      seed,
    },
  },
  {
    id: 'kwaivgi/kling-v2.5-turbo-pro',
    provider_id: 'replicate',
    label: 'Kling v2.5 Turbo Pro',
    description: 'Kuaishou Kling video generation. Text and image to video.',
    capabilities: ['text2video', 'image2video'],
    priceHint: '~$0.35/5s clip',
    limits: { durations: [5, 10] },
    params: {
      prompt,
      image: { ...optionalImageInput, showWhen: { field: 'capability', value: 'image2video' } },
      negative_prompt: negativePrompt,
      duration: {
        type: 'enum',
        label: 'Duration',
        default: '5',
        options: [
          { value: '5', label: '5s' },
          { value: '10', label: '10s' },
        ],
        unit: 's',
      },
      aspect_ratio: {
        ...aspectRatio,
        options: [
          { value: '16:9', label: '16:9' },
          { value: '9:16', label: '9:16' },
          { value: '1:1', label: '1:1' },
        ],
        default: '16:9',
      },
      seed,
    },
  },
  {
    id: 'bytedance/seedance-1-pro',
    provider_id: 'replicate',
    label: 'Seedance 1 Pro',
    description: 'ByteDance Seedance video generation. Text and image to video.',
    capabilities: ['text2video', 'image2video'],
    priceHint: 'price varies',
    params: {
      prompt,
      image: { ...optionalImageInput, showWhen: { field: 'capability', value: 'image2video' } },
      duration: {
        type: 'enum',
        label: 'Duration',
        default: '5',
        options: [
          { value: '5', label: '5s' },
          { value: '10', label: '10s' },
        ],
        unit: 's',
      },
      aspect_ratio: {
        ...aspectRatio,
        options: [
          { value: '16:9', label: '16:9' },
          { value: '9:16', label: '9:16' },
          { value: '1:1', label: '1:1' },
        ],
        default: '16:9',
      },
      seed,
    },
  },
];
