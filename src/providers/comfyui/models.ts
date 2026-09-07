import type { Capability, ModelSpec, ParamSchema } from '@shared/types';

import txt2imgWorkflow from './workflows/txt2img.json';
import img2imgWorkflow from './workflows/img2img.json';
import inpaintWorkflow from './workflows/inpaint.json';
import upscaleWorkflow from './workflows/upscale.json';
import image2videoWorkflow from './workflows/image2video.json';

/** A single node in an API-format ComfyUI workflow graph. */
export interface ApiWorkflowNode {
  inputs: Record<string, unknown>;
  class_type: string;
  _meta?: { title?: string };
}

/** An API-format ComfyUI workflow: object keyed by node id. */
export type ApiWorkflow = Record<string, ApiWorkflowNode>;

/** Maps a user-facing param name to the node/input it patches in the template. */
export interface ParamMapEntry {
  nodeId: string;
  inputKey: string;
}

export interface WorkflowTemplate {
  modelId: string;
  /** The API-format workflow graph, cloned before each submission. */
  workflow: ApiWorkflow;
  /** param name -> where to patch it in the graph. */
  paramMap: Record<string, ParamMapEntry>;
  /** Param names that carry a MediaInput (image/mask) and must be uploaded first. */
  mediaParams: string[];
  /** Param name used for random-seed handling, if any (usually 'seed'). */
  seedParam?: string;
  /** Param name that should receive GenerateRequest.n (batch count), if the template supports it. */
  batchParam?: string;
}

export const CUSTOM_MODEL_ID = 'comfyui-custom-workflow';

const STATIC_SAMPLERS = [
  'euler',
  'euler_cfg_pp',
  'euler_ancestral',
  'euler_ancestral_cfg_pp',
  'heun',
  'heunpp2',
  'dpm_2',
  'dpm_2_ancestral',
  'lms',
  'dpm_fast',
  'dpm_adaptive',
  'dpmpp_2s_ancestral',
  'dpmpp_sde',
  'dpmpp_sde_gpu',
  'dpmpp_2m',
  'dpmpp_2m_sde',
  'dpmpp_2m_sde_gpu',
  'dpmpp_3m_sde',
  'dpmpp_3m_sde_gpu',
  'ddpm',
  'lcm',
  'ddim',
  'uni_pc',
  'uni_pc_bh2',
];

const STATIC_SCHEDULERS = ['normal', 'karras', 'exponential', 'sgm_uniform', 'simple', 'ddim_uniform', 'beta', 'linear_quadratic'];

/** Dynamic dropdown values fetched from /object_info; falls back to static lists offline. */
export interface DynamicOptions {
  ckptNames: string[];
  samplerNames: string[];
  schedulers: string[];
  upscaleModels: string[];
}

export const OFFLINE_OPTIONS: DynamicOptions = {
  ckptNames: [],
  samplerNames: STATIC_SAMPLERS,
  schedulers: STATIC_SCHEDULERS,
  upscaleModels: [],
};

function enumParam(label: string, options: string[], opts: Partial<ParamSchema> = {}): ParamSchema {
  return { type: 'enum', label, enum: options, ...opts };
}

