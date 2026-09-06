import type { ProviderAdapter } from '@shared/types';

const adapters = new Map<string, ProviderAdapter>();

export function registerAdapter(adapter: ProviderAdapter): void {
  adapters.set(adapter.spec.id, adapter);
}

export function getAdapter(id: string): ProviderAdapter | undefined {
  return adapters.get(id);
}

export function listAdapters(): ProviderAdapter[] {
  return [...adapters.values()];
}
