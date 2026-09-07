import type { ModelSpec, ParamSchema } from '@shared/types';

/** Static sampler list used when the server can't be reached (offline model list). */
export const DEFAULT_SAMPLERS = [
  'Euler a',
  'Euler',
  'LMS',
  'Heun',
  'DPM2',
  'DPM2 a',
  'DPM++ 2S a',
  'DPM++ 2M',
  'DPM++ SDE',
  'DPM++ 2M SDE',
  'DPM++ 3M SDE',
  'DPM fast',
  'DPM adaptive',
  'DDIM',
  'PLMS',
  'UniPC',
  'LMS Karras',
  'DPM2 Karras',
  'DPM2 a Karras',
  'DPM++ 2S a Karras',
  'DPM++ 2M Karras',
  'DPM++ SDE Karras',
  'DPM++ 2M SDE Karras',
];

export const DEFAULT_SCHEDULERS = ['Automatic', 'Uniform', 'Karras', 'Exponential', 'Polyexponential', 'SGM Uniform', 'KL Optimal'];

export const DEFAULT_UPSCALERS = ['Latent', 'Lanczos', 'Nearest', 'ESRGAN_4x', 'R-ESRGAN 4x+', 'R-ESRGAN 4x+ Anime6B', 'SwinIR 4x', 'LDSR'];

/** No safe static default exists for checkpoints (they're install-specific), so this stays empty offline. */
export const DEFAULT_CHECKPOINTS: string[] = [];

export interface ModelSpecOptions {
  checkpoints?: string[];
  samplers?: string[];
  schedulers?: string[];
  upscalers?: string[];
  isForge?: boolean;
}

const RELAY_TIMEOUT_WARNING =
  'A1111/Forge generation is synchronous end-to-end; in relay mode the whole request must finish inside the ~120s proxy timeout, so long batches or hires-fix runs can be cut off. Prefer direct local mode for slow jobs.';

function checkpointParam(checkpoints: string[]): ParamSchema {
  if (checkpoints.length > 0) {
    return {
      type: 'enum',
      label: 'Checkpoint',
      help: 'Model checkpoint to load before generating (sets override_settings.sd_model_checkpoint; restored afterwards).',
      enum: checkpoints,
    };
  }
  return {
    type: 'string',
    label: 'Checkpoint',
    help:
      'Model checkpoint filename or title, e.g. "v1-5-pruned.safetensors [6ce0161689]". Leave blank to use whatever is currently loaded. Reconnect to populate this as a dropdown.',
    placeholder: 'v1-5-pruned.safetensors [6ce0161689]',
  };
}

function samplerParam(samplers: string[]): ParamSchema {
  return {
    type: 'enum',
    label: 'Sampler',
    enum: samplers.length > 0 ? samplers : DEFAULT_SAMPLERS,
    default: 'Euler a',
  };
}

function schedulerParam(schedulers: string[]): ParamSchema {
  return {
    type: 'enum',
    label: 'Scheduler',
    enum: schedulers.length > 0 ? schedulers : DEFAULT_SCHEDULERS,
    default: 'Automatic',
  };
}

/**
 * Builds the three A1111/Forge ModelSpecs. Pass live values scraped from the server
 * (sd-models/samplers/schedulers/upscalers) to populate enums; omit to fall back to
 * static offline defaults.
 */
