import { useState, useEffect, useCallback, useMemo } from 'react';
import { Play, Loader2, Film } from 'lucide-react';
import type { Capability, MediaInput, ModelSpec } from '@shared/types';
import { useModelsStore } from '../../stores/models';
import { useJobsStore } from '../../jobs/runner';
import { SchemaForm } from '../../components/SchemaForm';
import { ModelPicker } from '../../components/ModelPicker';
import { ResultCard } from '../../components/ResultCard';
import { JobTray } from '../../components/JobTray';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { onHotkey, isMac } from '../../lib/keyboard';

const VIDEO_CAPABILITIES: Capability[] = ['text2video', 'image2video', 'video2video', 'video_extend'];

const VIDEO_CAPABILITY_LABELS: Record<string, string> = {
  text2video: 'Text to Video',
  image2video: 'Image to Video',
  video2video: 'Video to Video',
  video_extend: 'Extend Video',
};

export function VideoPage() {
  const models = useModelsStore((s) => s.models);
  const loading = useModelsStore((s) => s.loading);

  const [capability, setCapability] = useState<Capability>('text2video');
  const [selectedProvider, setSelectedProvider] = useState<string>();
  const [selectedModel, setSelectedModel] = useState<string>();
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [mediaInputs, setMediaInputs] = useState<Record<string, MediaInput>>({});

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
    await submit({
      provider_id: selectedProvider,
      model_id: selectedModel,
      capability,
      params,
    });
  }, [model, selectedProvider, selectedModel, capability, params, submit]);

  useEffect(() => {
    return onHotkey('mod+enter', (e) => {
      e.preventDefault();
      handleSubmit();
    });
  }, [handleSubmit]);

  const succeededJobs = allJobs.filter(
    (j) => j.state === 'succeeded' && j.blobUrls && j.blobUrls.length > 0 &&
    VIDEO_CAPABILITIES.includes(j.capability),
  );
  const isRunning = activeJobs.length > 0;

  return (
    <div className="flex flex-col lg:flex-row h-full">
      <div className="lg:order-2 lg:w-[340px] xl:w-[380px] shrink-0 border-b lg:border-b-0 lg:border-l border-[var(--color-border-subtle)] bg-[var(--color-panel)] overflow-y-auto">
        <div className="p-4 flex flex-col gap-4">
          <div className="flex gap-1.5 flex-wrap">
            {VIDEO_CAPABILITIES.map((c) => (
              <button
                key={c}
                onClick={() => setCapability(c)}
                className={`px-2.5 py-1 rounded-[var(--radius-sm)] text-[var(--text-xs)] font-medium transition-colors ${
                  capability === c
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]'
                    : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
                }`}
              >
                {VIDEO_CAPABILITY_LABELS[c] ?? c}
              </button>
            ))}
          </div>

          <ModelPicker
            models={models}
            capability={capability}
            selectedProvider={selectedProvider}
            selectedModel={selectedModel}
            onSelect={(p, m) => { setSelectedProvider(p); setSelectedModel(m); setParams({}); }}
          />

          {model && (
            <>
              <SchemaForm
                params={model.params}
                values={params}
                onChange={setParams}
                mediaInputs={mediaInputs}
                onMediaInput={(field, input) => setMediaInputs((prev) => ({ ...prev, [field]: input }))}
              />

              {model.limits?.durations && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[var(--text-sm)] font-medium text-[var(--color-text-secondary)]">Duration</label>
                  <div className="flex flex-wrap gap-1.5">
                    {model.limits.durations.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => setParams((prev) => ({ ...prev, duration: d }))}
                        className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-[var(--text-sm)] transition-colors ${
                          params.duration === d
                            ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]'
                            : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
                        }`}
                      >
                        {d}s
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {model.limits?.resolutions && (
                <div className="flex flex-col gap-1.5">
                  <label className="text-[var(--text-sm)] font-medium text-[var(--color-text-secondary)]">Resolution</label>
                  <div className="flex flex-wrap gap-1.5">
                    {model.limits.resolutions.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => setParams((prev) => ({ ...prev, resolution: r }))}
                        className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-[var(--text-sm)] transition-colors ${
                          params.resolution === r
                            ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]'
                            : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
                        }`}
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {model?.pricing && (
            <div className="text-[var(--text-xs)] text-[var(--color-text-muted)]">
              ~{model.pricing.amount} {model.pricing.currency}/{model.pricing.unit}
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            onClick={handleSubmit}
            loading={isRunning}
            disabled={!model || loading}
            icon={isRunning ? <Loader2 size={18} className="animate-spin" /> : <Play size={18} />}
          >
            {isRunning ? 'Generating...' : 'Generate Video'}
            <kbd className="ml-1.5 px-1.5 py-0.5 rounded bg-white/20 text-[var(--text-xs)] font-normal">{isMac() ? '⌘' : 'Ctrl'}⏎</kbd>
          </Button>

          <JobTray />
        </div>
      </div>

      <div className="flex-1 min-w-0 overflow-y-auto p-4 lg:p-6">
        {succeededJobs.length === 0 ? (
          <EmptyState
            icon={Film}
            title={loading ? 'Loading models...' : 'No videos yet'}
            description="Generate a video to see results here"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {succeededJobs.flatMap((job) =>
              (job.blobUrls ?? []).map((_, i) => (
                <ResultCard key={`${job.id}-${i}`} job={job} index={i} />
              )),
            )}
          </div>
        )}
      </div>
    </div>
  );
}
