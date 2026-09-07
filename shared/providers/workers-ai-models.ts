export const WORKERS_AI_MODELS = [
  '@cf/black-forest-labs/flux-1-schnell',
  '@cf/black-forest-labs/flux-2-klein-4b',
  '@cf/black-forest-labs/flux-2-klein-9b',
  '@cf/black-forest-labs/flux-2-dev',
  '@cf/leonardo/lucid-origin',
  '@cf/leonardo/phoenix-1.0',
  '@cf/stabilityai/stable-diffusion-xl-base-1.0',
  '@cf/stabilityai/stable-diffusion-xl-lightning',
  '@cf/runwayml/stable-diffusion-v1-5-inpainting',
  '@cf/runwayml/stable-diffusion-v1-5-img2img',
  '@cf/bytedance/stable-diffusion-xl-lightning',
  '@cf/lykon/dreamshaper-8-lcm',
] as const;

export type WorkersAiModelId = (typeof WORKERS_AI_MODELS)[number];

const allowSet = new Set<string>(WORKERS_AI_MODELS);

export function isAllowedModel(model: string): boolean {
  return allowSet.has(model);
}
