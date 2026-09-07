import type { ModelSpec, ParamSchema } from '@shared/types';

const PROVIDER_ID = 'xai';

const promptParam: ParamSchema = { type: 'string', label: 'Prompt', required: true, placeholder: 'Describe the image…' };
const aspectRatioImage: ParamSchema = {
  type: 'enum', label: 'Aspect ratio',
  enum: ['1:1', '3:4', '4:3', '9:16', '16:9', '2:3', '3:2', '1:2', '2:1', '21:9', '5:2'],
  default: '1:1',
};
const aspectRatioVideo: ParamSchema = {
  type: 'enum', label: 'Aspect ratio',
  enum: ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'],
  default: '16:9',
};
const nParam: ParamSchema = { type: 'integer', label: 'Count', min: 1, max: 10, default: 1 };

export const models: ModelSpec[] = [
  {
    id: 'grok-imagine-image-2.0',
    provider_id: PROVIDER_ID,
    label: 'Grok Imagine Image 2.0',
    description: 'Latest xAI image generation, supports 1K/2K resolution',
    capabilities: ['text2image', 'image2image'],
    params: {
      prompt: promptParam,
      aspect_ratio: aspectRatioImage,
      resolution: { type: 'enum', label: 'Resolution', enum: ['1k', '2k'], default: '1k' },
      quality: { type: 'enum', label: 'Quality', enum: ['low', 'medium', 'auto'], default: 'auto' },
      n: nParam,
    },
    pricing: { unit: 'image', amount: 0.04, currency: 'USD' },
    priceHint: '$0.04-$0.08/image depending on resolution & quality',
  },
  {
    id: 'grok-imagine-image',
    provider_id: PROVIDER_ID,
    label: 'Grok Imagine Image',
    description: 'Standard xAI image generation',
    capabilities: ['text2image', 'image2image'],
    params: {
      prompt: promptParam,
      aspect_ratio: aspectRatioImage,
      n: nParam,
    },
    pricing: { unit: 'image', amount: 0.02, currency: 'USD' },
    priceHint: '$0.02/image output, $0.002/image input',
  },
  {
    id: 'grok-imagine-video-1.5',
    provider_id: PROVIDER_ID,
    label: 'Grok Imagine Video 1.5',
    description: 'Latest xAI video generation with audio support',
    capabilities: ['text2video', 'image2video', 'video_extend'],
    params: {
      prompt: promptParam,
      duration: { type: 'integer', label: 'Duration (s)', min: 1, max: 15, default: 6 },
      aspect_ratio: aspectRatioVideo,
      resolution: { type: 'enum', label: 'Resolution', enum: ['480p', '720p', '1080p'], default: '720p' },
      generate_audio: { type: 'boolean', label: 'Generate audio', default: true },
    },
    priceHint: '$0.08/s 480p, $0.14/s 720p, $0.25/s 1080p',
  },
  {
    id: 'grok-imagine-video',
    provider_id: PROVIDER_ID,
    label: 'Grok Imagine Video',
    description: 'Standard xAI video generation',
    capabilities: ['text2video', 'image2video', 'video_extend'],
    params: {
      prompt: promptParam,
      duration: { type: 'integer', label: 'Duration (s)', min: 1, max: 15, default: 6 },
      aspect_ratio: aspectRatioVideo,
      resolution: { type: 'enum', label: 'Resolution', enum: ['480p', '720p'], default: '720p' },
      generate_audio: { type: 'boolean', label: 'Generate audio', default: true },
    },
    priceHint: '$0.05/s 480p, $0.07/s 720p',
  },
];
