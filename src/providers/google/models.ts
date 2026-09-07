import type { ModelSpec, ParamSchema } from '@shared/types';

const PROVIDER_ID = 'google';

const promptParam: ParamSchema = { type: 'string', label: 'Prompt', required: true, placeholder: 'Describe what you want…' };

const imageAspectRatio: ParamSchema = {
  type: 'enum', label: 'Aspect ratio',
  enum: ['1:1', '1:4', '4:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
  default: '1:1',
};
const imageSize: ParamSchema = {
  type: 'enum', label: 'Image size',
  enum: ['512', '1K', '2K', '4K'],
  default: '1K',
};

const videoAspectRatio: ParamSchema = {
  type: 'enum', label: 'Aspect ratio',
  enum: ['16:9', '9:16'],
  default: '16:9',
};

export const models: ModelSpec[] = [
  {
    id: 'gemini-3.1-flash-image',
    provider_id: PROVIDER_ID,
    label: 'Nano Banana 2',
    description: 'Latest Gemini image model, up to 4K',
    capabilities: ['text2image', 'image2image'],
    params: {
      prompt: promptParam,
      aspectRatio: imageAspectRatio,
      imageSize: imageSize,
    },
    priceHint: '~$0.045 (512) to $0.151 (4K) per image',
  },
  {
    id: 'gemini-3.1-flash-lite-image',
    provider_id: PROVIDER_ID,
    label: 'Nano Banana 2 Lite',
    description: 'Cheaper, faster Gemini image model',
    capabilities: ['text2image', 'image2image'],
    params: {
      prompt: promptParam,
      aspectRatio: {
        type: 'enum', label: 'Aspect ratio',
        enum: ['1:1', '2:3', '3:2', '3:4', '4:3', '4:5', '5:4', '9:16', '16:9', '21:9'],
        default: '1:1',
      },
      imageSize: { type: 'enum', label: 'Image size', enum: ['512', '1K', '2K', '4K'], default: '1K' },
    },
    priceHint: 'Lower than Nano Banana 2',
  },
  {
    id: 'gemini-2.5-flash-image',
    provider_id: PROVIDER_ID,
    label: 'Nano Banana (Legacy)',
    description: 'Original Gemini image model, migrate to Lite',
    capabilities: ['text2image', 'image2image'],
    params: {
      prompt: promptParam,
      aspectRatio: imageAspectRatio,
    },
    priceHint: '~$0.039/image',
  },
  {
    id: 'veo-3.1-generate-preview',
    provider_id: PROVIDER_ID,
    label: 'Veo 3.1',
    description: 'Premium video generation with audio, up to 4K',
    capabilities: ['text2video', 'image2video', 'video_extend'],
    params: {
      prompt: promptParam,
      aspectRatio: videoAspectRatio,
      resolution: { type: 'enum', label: 'Resolution', enum: ['720p', '1080p', '4k'], default: '1080p' },
      durationSeconds: { type: 'enum', label: 'Duration', enum: ['4', '6', '8'], default: '8' },
      negativePrompt: { type: 'string', label: 'Negative prompt', advanced: true },
      personGeneration: { type: 'enum', label: 'People', enum: ['allow_adult', 'dont_allow'], default: 'allow_adult', advanced: true },
    },
    priceHint: '$0.40/s (720p/1080p), $0.60/s (4K)',
  },
  {
    id: 'veo-3.1-fast-generate-preview',
    provider_id: PROVIDER_ID,
    label: 'Veo 3.1 Fast',
    description: 'Faster, cheaper Veo video generation',
    capabilities: ['text2video', 'image2video', 'video_extend'],
    params: {
      prompt: promptParam,
      aspectRatio: videoAspectRatio,
      resolution: { type: 'enum', label: 'Resolution', enum: ['720p', '1080p', '4k'], default: '1080p' },
      durationSeconds: { type: 'enum', label: 'Duration', enum: ['4', '6', '8'], default: '8' },
      negativePrompt: { type: 'string', label: 'Negative prompt', advanced: true },
      personGeneration: { type: 'enum', label: 'People', enum: ['allow_adult', 'dont_allow'], default: 'allow_adult', advanced: true },
    },
    priceHint: '$0.10/s 720p, $0.12/s 1080p, $0.30/s 4K',
  },
  {
    id: 'veo-3.1-lite-generate-preview',
    provider_id: PROVIDER_ID,
    label: 'Veo 3.1 Lite',
    description: 'Budget video model, 720p/1080p only, no extend',
    capabilities: ['text2video', 'image2video'],
    params: {
      prompt: promptParam,
      aspectRatio: videoAspectRatio,
      resolution: { type: 'enum', label: 'Resolution', enum: ['720p', '1080p'], default: '720p' },
      durationSeconds: { type: 'enum', label: 'Duration', enum: ['4', '6', '8'], default: '8' },
      negativePrompt: { type: 'string', label: 'Negative prompt', advanced: true },
      personGeneration: { type: 'enum', label: 'People', enum: ['allow_adult', 'dont_allow'], default: 'allow_adult', advanced: true },
    },
    priceHint: '$0.05/s 720p, $0.08/s 1080p',
  },
];

export const VEO_MODELS = new Set([
  'veo-3.1-generate-preview',
  'veo-3.1-fast-generate-preview',
  'veo-3.1-lite-generate-preview',
]);

export const GEMINI_IMAGE_MODELS = new Set([
  'gemini-3.1-flash-image',
  'gemini-3.1-flash-lite-image',
  'gemini-3-pro-image-preview',
  'gemini-2.5-flash-image',
]);
