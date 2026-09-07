import { create } from 'zustand';
import type { ModelSpec, ProviderAdapter, Capability } from '@shared/types';
import { listAdapters } from '../providers/index';

interface ProviderStatus {
  loading: boolean;
  error?: string;
}

interface ModelsState {
  models: ModelSpec[];
  loading: boolean;
  providerStatus: Record<string, ProviderStatus>;
  error: string | null;
  loadModels(): Promise<void>;
  getModelsByCapability(cap: Capability): ModelSpec[];
  getModel(providerId: string, modelId: string): ModelSpec | undefined;
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  models: [],
  loading: false,
  providerStatus: {},
  error: null,

  async loadModels() {
    if (get().loading) return;
    const adapters: ProviderAdapter[] = listAdapters();

    const status: Record<string, ProviderStatus> = {};
    for (const a of adapters) status[a.spec.id] = { loading: true };
    set({ loading: true, error: null, providerStatus: status });

    await Promise.allSettled(
      adapters.map(async (a) => {
        const ctx = {
          providerId: a.spec.id,
          fetch,
          resolveUrl: (u: string) => u,
          uploadTemp: async () => '',
          log: () => {},
        };
        try {
          const models = await a.listModels(ctx);
          set((s) => ({
            models: [...s.models, ...models],
            providerStatus: { ...s.providerStatus, [a.spec.id]: { loading: false } },
          }));
        } catch (e) {
          set((s) => ({
            providerStatus: {
              ...s.providerStatus,
              [a.spec.id]: { loading: false, error: (e as Error).message },
            },
          }));
        }
      }),
    );

    set({ loading: false });
  },

  getModelsByCapability(cap: Capability) {
    return get().models.filter((m) => m.capabilities.includes(cap));
  },

  getModel(providerId: string, modelId: string) {
    return get().models.find((m) => m.provider_id === providerId && m.id === modelId);
  },
}));
