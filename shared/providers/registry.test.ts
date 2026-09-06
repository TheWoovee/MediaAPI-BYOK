import { describe, it, expect } from 'vitest';
import { providers, getProvider, getAllProviderIds } from './registry';

const EXPECTED_IDS = [
  'xai', 'fal', 'google', 'openai', 'replicate', 'cf-workers-ai',
  'byteplus-ark', 'venice', 'kling', 'stability', 'bfl', 'hf-inference',
  'hf-space', 'runpod', 'minimax', 'runway', 'luma', 'ideogram',
  'recraft', 'leonardo', 'wavespeed', 'together', 'fireworks',
  'openai-compat', 'comfyui', 'a1111', 'swarmui',
];

describe('provider registry', () => {
  it('contains all expected providers', () => {
    const ids = getAllProviderIds();
    for (const expected of EXPECTED_IDS) {
      expect(ids, `missing provider: ${expected}`).toContain(expected);
    }
  });

  it('has unique ids', () => {
    const ids = getAllProviderIds();
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every spec has required fields', () => {
    for (const p of providers) {
      expect(p.label.length, `${p.id} label`).toBeGreaterThan(0);
      expect([1, 2, 3], `${p.id} wave`).toContain(p.wave);
      expect(['proxy', 'direct'], `${p.id} transport`).toContain(p.transport);
      expect(p.auth.header.length, `${p.id} auth.header`).toBeGreaterThan(0);
      expect(p.auth.help.length, `${p.id} auth.help`).toBeGreaterThan(0);
      expect(Array.isArray(p.hosts), `${p.id} hosts`).toBe(true);
      expect(Array.isArray(p.outputHosts), `${p.id} outputHosts`).toBe(true);
      expect(Array.isArray(p.inputModes), `${p.id} inputModes`).toBe(true);
      expect(p.inputModes.length, `${p.id} inputModes`).toBeGreaterThan(0);
    }
  });

  it('proxy providers have non-empty hosts (except openai-compat)', () => {
    for (const p of providers) {
      if (p.transport === 'proxy' && p.id !== 'openai-compat') {
        expect(p.hosts.length, `${p.id} should have hosts`).toBeGreaterThan(0);
      }
    }
  });

  it('auth config uses valid schemes', () => {
    const validSchemes = ['Bearer', 'Key', 'raw', 'jwt-hs256', undefined];
    for (const p of providers) {
      expect(validSchemes, `${p.id} scheme: ${p.auth.scheme}`).toContain(p.auth.scheme);
    }
  });

  it('getProvider returns correct spec', () => {
    const xai = getProvider('xai');
    expect(xai).toBeDefined();
    expect(xai!.label).toBe('xAI Grok Imagine');
    expect(getProvider('nonexistent')).toBeUndefined();
  });
});
