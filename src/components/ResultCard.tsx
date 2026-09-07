import { useState } from 'react';
import { Download, Copy, ArrowRight, Maximize2, X } from 'lucide-react';
import type { Job } from '../jobs/runner';
import { Button } from './Button';

interface ResultCardProps {
  job: Job;
  index: number;
  onReuse?(job: Job): void;
}

export function ResultCard({ job, index, onReuse }: ResultCardProps) {
  const [lightbox, setLightbox] = useState(false);
  const blobUrl = job.blobUrls?.[index];
  const output = job.outputs?.[index];
  const isVideo = output?.kind === 'video';

  function handleDownload() {
    if (!blobUrl || !output) return;
    const ext = isVideo ? 'mp4' : output.mime?.includes('png') ? 'png' : 'jpg';
    const filename = `${job.provider_id}-${job.model_id}-${output.seed ?? Date.now()}.${ext}`;
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.click();
  }

  function handleCopyPrompt() {
    const prompt = job.params.prompt as string | undefined;
    if (prompt) navigator.clipboard.writeText(prompt);
  }

  if (!blobUrl) {
    return (
      <div className="aspect-square bg-[var(--color-bg-tertiary)] rounded-[var(--radius-md)] animate-pulse" />
    );
  }

  return (
    <>
      <div className="group relative rounded-[var(--radius-md)] overflow-hidden bg-[var(--color-bg-tertiary)]">
        {isVideo ? (
          <video
            src={blobUrl}
            className="w-full aspect-video object-cover"
            controls
            playsInline
            poster={undefined}
          />
        ) : (
          <img
            src={blobUrl}
            alt={`Generation result ${index + 1}`}
            className="w-full aspect-square object-cover cursor-pointer"
            onClick={() => setLightbox(true)}
            loading="lazy"
          />
        )}
        <div className="absolute inset-x-0 bottom-0 p-2 bg-gradient-to-t from-black/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <div className="flex gap-1 justify-end">
            <Button size="sm" variant="ghost" icon={<Download size={14} />} onClick={handleDownload} className="!text-white !bg-white/20 hover:!bg-white/30" />
            <Button size="sm" variant="ghost" icon={<Copy size={14} />} onClick={handleCopyPrompt} className="!text-white !bg-white/20 hover:!bg-white/30" title="Copy prompt" />
            {onReuse && (
              <Button size="sm" variant="ghost" icon={<ArrowRight size={14} />} onClick={() => onReuse(job)} className="!text-white !bg-white/20 hover:!bg-white/30" title="Use as edit input" />
            )}
            {!isVideo && (
              <Button size="sm" variant="ghost" icon={<Maximize2 size={14} />} onClick={() => setLightbox(true)} className="!text-white !bg-white/20 hover:!bg-white/30" />
            )}
          </div>
        </div>
        {job.state === 'processing' && (
          <div className="absolute inset-x-0 bottom-0 h-1 bg-[var(--color-bg-tertiary)]">
            <div
              className="h-full bg-[var(--color-accent)] transition-all"
              style={{ width: `${job.progress ?? 0}%` }}
            />
          </div>
        )}
      </div>

      {lightbox && blobUrl && (
        <div
          className="fixed inset-0 flex items-center justify-center p-4"
          style={{ zIndex: 'var(--z-dialog)', backgroundColor: 'var(--color-overlay)' }}
          onClick={() => setLightbox(false)}
        >
          <button
            className="absolute top-4 right-4 p-2 rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors"
            onClick={() => setLightbox(false)}
          >
            <X size={20} />
          </button>
          {isVideo ? (
            <video
              src={blobUrl}
              className="max-w-full max-h-full rounded-[var(--radius-md)]"
              controls
              autoPlay
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <img
              src={blobUrl}
              alt="Enlarged view"
              className="max-w-full max-h-full rounded-[var(--radius-md)] object-contain"
              onClick={(e) => e.stopPropagation()}
            />
          )}
        </div>
      )}
    </>
  );
}
