import { useMemo, useState } from 'react';
import { Search, ChevronDown } from 'lucide-react';
import type { ModelSpec, Capability } from '@shared/types';
import { providers } from '@shared/providers/registry';
import { Input } from './Input';

interface ModelPickerProps {
  models: ModelSpec[];
  capability: Capability;
  selectedProvider?: string;
  selectedModel?: string;
  onSelect(providerId: string, modelId: string): void;
}

export function ModelPicker({ models, capability, selectedProvider, selectedModel, onSelect }: ModelPickerProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const byCapability = models.filter((m) => m.capabilities.includes(capability));
    if (!search) return byCapability;
    const q = search.toLowerCase();
    return byCapability.filter(
      (m) => m.label.toLowerCase().includes(q) || m.id.toLowerCase().includes(q) || m.provider_id.toLowerCase().includes(q),
    );
  }, [models, capability, search]);

  const grouped = useMemo(() => {
    const groups = new Map<string, ModelSpec[]>();
    for (const m of filtered) {
      const list = groups.get(m.provider_id) ?? [];
      list.push(m);
      groups.set(m.provider_id, list);
    }
    return groups;
  }, [filtered]);

  const providerLabel = (id: string) => providers.find((p) => p.id === id)?.label ?? id;

  const selected = models.find((m) => m.provider_id === selectedProvider && m.id === selectedModel);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2 bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] text-left text-[var(--text-base)] hover:border-[var(--color-text-muted)] transition-colors"
      >
        <div className="flex-1 min-w-0">
          {selected ? (
            <div>
              <span className="font-medium">{selected.label}</span>
              <span className="text-[var(--color-text-muted)] ml-2 text-[var(--text-sm)]">
                {providerLabel(selected.provider_id)}
              </span>
            </div>
          ) : (
            <span className="text-[var(--color-text-muted)]">Select a model...</span>
          )}
        </div>
        <ChevronDown size={16} className={`shrink-0 text-[var(--color-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute top-full left-0 right-0 mt-1 bg-[var(--color-elevated)] border border-[var(--color-border)] rounded-[var(--radius-md)] shadow-[var(--shadow-lg)] overflow-hidden"
          style={{ zIndex: 'var(--z-overlay)', maxHeight: '380px' }}
        >
          <div className="p-2 border-b border-[var(--color-border-subtle)]">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search models..."
                className="!pl-8 !h-8"
                autoFocus
              />
            </div>
          </div>
          <div className="overflow-y-auto" style={{ maxHeight: '320px' }}>
            {grouped.size === 0 ? (
              <div className="px-3 py-4 text-center text-[var(--text-sm)] text-[var(--color-text-muted)]">
                No models available for this capability
              </div>
            ) : (
              [...grouped.entries()].map(([providerId, groupModels]) => (
                <div key={providerId}>
                  <div className="px-3 py-1.5 text-[var(--text-xs)] font-medium text-[var(--color-text-muted)] uppercase tracking-wider bg-[var(--color-bg-secondary)]">
                    {providerLabel(providerId)}
                  </div>
                  {groupModels.map((m) => (
                    <button
                      key={`${m.provider_id}-${m.id}`}
                      type="button"
                      onClick={() => {
                        onSelect(m.provider_id, m.id);
                        setOpen(false);
                        setSearch('');
                      }}
                      className={`w-full text-left px-3 py-2 text-[var(--text-sm)] hover:bg-[var(--color-bg-tertiary)] transition-colors flex items-center gap-2 ${
                        m.provider_id === selectedProvider && m.id === selectedModel
                          ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                          : 'text-[var(--color-text)]'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate">{m.label}</div>
                        {m.description && (
                          <div className="text-[var(--text-xs)] text-[var(--color-text-muted)] truncate">{m.description}</div>
                        )}
                      </div>
                      <div className="shrink-0 flex gap-1">
                        {m.capabilities.map((c) => (
                          <span
                            key={c}
                            className="px-1.5 py-0.5 text-[9px] font-medium rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]"
                          >
                            {c.replace(/2/g, '→')}
                          </span>
                        ))}
                      </div>
                      {m.priceHint && (
                        <span className="text-[var(--text-xs)] text-[var(--color-text-muted)] shrink-0">
                          {m.priceHint}
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