export const TEMPLATES: Record<string, WorkflowTemplate> = {
  'comfyui-txt2img': {
    modelId: 'comfyui-txt2img',
    workflow: txt2imgWorkflow as unknown as ApiWorkflow,
    paramMap: {
      prompt: { nodeId: '6', inputKey: 'text' },
      negative_prompt: { nodeId: '7', inputKey: 'text' },
      ckpt_name: { nodeId: '4', inputKey: 'ckpt_name' },
      width: { nodeId: '5', inputKey: 'width' },
      height: { nodeId: '5', inputKey: 'height' },
      steps: { nodeId: '3', inputKey: 'steps' },
      cfg: { nodeId: '3', inputKey: 'cfg' },
      sampler_name: { nodeId: '3', inputKey: 'sampler_name' },
      scheduler: { nodeId: '3', inputKey: 'scheduler' },
      seed: { nodeId: '3', inputKey: 'seed' },
      batch_size: { nodeId: '5', inputKey: 'batch_size' },
    },
    mediaParams: [],
    seedParam: 'seed',
    batchParam: 'batch_size',
  },
  'comfyui-img2img': {
    modelId: 'comfyui-img2img',
    workflow: img2imgWorkflow as unknown as ApiWorkflow,
    paramMap: {
      prompt: { nodeId: '6', inputKey: 'text' },
      negative_prompt: { nodeId: '7', inputKey: 'text' },
      ckpt_name: { nodeId: '4', inputKey: 'ckpt_name' },
      image: { nodeId: '10', inputKey: 'image' },
      width: { nodeId: '12', inputKey: 'width' },
      height: { nodeId: '12', inputKey: 'height' },
      steps: { nodeId: '3', inputKey: 'steps' },
      cfg: { nodeId: '3', inputKey: 'cfg' },
      sampler_name: { nodeId: '3', inputKey: 'sampler_name' },
      scheduler: { nodeId: '3', inputKey: 'scheduler' },
      seed: { nodeId: '3', inputKey: 'seed' },
      denoise: { nodeId: '3', inputKey: 'denoise' },
    },
    mediaParams: ['image'],
    seedParam: 'seed',
  },
  'comfyui-inpaint': {
    modelId: 'comfyui-inpaint',
    workflow: inpaintWorkflow as unknown as ApiWorkflow,
    paramMap: {
      prompt: { nodeId: '6', inputKey: 'text' },
      negative_prompt: { nodeId: '7', inputKey: 'text' },
      ckpt_name: { nodeId: '4', inputKey: 'ckpt_name' },
      image: { nodeId: '10', inputKey: 'image' },
      mask: { nodeId: '13', inputKey: 'image' },
      steps: { nodeId: '3', inputKey: 'steps' },
      cfg: { nodeId: '3', inputKey: 'cfg' },
      sampler_name: { nodeId: '3', inputKey: 'sampler_name' },
      scheduler: { nodeId: '3', inputKey: 'scheduler' },
      seed: { nodeId: '3', inputKey: 'seed' },
      denoise: { nodeId: '3', inputKey: 'denoise' },
    },
    mediaParams: ['image', 'mask'],
    seedParam: 'seed',
  },
  'comfyui-upscale': {
    modelId: 'comfyui-upscale',
    workflow: upscaleWorkflow as unknown as ApiWorkflow,
    paramMap: {
      image: { nodeId: '10', inputKey: 'image' },
      model_name: { nodeId: '15', inputKey: 'model_name' },
    },
    mediaParams: ['image'],
  },
  'comfyui-image2video': {
    modelId: 'comfyui-image2video',
    workflow: image2videoWorkflow as unknown as ApiWorkflow,
    paramMap: {
      prompt: { nodeId: '2', inputKey: 'text' },
      negative_prompt: { nodeId: '3', inputKey: 'text' },
      image: { nodeId: '6', inputKey: 'image' },
      steps: { nodeId: '8', inputKey: 'steps' },
      cfg: { nodeId: '8', inputKey: 'cfg' },
      seed: { nodeId: '8', inputKey: 'seed' },
    },
    mediaParams: ['image'],
    seedParam: 'seed',
  },
};

/**
 * Builds the ModelSpec[] returned by listModels(), filling enum options from
 * live /object_info data when available (dyn), or the static fallback lists.
 */
