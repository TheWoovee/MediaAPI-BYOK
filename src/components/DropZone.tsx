import { useCallback, useState, useRef, type ReactNode } from 'react';
import { Upload } from 'lucide-react';
import type { MediaInput } from '@shared/types';

interface DropZoneProps {
  accept?: string;
  onDrop(input: MediaInput): void;
  children?: ReactNode;
  label?: string;
  compact?: boolean;
}

export function DropZone({ accept, onDrop, children, label = 'Drop file or click to browse', compact }: DropZoneProps) {
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(
    (file: File) => {
      onDrop({ blob: file, name: file.name });
    },
    [onDrop],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile],
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      const file = e.clipboardData.files[0];
      if (file) {
        e.preventDefault();
        handleFile(file);
      }
    },
    [handleFile],
  );

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onPaste={handlePaste}
      onClick={() => inputRef.current?.click()}
      className={`relative border-2 border-dashed rounded-[var(--radius-md)] cursor-pointer transition-colors ${
        dragOver
          ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
          : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
      } ${compact ? 'p-3' : 'p-6'}`}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
          e.target.value = '';
        }}
      />
      {children ?? (
        <div className="flex flex-col items-center gap-2 text-[var(--color-text-muted)]">
          <Upload size={compact ? 18 : 24} />
          <span className="text-[var(--text-sm)]">{label}</span>
        </div>
      )}
    </div>
  );
}
