import { describe, it, expect } from 'vitest';
import './all';
import { listAdapters } from './index';
import { getProvider } from '@shared/providers/registry';

describe('adapter conformance', () => {
  const adapters = listAdapters();

  it('has at least one adapter registered', () => {
    expect(adapters.length).toBeGreaterThan(0);
  });

  for (const adapter of adapters) {
    describe(adapter.spec.id, () => {
      it('spec matches registry', () => {
        const registered = getProvider(adapter.spec.id);
        expect(registered).toBeDefined();
        expect(adapter.spec.id).toBe(registered!.id);
      });

      it('has capabilities array', () => {
        expect(Array.isArray(adapter.capabilities)).toBe(true);
        expect(adapter.capabilities.length).toBeGreaterThan(0);
      });

      it('has required methods', () => {
        expect(typeof adapter.listModels).toBe('function');
        expect(typeof adapter.submit).toBe('function');
        expect(typeof adapter.poll).toBe('function');
      });

      it('spec has auth.help string', () => {
        expect(typeof adapter.spec.auth.help).toBe('string');
        expect(adapter.spec.auth.help.length).toBeGreaterThan(0);
      });

      it('spec has valid transport', () => {
        expect(['proxy', 'direct', 'local']).toContain(adapter.spec.transport);
      });

      it('proxy providers have at least one host', () => {
        if (adapter.spec.transport === 'proxy') {
          expect(adapter.spec.hosts.length).toBeGreaterThan(0);
        }
      });

      it('outputHosts has no redundant bare+wildcard pairs', () => {
        for (const h of adapter.spec.outputHosts) {
          if (h.startsWith('*.')) {
            const bare = h.slice(2);
            expect(adapter.spec.outputHosts).not.toContain(bare);
          }
        }
      });
    });
  }
});
