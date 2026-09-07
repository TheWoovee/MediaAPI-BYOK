import { describe, it, expect, vi } from 'vitest';
import { isAllowedModel, WORKERS_AI_MODELS } from '@shared/providers/workers-ai-models';

describe('Workers AI route', () => {
  it('allows all models in the allowlist', () => {
    for (const model of WORKERS_AI_MODELS) {
      expect(isAllowedModel(model)).toBe(true);
    }
  });

  it('rejects models not in the allowlist', () => {
    expect(isAllowedModel('@cf/fake/model')).toBe(false);
    expect(isAllowedModel('gpt-4')).toBe(false);
    expect(isAllowedModel('')).toBe(false);
  });

  it('rejects models not starting with @cf/', () => {
    expect(isAllowedModel('black-forest-labs/flux-1-schnell')).toBe(false);
  });

  it('validates model id prefix check', () => {
    for (const model of WORKERS_AI_MODELS) {
      expect(model.startsWith('@cf/')).toBe(true);
    }
  });

  it('simulates AI binding returning JSON', async () => {
    const mockAI = {
      run: vi.fn().mockResolvedValue({ image: 'base64data' }),
    };
    const result = await mockAI.run('@cf/black-forest-labs/flux-1-schnell', { prompt: 'test' });
    expect(result).toEqual({ image: 'base64data' });
    expect(mockAI.run).toHaveBeenCalledWith('@cf/black-forest-labs/flux-1-schnell', { prompt: 'test' });
  });

  it('simulates AI binding returning stream for SD models', async () => {
    const stream = new ReadableStream();
    const mockAI = {
      run: vi.fn().mockResolvedValue(stream),
    };
    const result = await mockAI.run('@cf/stabilityai/stable-diffusion-xl-base-1.0', { prompt: 'test' });
    expect(result).toBeInstanceOf(ReadableStream);
  });
});