export function buildModelSpecs(opts: ModelSpecOptions = {}): ModelSpec[] {
  const checkpoints = opts.checkpoints ?? DEFAULT_CHECKPOINTS;
  const samplers = opts.samplers ?? DEFAULT_SAMPLERS;
  const schedulers = opts.schedulers ?? DEFAULT_SCHEDULERS;
  const upscalers = opts.upscalers ?? DEFAULT_UPSCALERS;
  const forgeNote = opts.isForge
    ? ' Detected a Forge backend (Flux distilled-CFG and split-checkpoint modules are supported).'
    : '';

  const txt2img: ModelSpec = {
    id: 'a1111-txt2img',
    provider_id: 'a1111',
    label: 'A1111/Forge Text to Image',
    description: `Synchronous txt2img via /sdapi/v1/txt2img.${forgeNote} ${RELAY_TIMEOUT_WARNING}`,
    capabilities: ['text2image'],
    params: {
      prompt: { type: 'string', label: 'Prompt', required: true, multiline: true },
      negative_prompt: { type: 'string', label: 'Negative prompt', multiline: true },
      sd_model_checkpoint: checkpointParam(checkpoints),
      width: { type: 'integer', label: 'Width', default: 512, min: 64, max: 2048, step: 64 },
      height: { type: 'integer', label: 'Height', default: 512, min: 64, max: 2048, step: 64 },
      steps: { type: 'integer', label: 'Steps', default: 20, min: 1, max: 150 },
      cfg_scale: { type: 'number', label: 'CFG scale', default: 7, min: 1, max: 30, step: 0.5 },
      sampler_name: samplerParam(samplers),
      scheduler: schedulerParam(schedulers),
      batch_size: { type: 'integer', label: 'Batch size', default: 1, min: 1, max: 8 },
      seed: { type: 'integer', label: 'Seed', default: -1, help: '-1 = random' },
      enable_hr: { type: 'boolean', label: 'Enable hires fix', default: false, advanced: true },
      hr_scale: {
        type: 'number',
        label: 'Hires scale',
        default: 2,
        min: 1,
        max: 4,
        step: 0.1,
        advanced: true,
        showWhen: { field: 'enable_hr', value: true },
      },
      hr_upscaler: {
        type: 'enum',
        label: 'Hires upscaler',
        enum: upscalers.length > 0 ? upscalers : DEFAULT_UPSCALERS,
        default: 'Latent',
        advanced: true,
        showWhen: { field: 'enable_hr', value: true },
      },
      denoising_strength: {
        type: 'number',
        label: 'Hires denoising strength',
        default: 0.7,
        min: 0,
        max: 1,
        step: 0.01,
        advanced: true,
        showWhen: { field: 'enable_hr', value: true },
        help: 'Only applies to the hires-fix second pass here; img2img has its own denoising_strength.',
      },
      distilled_cfg_scale: {
        type: 'number',
        label: 'Distilled CFG scale',
        default: 3.5,
        min: 0,
        max: 30,
        step: 0.1,
        advanced: true,
        help: 'Forge Flux checkpoints only; ignored by plain A1111/SD1.x/SDXL.',
      },
    },
  };

  const img2img: ModelSpec = {
    id: 'a1111-img2img',
    provider_id: 'a1111',
    label: 'A1111/Forge Image to Image',
    description: `Synchronous img2img / inpaint via /sdapi/v1/img2img.${forgeNote} ${RELAY_TIMEOUT_WARNING}`,
    capabilities: ['image2image', 'inpaint'],
    params: {
      image: { type: 'image', label: 'Input image', required: true },
      prompt: { type: 'string', label: 'Prompt', required: true, multiline: true },
      negative_prompt: { type: 'string', label: 'Negative prompt', multiline: true },
      sd_model_checkpoint: checkpointParam(checkpoints),
      width: { type: 'integer', label: 'Width', default: 512, min: 64, max: 2048, step: 64 },
      height: { type: 'integer', label: 'Height', default: 512, min: 64, max: 2048, step: 64 },
      steps: { type: 'integer', label: 'Steps', default: 20, min: 1, max: 150 },
      cfg_scale: { type: 'number', label: 'CFG scale', default: 7, min: 1, max: 30, step: 0.5 },
      sampler_name: samplerParam(samplers),
      scheduler: schedulerParam(schedulers),
      seed: { type: 'integer', label: 'Seed', default: -1, help: '-1 = random' },
      denoising_strength: { type: 'number', label: 'Denoising strength', default: 0.75, min: 0, max: 1, step: 0.05 },
      mask: {
        type: 'mask',
        label: 'Inpaint mask',
        help: 'White = regenerate, black = keep. Omit for plain img2img.',
      },
      inpainting_fill: {
        type: 'enum',
        label: 'Masked content',
        enum: ['fill', 'original', 'latent noise', 'latent nothing'],
        default: 'original',
        showWhen: { field: 'mask', value: true },
        help: 'What to put under the mask before diffusing: fill=blur, original=keep, latent noise/nothing=latent-space.',
      },
      mask_blur: {
        type: 'integer',
        label: 'Mask blur',
        default: 4,
        min: 0,
        max: 64,
        advanced: true,
        showWhen: { field: 'mask', value: true },
      },
      distilled_cfg_scale: {
        type: 'number',
        label: 'Distilled CFG scale',
        default: 3.5,
        min: 0,
        max: 30,
        step: 0.1,
        advanced: true,
        help: 'Forge Flux checkpoints only; ignored by plain A1111/SD1.x/SDXL.',
      },
    },
  };

  const upscale: ModelSpec = {
    id: 'a1111-upscale',
    provider_id: 'a1111',
    label: 'A1111/Forge Upscale',
    description: `Synchronous upscale via /sdapi/v1/extra-single-image.${forgeNote} ${RELAY_TIMEOUT_WARNING}`,
    capabilities: ['upscale'],
    params: {
      image: { type: 'image', label: 'Input image', required: true },
      upscaler_1: {
        type: 'enum',
        label: 'Upscaler',
        enum: upscalers.length > 0 ? upscalers : DEFAULT_UPSCALERS,
        default: 'R-ESRGAN 4x+',
      },
      upscaling_resize: { type: 'number', label: 'Resize factor', default: 2, min: 1, max: 4, step: 0.5 },
    },
  };

  return [txt2img, img2img, upscale];
}
