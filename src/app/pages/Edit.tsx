import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Paintbrush, Eraser, RotateCcw, Download } from 'lucide-react';
import type { Capability, MediaInput, ModelSpec } from '@shared/types';
import { useModelsStore } from '../../stores/models';
import { useJobsStore } from '../../jobs/runner';
import { SchemaForm } from '../../components/SchemaForm';
import { ModelPicker } from '../../components/ModelPicker';
import { DropZone } from '../../components/DropZone';
import { ResultCard } from '../../components/ResultCard';
import { Button } from '../../components/Button';
import * as SliderPrimitive from '@radix-ui/react-slider';

const EDIT_CAPABILITIES: Capability[] = ['inpaint', 'image2image', 'upscale', 'remove_bg'];

export function EditPage() {
  const models = useModelsStore((s) => s.models);
  const [capability, setCapability] = useState<Capability>('inpaint');
  const [selectedProvider, setSelectedProvider] = useState<string>();
  const [selectedModel, setSelectedModel] = useState<string>();
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [sourceImage, setSourceImage] = useState<MediaInput | null>(null);
  const [mediaInputs, setMediaInputs] = useState<Record<string, MediaInput>>({});

  // Mask painting state
  const [brushSize, setBrushSize] = useState(30);
  const [isErasing, setIsErasing] = useState(false);
  const [painting, setPainting] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const maskRef = useRef<HTMLCanvasElement>(null);

  const submit = useJobsStore((s) => s.submit);
  const jobs = useJobsStore((s) => s.jobs);
  const allJobs = useMemo(() => [...jobs.values()].sort((a, b) => b.created_at - a.created_at), [jobs]);

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

  const handleSourceDrop = useCallback((input: MediaInput) => {
    setSourceImage(input);
    const url = URL.createObjectURL(input.blob);
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      const mask = maskRef.current;
      if (!canvas || !mask) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      mask.width = img.naturalWidth;
      mask.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const mctx = mask.getContext('2d')!;
      mctx.fillStyle = 'black';
      mctx.fillRect(0, 0, mask.width, mask.height);
    };
    img.src = url;
  }, []);

  const paint = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!painting) return;
    const mask = maskRef.current;
    if (!mask) return;
    const rect = mask.getBoundingClientRect();
    const scaleX = mask.width / rect.width;
    const scaleY = mask.height / rect.height;
    const x = (e.clientX - rect.left) * scaleX;
    const y = (e.clientY - rect.top) * scaleY;
    const ctx = mask.getContext('2d')!;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = isErasing ? 'black' : 'white';
    ctx.beginPath();
    ctx.arc(x, y, brushSize * scaleX, 0, Math.PI * 2);
    ctx.fill();
  }, [painting, brushSize, isErasing]);

  const clearMask = useCallback(() => {
    const mask = maskRef.current;
    if (!mask) return;
    const ctx = mask.getContext('2d')!;
    ctx.fillStyle = 'black';
    ctx.fillRect(0, 0, mask.width, mask.height);
  }, []);

  const exportMask = useCallback(async (): Promise<MediaInput | null> => {
    const mask = maskRef.current;
    if (!mask) return null;
    return new Promise((resolve) => {
      mask.toBlob((blob) => {
        if (blob) resolve({ blob, name: 'mask.png' });
        else resolve(null);
      }, 'image/png');
    });
  }, []);

  const handleSubmit = useCallback(async () => {
    if (!model || !selectedProvider || !selectedModel || !sourceImage) return;

    const maskInput = capability === 'inpaint' ? await exportMask() : null;
    const allMedia = { ...mediaInputs };
    if (sourceImage) allMedia.image = sourceImage;
    if (maskInput) allMedia.mask = maskInput;

    await submit({
      provider_id: selectedProvider,
      model_id: selectedModel,
      capability,
      params: { ...params },
    });
  }, [model, selectedProvider, selectedModel, capability, params, sourceImage, mediaInputs, exportMask, submit]);

  const succeededJobs = allJobs.filter(
    (j) => j.state === 'succeeded' && j.blobUrls && j.blobUrls.length > 0 &&
    EDIT_CAPABILITIES.includes(j.capability),
  );

  return (
    <div className="flex flex-col lg:flex-row h-full">
      {/* Right panel */}
      <div className="lg:order-2 lg:w-[340px] xl:w-[380px] shrink-0 border-b lg:border-b-0 lg:border-l border-[var(--color-border-subtle)] bg-[var(--color-panel)] overflow-y-auto">
        <div className="p-4 flex flex-col gap-4">
          <div className="flex gap-1.5 flex-wrap">
            {EDIT_CAPABILITIES.map((c) => (
              <button
                key={c}
                onClick={() => setCapability(c)}
                className={`px-2.5 py-1 rounded-[var(--radius-sm)] text-[var(--text-xs)] font-medium transition-colors ${
                  capability === c
                    ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]'
                    : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
                }`}
              >
                {c.replace('2', '→').replace('_', ' ')}
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
            <SchemaForm
              params={model.params}
              values={params}
              onChange={setParams}
              mediaInputs={mediaInputs}
              onMediaInput={(field, input) => setMediaInputs((prev) => ({ ...prev, [field]: input }))}
            />
          )}

          {capability === 'inpaint' && sourceImage && (
            <div className="flex flex-col gap-2">
              <label className="text-[var(--text-sm)] font-medium text-[var(--color-text-secondary)]">Brush Size</label>
              <div className="flex items-center gap-3">
                <SliderPrimitive.Root
                  className="relative flex items-center select-none touch-none w-full h-5"
                  value={[brushSize]}
                  onValueChange={([v]) => setBrushSize(v)}
                  min={5}
                  max={100}
                  step={1}
                >
                  <SliderPrimitive.Track className="bg-[var(--color-bg-tertiary)] relative grow rounded-full h-1.5">
                    <SliderPrimitive.Range className="absolute bg-[var(--color-accent)] rounded-full h-full" />
                  </SliderPrimitive.Track>
                  <SliderPrimitive.Thumb className="block w-4 h-4 bg-[var(--color-accent)] rounded-full shadow-[var(--shadow-sm)]" />
                </SliderPrimitive.Root>
                <span className="text-[var(--text-sm)] text-[var(--color-text-muted)] w-8 text-right tabular-nums">{brushSize}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant={isErasing ? 'secondary' : 'primary'} icon={<Paintbrush size={14} />} onClick={() => setIsErasing(false)}>Paint</Button>
                <Button size="sm" variant={isErasing ? 'primary' : 'secondary'} icon={<Eraser size={14} />} onClick={() => setIsErasing(true)}>Erase</Button>
                <Button size="sm" variant="ghost" icon={<RotateCcw size={14} />} onClick={clearMask}>Clear</Button>
              </div>
            </div>
          )}

          <Button
            variant="primary"
            size="lg"
            onClick={handleSubmit}
            disabled={!model || !sourceImage}
            icon={<Download size={18} />}
          >
            Run Edit
          </Button>
        </div>
      </div>

      {/* Canvas area */}
      <div className="flex-1 min-w-0 overflow-y-auto p-4 lg:p-6">
        {!sourceImage ? (
          <DropZone
            accept="image/*"
            onDrop={handleSourceDrop}
            label="Drop an image to edit, or paste from clipboard"
          />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="relative inline-block">
              <canvas ref={canvasRef} className="max-w-full rounded-[var(--radius-md)]" />
              {capability === 'inpaint' && (
                <canvas
                  ref={maskRef}
                  className="absolute inset-0 w-full h-full rounded-[var(--radius-md)] opacity-40"
                  style={{ cursor: 'crosshair' }}
                  onMouseDown={() => setPainting(true)}
                  onMouseUp={() => setPainting(false)}
                  onMouseLeave={() => setPainting(false)}
                  onMouseMove={paint}
                />
              )}
            </div>
            <Button size="sm" variant="ghost" onClick={() => { setSourceImage(null); }}>
              Replace image
            </Button>

            {succeededJobs.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {succeededJobs.flatMap((job) =>
                  (job.blobUrls ?? []).map((_, i) => (
                    <ResultCard key={`${job.id}-${i}`} job={job} index={i} />
                  )),
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
