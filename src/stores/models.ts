import { create } from 'zustand';
import type { ModelSpec, ProviderAdapter, Capability } from '@shared/types';
import { listAdapters } from '../providers/index';

interface ModelsState {
  models: ModelSpec[];
  loading: boolean;
  error: string | null;
  loadModels(): Promise<void>;
  getModelsByCapability(cap: Capability): ModelSpec[];
  getModel(providerId: string, modelId: string): ModelSpec | undefined;
}

export const useModelsStore = create<ModelsState>((set, get) => ({
  models: [],
  loading: false,
  error: null,

  async loadModels() {
    if (get().loading) return;
    set({ loading: true, error: null });
    try {
      const adapters: ProviderAdapter[] = listAdapters();
      const all: ModelSpec[] = [];
      await Promise.allSettled(
        adapters.map(async (a) => {
          const ctx = {
            providerId: a.spec.id,
            fetch,
            resolveUrl: (u: string) => u,
            uploadTemp: async () => '',
            log: () => {},
          };
          const models = await a.listModels(ctx);
          all.push(...models);
        }),
      );
      set({ models: all, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  getModelsByCapability(cap: Capability) {
    return get().models.filter((m) => m.capabilities.includes(cap));
  },

  getModel(providerId: string, modelId: string) {
    return get().models.find((m) => m.provider_id === providerId && m.id === modelId);
  },
}));
