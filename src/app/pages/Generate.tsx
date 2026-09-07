import { useState, useEffect, useCallback, useMemo } from 'react';
import { Play, Loader2, History, Columns } from 'lucide-react';
import type { Capability, MediaInput, ModelSpec } from '@shared/types';
import { useModelsStore } from '../../stores/models';
import { useJobsStore, type Job } from '../../jobs/runner';
import { SchemaForm } from '../../components/SchemaForm';
import { ModelPicker } from '../../components/ModelPicker';
import { ResultCard } from '../../components/ResultCard';
import { CompareView } from '../../components/CompareView';
import { JobTray } from '../../components/JobTray';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { onHotkey, isMac } from '../../lib/keyboard';

const IMAGE_CAPABILITIES: Capability[] = ['text2image', 'image2image', 'inpaint', 'upscale', 'remove_bg'];

const CAPABILITY_LABELS: Record<string, string> = {
  text2image: 'Text to Image',
  image2image: 'Image to Image',
  inpaint: 'Inpaint',
  upscale: 'Upscale',
  remove_bg: 'Remove Background',
};

export function GeneratePage() {
  const models = useModelsStore((s) => s.models);
  const loading = useModelsStore((s) => s.loading);

  const [capability, setCapability] = useState<Capability>('text2image');
  const [selectedProvider, setSelectedProvider] = useState<string>();
  const [selectedModel, setSelectedModel] = useState<string>();
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [mediaInputs, setMediaInputs] = useState<Record<string, MediaInput>>({});
  const [batchCount, setBatchCount] = useState(1);
  const [compareSelection, setCompareSelection] = useState<{ job: Job; index: number }[]>([]);
  const [showCompare, setShowCompare] = useState(false);

  const submit = useJobsStore((s) => s.submit);
  const jobs = useJobsStore((s) => s.jobs);
  const allJobs = useMemo(() => [...jobs.values()].sort((a, b) => b.created_at - a.created_at), [jobs]);
  const activeJobs = useMemo(() => allJobs.filter((j) => j.state === 'queued' || j.state === 'submitted' || j.state === 'processing'), [allJobs]);

  const model: ModelSpec | undefined = useMemo(
    () => models.find((m) => m.provider_id === selectedProvider && m.id === selectedModel),
    [models, selectedProvider, selectedModel],
  );

  const capModels = useMemo(
    () => models.filter((m) => m.capabilities.includes(capability)),
    [models, capability],
  );

  useEffect(() => {
    if (!model && capModels.length > 0) {
      setSelectedProvider(capModels[0].provider_id);
      setSelectedModel(capModels[0].id);
    }
  }, [capModels, model]);

  useEffect(() => {
    if (model) {
      const defaults: Record<string, unknown> = {};
      for (const [key, schema] of Object.entries(model.params)) {
        if (schema.default !== undefined) defaults[key] = schema.default;
      }
      setParams((prev) => ({ ...defaults, ...prev }));
    }
  }, [model]);

  const handleSubmit = useCallback(async () => {
    if (!model || !selectedProvider || !selectedModel) return;
    for (let i = 0; i < batchCount; i++) {
      await submit({
        provider_id: selectedProvider,
        model_id: selectedModel,
        capability,
        params,
        n: 1,
      });
    }
  }, [model, selectedProvider, selectedModel, capability, params, batchCount, submit]);

  useEffect(() => {
    return onHotkey('mod+enter', (e) => {
      e.preventDefault();
      handleSubmit();
    });
  }, [handleSubmit]);

  const succeededJobs = allJobs.filter((j) => j.state === 'succeeded' && j.blobUrls && j.blobUrls.length > 0);
  const isRunning = activeJobs.length > 0;

  const handleCompareSelect = useCallback((job: Job, idx: number) => {
    setCompareSelection((prev) => {
      const key = `${job.id}-${idx}`;
      const exists = prev.findIndex((s) => `${s.job.id}-${s.index}` === key);
      if (exists >= 0) return prev.filter((_, i) => i !== exists);
      if (prev.length >= 2) return [{ job, index: idx }];
      return [...prev, { job, index: idx }];
    });
  }, []);

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Inspector panel (right on desktop, top on mobile) */}
      <div className="lg:order-2 lg:w-[340px] xl:w-[380px] shrink-0 border-b lg:border-b-0 lg:border-l border-[var(--color-border-subtle)] bg-[var(--color-panel)] overflow-y-auto">
        <div className="p-4 flex flex-col gap-5">
          <section>
            <h3 className="text-[var(--text-xs)] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Capability</h3>
            <div className="flex gap-1.5 flex-wrap">
              {IMAGE_CAPABILITIES.map((c) => (
                <button
                  key={c}
                  onClick={() => setCapability(c)}
                  className={`px-2.5 py-1 rounded-[var(--radius-sm)] text-[var(--text-xs)] font-medium transition-colors ${
                    capability === c
                      ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]'
                      : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
                  }`}
                >
                  {CAPABILITY_LABELS[c] ?? c}
                </button>
              ))}
            </div>
          </section>

          <section>
            <h3 className="text-[var(--text-xs)] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Model</h3>
            <ModelPicker
              models={models}
              capability={capability}
              selectedProvider={selectedProvider}
              selectedModel={selectedModel}
              onSelect={(p, m) => { setSelectedProvider(p); setSelectedModel(m); setParams({}); }}
            />
            {model?.pricing && (
              <div className="text-[var(--text-xs)] text-[var(--color-text-muted)] mt-1.5">
                ~{model.pricing.amount} {model.pricing.currency}/{model.pricing.unit}
              </div>
            )}
          </section>

          {model && (
            <section>
              <h3 className="text-[var(--text-xs)] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Prompt</h3>
              <SchemaForm
                params={model.params}
                values={params}
                onChange={setParams}
                mediaInputs={mediaInputs}
                onMediaInput={(field, input) => setMediaInputs((prev) => ({ ...prev, [field]: input }))}
              />
            </section>
          )}

          <section>
            <h3 className="text-[var(--text-xs)] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Advanced</h3>
            <div className="flex items-center gap-2">
              <label className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Batch</label>
              <div className="inline-flex rounded-[var(--radius-sm)] border border-[var(--color-border)] overflow-hidden">
                {[1, 2, 4].map((n) => (
                  <button
                    key={n}
                    onClick={() => setBatchCount(n)}
                    className={`px-3 py-1 text-[var(--text-sm)] font-medium transition-colors ${
                      batchCount === n
                        ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]'
                        : 'bg-[var(--color-bg)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-tertiary)]'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </section>

          <Button
            variant="primary"
            size="lg"
            className="w-full"
            onClick={handleSubmit}
            loading={isRunning}
            disabled={!model || loading}
            icon={isRunning ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
          >
            {isRunning ? 'Running...' : 'Generate'}
            <kbd className="ml-1.5 px-1.5 py-0.5 rounded bg-white/20 text-[var(--text-xs)] font-normal">
              {isMac() ? '⌘' : 'Ctrl'}⏎
            </kbd>
          </Button>

          <JobTray />
        </div>
      </div>

      {/* Result canvas */}
      <div className="flex-1 min-w-0 overflow-y-auto p-4 lg:p-6">
        {compareSelection.length === 2 && (
          <div className="mb-4 flex items-center gap-2">
            <Button
              variant="primary"
              size="sm"
              icon={<Columns size={14} />}
              onClick={() => setShowCompare(true)}
            >
              Compare selected
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCompareSelection([])}
            >
              Clear selection
            </Button>
          </div>
        )}
        {succeededJobs.length === 0 ? (
          <EmptyState
            icon={History}
            title={loading ? 'Loading models...' : 'No results yet'}
            description={loading ? 'Fetching available models from providers' : 'Generate an image to see results here'}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
            {succeededJobs.flatMap((job) =>
              (job.blobUrls ?? []).map((_, i) => (
                <ResultCard
                  key={`${job.id}-${i}`}
                  job={job}
                  index={i}
                  selected={compareSelection.some((s) => s.job.id === job.id && s.index === i)}
                  onSelect={handleCompareSelect}
                />
              )),
            )}
          </div>
        )}
      </div>

      {showCompare && compareSelection.length === 2 && (
        <CompareView
          items={[compareSelection[0], compareSelection[1]]}
          onClose={() => setShowCompare(false)}
        />
      )}
    </div>
  );
}