export function buildModelSpecs(dyn: DynamicOptions): ModelSpec[] {
  const providerId = 'comfyui';
  const ckptParam = (label = 'Checkpoint'): ParamSchema =>
    enumParam(label, dyn.ckptNames, { required: true, help: 'From /object_info/CheckpointLoaderSimple; empty if the server is offline.' });
  const samplerParam = (): ParamSchema => enumParam('Sampler', dyn.samplerNames, { default: 'euler' });
  const schedulerParam = (): ParamSchema => enumParam('Scheduler', dyn.schedulers, { default: 'normal' });

  const txt2img: ModelSpec = {
    id: 'comfyui-txt2img',
    provider_id: providerId,
    label: 'txt2img (SD1.5 / SDXL)',
    description: 'CheckpointLoaderSimple -> CLIPTextEncode x2 -> EmptyLatentImage -> KSampler -> VAEDecode -> SaveImage',
    capabilities: ['text2image'],
    params: {
      prompt: { type: 'string', label: 'Prompt', required: true, multiline: true },
      negative_prompt: { type: 'string', label: 'Negative prompt', multiline: true },
      ckpt_name: ckptParam(),
      width: { type: 'integer', label: 'Width', default: 512, min: 64, max: 8192, step: 8 },
      height: { type: 'integer', label: 'Height', default: 512, min: 64, max: 8192, step: 8 },
      steps: { type: 'integer', label: 'Steps', default: 20, min: 1, max: 150 },
      cfg: { type: 'number', label: 'CFG scale', default: 8, min: 0, max: 30, step: 0.1 },
      sampler_name: samplerParam(),
      scheduler: schedulerParam(),
      seed: { type: 'integer', label: 'Seed', default: -1, help: '-1 randomizes client-side' },
      batch_size: { type: 'integer', label: 'Batch size', default: 1, min: 1, max: 16 },
    },
  };

  const img2img: ModelSpec = {
    id: 'comfyui-img2img',
    provider_id: providerId,
    label: 'img2img (SD1.5 / SDXL)',
    description: 'LoadImage -> ImageScale -> VAEEncode -> KSampler(denoise) -> VAEDecode -> SaveImage',
    capabilities: ['image2image'],
    params: {
      prompt: { type: 'string', label: 'Prompt', required: true, multiline: true },
      negative_prompt: { type: 'string', label: 'Negative prompt', multiline: true },
      ckpt_name: ckptParam(),
      image: { type: 'image', label: 'Input image', required: true },
      width: { type: 'integer', label: 'Width', default: 512, min: 64, max: 8192, step: 8 },
      height: { type: 'integer', label: 'Height', default: 512, min: 64, max: 8192, step: 8 },
      steps: { type: 'integer', label: 'Steps', default: 20, min: 1, max: 150 },
      cfg: { type: 'number', label: 'CFG scale', default: 8, min: 0, max: 30, step: 0.1 },
      sampler_name: samplerParam(),
      scheduler: schedulerParam(),
      seed: { type: 'integer', label: 'Seed', default: -1, help: '-1 randomizes client-side' },
      denoise: { type: 'number', label: 'Denoise strength', default: 0.75, min: 0, max: 1, step: 0.01 },
    },
  };

  const inpaint: ModelSpec = {
    id: 'comfyui-inpaint',
    provider_id: providerId,
    label: 'Inpaint (SD1.5 / SDXL)',
    description: 'LoadImage + LoadImageMask -> VAEEncodeForInpaint -> KSampler -> VAEDecode -> SaveImage',
    capabilities: ['inpaint'],
    params: {
      prompt: { type: 'string', label: 'Prompt', required: true, multiline: true },
      negative_prompt: { type: 'string', label: 'Negative prompt', multiline: true },
      ckpt_name: ckptParam(),
      image: { type: 'image', label: 'Input image', required: true },
      mask: { type: 'mask', label: 'Mask (white = repaint)', required: true },
      steps: { type: 'integer', label: 'Steps', default: 20, min: 1, max: 150 },
      cfg: { type: 'number', label: 'CFG scale', default: 8, min: 0, max: 30, step: 0.1 },
      sampler_name: samplerParam(),
      scheduler: schedulerParam(),
      seed: { type: 'integer', label: 'Seed', default: -1, help: '-1 randomizes client-side' },
      denoise: { type: 'number', label: 'Denoise strength', default: 1, min: 0, max: 1, step: 0.01 },
    },
  };

  const upscale: ModelSpec = {
    id: 'comfyui-upscale',
    provider_id: providerId,
    label: 'Upscale (model-based)',
    description: 'LoadImage -> UpscaleModelLoader -> ImageUpscaleWithModel -> SaveImage',
    capabilities: ['upscale'],
    params: {
      image: { type: 'image', label: 'Input image', required: true },
      model_name: enumParam('Upscale model', dyn.upscaleModels, {
        required: true,
        help: 'From /object_info/UpscaleModelLoader; empty if the server is offline.',
      }),
    },
  };

  const image2video: ModelSpec = {
    id: 'comfyui-image2video',
    provider_id: providerId,
    label: 'image2video (Wan 2.x, unverified)',
    description:
      'LoadImage + CLIPTextEncode -> WanImageToVideo -> KSampler -> VAEDecode -> CreateVideo -> SaveVideo. Requires Wan model files and recent ComfyUI core nodes; unverified against a live server as of 2026-09-07.',
    capabilities: ['image2video'],
    params: {
      prompt: { type: 'string', label: 'Prompt', required: true, multiline: true },
      negative_prompt: { type: 'string', label: 'Negative prompt', multiline: true, advanced: true },
      image: { type: 'image', label: 'Start frame', required: true },
      steps: { type: 'integer', label: 'Steps', default: 20, min: 1, max: 150 },
      cfg: { type: 'number', label: 'CFG scale', default: 6, min: 0, max: 30, step: 0.1 },
      seed: { type: 'integer', label: 'Seed', default: -1, help: '-1 randomizes client-side' },
    },
  };

  const custom: ModelSpec = {
    id: CUSTOM_MODEL_ID,
    provider_id: providerId,
    label: 'Custom workflow (raw API JSON)',
    description: 'Paste an API-format ComfyUI workflow (File > Export (API Format)) and submit it directly.',
    capabilities: ['text2image', 'image2image', 'inpaint', 'upscale', 'text2video', 'image2video', 'video2video', 'video_extend'] as Capability[],
    params: {
      workflow_json: {
        type: 'string',
        label: 'Workflow JSON (API format)',
        required: true,
        multiline: true,
        help: 'Exported via "Export (API Format)" in the ComfyUI frontend. Node keys are numeric-string ids.',
      },
      prompt: { type: 'string', label: 'Prompt (optional patch)', multiline: true, advanced: true },
      prompt_node_id: { type: 'string', label: 'Prompt node id', advanced: true, help: 'Node id in workflow_json to patch the prompt into.' },
      prompt_input_key: { type: 'string', label: 'Prompt input key', default: 'text', advanced: true },
      seed: { type: 'integer', label: 'Seed (optional patch)', default: -1, advanced: true },
      seed_node_id: { type: 'string', label: 'Seed node id', advanced: true, help: 'Node id in workflow_json to patch the seed into.' },
      seed_input_key: { type: 'string', label: 'Seed input key', default: 'seed', advanced: true },
    },
  };

  return [txt2img, img2img, inpaint, upscale, image2video, custom];
}
