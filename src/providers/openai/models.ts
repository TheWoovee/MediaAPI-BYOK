import type { ModelSpec, ParamSchema } from '@shared/types';

const PROVIDER_ID = 'openai';

const promptParam: ParamSchema = { type: 'string', label: 'Prompt', required: true, placeholder: 'Describe the image…' };

const qualityGpt: ParamSchema = { type: 'enum', label: 'Quality', enum: ['low', 'medium', 'high', 'auto'], default: 'auto' };
const outputFormat: ParamSchema = { type: 'enum', label: 'Format', enum: ['png', 'jpeg', 'webp'], default: 'png', advanced: true };
const backgroundParam: ParamSchema = { type: 'enum', label: 'Background', enum: ['opaque', 'transparent', 'auto'], default: 'opaque', advanced: true };
const moderationParam: ParamSchema = { type: 'enum', label: 'Moderation', enum: ['auto', 'low'], default: 'auto', advanced: true };

export const models: ModelSpec[] = [
  {
    id: 'gpt-image-2',
    provider_id: PROVIDER_ID,
    label: 'GPT Image 2',
    description: 'Latest OpenAI image model with free-form sizing up to 3840x2160',
    capabilities: ['text2image', 'image2image', 'inpaint'],
    params: {
      prompt: promptParam,
      size: { type: 'enum', label: 'Size', enum: ['1024x1024', '1536x1024', '1024x1536', 'auto'], default: 'auto' },
      quality: qualityGpt,
      output_format: outputFormat,
      background: backgroundParam,
      moderation: moderationParam,
      n: { type: 'integer', label: 'Count', min: 1, max: 10, default: 1 },
    },
    priceHint: 'Token-based pricing; see OpenAI calculator',
  },
  {
    id: 'gpt-image-1.5',
    provider_id: PROVIDER_ID,
    label: 'GPT Image 1.5',
    description: 'Default OpenAI image model',
    capabilities: ['text2image', 'image2image', 'inpaint'],
    params: {
      prompt: promptParam,
      size: { type: 'enum', label: 'Size', enum: ['1024x1024', '1536x1024', '1024x1536', 'auto'], default: 'auto' },
      quality: qualityGpt,
      output_format: outputFormat,
      background: backgroundParam,
      input_fidelity: { type: 'enum', label: 'Input fidelity', enum: ['high', 'low'], default: 'low', advanced: true },
      n: { type: 'integer', label: 'Count', min: 1, max: 10, default: 1 },
    },
    priceHint: 'Token-based pricing',
  },
  {
    id: 'gpt-image-1',
    provider_id: PROVIDER_ID,
    label: 'GPT Image 1',
    capabilities: ['text2image', 'image2image', 'inpaint'],
    params: {
      prompt: promptParam,
      size: { type: 'enum', label: 'Size', enum: ['1024x1024', '1536x1024', '1024x1536', 'auto'], default: 'auto' },
      quality: qualityGpt,
      output_format: outputFormat,
      input_fidelity: { type: 'enum', label: 'Input fidelity', enum: ['high', 'low'], default: 'low', advanced: true },
      n: { type: 'integer', label: 'Count', min: 1, max: 10, default: 1 },
    },
    priceHint: 'Token-based pricing',
  },
  {
    id: 'gpt-image-1-mini',
    provider_id: PROVIDER_ID,
    label: 'GPT Image 1 Mini',
    description: 'Cheapest GPT image model',
    capabilities: ['text2image', 'image2image', 'inpaint'],
    params: {
      prompt: promptParam,
      size: { type: 'enum', label: 'Size', enum: ['1024x1024', '1536x1024', '1024x1536', 'auto'], default: 'auto' },
      quality: qualityGpt,
      output_format: outputFormat,
      n: { type: 'integer', label: 'Count', min: 1, max: 10, default: 1 },
    },
    priceHint: 'Cheapest GPT image model',
  },
  {
    id: 'dall-e-3',
    provider_id: PROVIDER_ID,
    label: 'DALL-E 3',
    description: 'Legacy model, n=1 only',
    capabilities: ['text2image'],
    params: {
      prompt: promptParam,
      size: { type: 'enum', label: 'Size', enum: ['1024x1024', '1792x1024', '1024x1792'], default: '1024x1024' },
      quality: { type: 'enum', label: 'Quality', enum: ['standard', 'hd'], default: 'standard' },
      style: { type: 'enum', label: 'Style', enum: ['vivid', 'natural'], default: 'vivid', advanced: true },
    },
    limits: { maxImages: 1 },
    priceHint: 'Legacy pricing',
  },
  {
    id: 'dall-e-2',
    provider_id: PROVIDER_ID,
    label: 'DALL-E 2',
    description: 'Legacy model',
    capabilities: ['text2image', 'image2image'],
    params: {
      prompt: promptParam,
      size: { type: 'enum', label: 'Size', enum: ['256x256', '512x512', '1024x1024'], default: '1024x1024' },
      n: { type: 'integer', label: 'Count', min: 1, max: 10, default: 1 },
    },
    priceHint: 'Legacy pricing',
  },
];

export const GPT_MODELS = new Set(['gpt-image-2', 'gpt-image-1.5', 'gpt-image-1', 'gpt-image-1-mini']);
export const DALLE_MODELS = new Set(['dall-e-3', 'dall-e-2']);
