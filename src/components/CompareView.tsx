import { useState, useRef, useCallback, useEffect } from 'react';
import { X, GripVertical } from 'lucide-react';
import type { Job } from '../jobs/runner';

interface CompareItem {
  job: Job;
  index: number;
}

interface CompareViewProps {
  items: [CompareItem, CompareItem];
  onClose(): void;
}

export function CompareView({ items, onClose }: CompareViewProps) {
  const [sliderPos, setSliderPos] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);
  const videoRefs = useRef<(HTMLVideoElement | null)[]>([null, null]);

  const [a, b] = items;
  const aUrl = a.job.blobUrls?.[a.index];
  const bUrl = b.job.blobUrls?.[b.index];
  const aVideo = a.job.outputs?.[a.index]?.kind === 'video';
  const bVideo = b.job.outputs?.[b.index]?.kind === 'video';
  const bothVideo = aVideo && bVideo;

  const handleMove = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const pct = Math.max(5, Math.min(95, ((clientX - rect.left) / rect.width) * 100));
    setSliderPos(pct);
  }, []);

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      if (dragging.current) handleMove(e.clientX);
    }
    function onMouseUp() {
      dragging.current = false;
    }
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [handleMove]);

  function syncPlay() {
    if (!bothVideo) return;
    const [va, vb] = videoRefs.current;
    if (va && vb) {
      va.currentTime = 0;
      vb.currentTime = 0;
      va.play();
      vb.play();
    }
  }

  function handleTimeUpdate(src: 0 | 1) {
    if (!bothVideo) return;
    const [va, vb] = videoRefs.current;
    if (!va || !vb) return;
    const target = src === 0 ? vb : va;
    const source = src === 0 ? va : vb;
    if (Math.abs(target.currentTime - source.currentTime) > 0.1) {
      target.currentTime = source.currentTime;
    }
  }

  if (!aUrl || !bUrl) return null;

  return (
    <div
      className="fixed inset-0 flex flex-col"
      style={{ zIndex: 'var(--z-dialog)', backgroundColor: 'var(--color-overlay)' }}
    >
      <div className="flex items-center justify-between px-4 py-3 bg-black/80 text-white">
        <div className="flex gap-6 text-[var(--text-sm)]">
          <span className="opacity-70">A: {a.job.model_id}</span>
          <span className="opacity-70">B: {b.job.model_id}</span>
        </div>
        <div className="flex gap-2">
          {bothVideo && (
            <button
              onClick={syncPlay}
              className="px-3 py-1 rounded-[var(--radius-sm)] bg-white/20 hover:bg-white/30 text-[var(--text-sm)] transition-colors"
            >
              Sync play
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-white/20 transition-colors"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="flex-1 relative overflow-hidden select-none"
        onTouchMove={(e) => handleMove(e.touches[0].clientX)}
      >
        {/* Side A (left) */}
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}>
          <div className="w-full h-full flex items-center justify-center p-4">
            {aVideo ? (
              <video
                ref={(el) => { videoRefs.current[0] = el; }}
                src={aUrl}
                className="max-w-full max-h-full object-contain"
                controls
                playsInline
                onTimeUpdate={() => handleTimeUpdate(0)}
              />
            ) : (
              <img src={aUrl} alt="Compare A" className="max-w-full max-h-full object-contain" />
            )}
          </div>
        </div>

        {/* Side B (right) */}
        <div className="absolute inset-0 overflow-hidden" style={{ clipPath: `inset(0 0 0 ${sliderPos}%)` }}>
          <div className="w-full h-full flex items-center justify-center p-4">
            {bVideo ? (
              <video
                ref={(el) => { videoRefs.current[1] = el; }}
                src={bUrl}
                className="max-w-full max-h-full object-contain"
                controls
                playsInline
                onTimeUpdate={() => handleTimeUpdate(1)}
              />
            ) : (
              <img src={bUrl} alt="Compare B" className="max-w-full max-h-full object-contain" />
            )}
          </div>
        </div>

        {/* Slider handle */}
        <div
          className="absolute top-0 bottom-0 w-1 bg-white cursor-col-resize group"
          style={{ left: `${sliderPos}%`, transform: 'translateX(-50%)' }}
          onMouseDown={() => { dragging.current = true; }}
          onTouchStart={() => { dragging.current = true; }}
        >
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
            <GripVertical size={16} className="text-gray-600" />
          </div>
        </div>

        {/* Labels */}
        <div className="absolute top-4 left-4 px-2 py-1 rounded bg-black/60 text-white text-[var(--text-xs)]">A</div>
        <div className="absolute top-4 right-4 px-2 py-1 rounded bg-black/60 text-white text-[var(--text-xs)]">B</div>
      </div>
    </div>
  );
}
