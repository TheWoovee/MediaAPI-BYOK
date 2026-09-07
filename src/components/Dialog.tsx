import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  title: string;
  description?: string;
  children: ReactNode;
}

export function Dialog({ open, onOpenChange, title, description, children }: DialogProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className="fixed inset-0 bg-[var(--color-overlay)]"
          style={{ zIndex: 'var(--z-dialog)', animation: 'fadeIn var(--duration-fast) var(--ease-out)' }}
        />
        <DialogPrimitive.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[var(--color-elevated)] rounded-[var(--radius-lg)] shadow-[var(--shadow-overlay)] p-6 w-[min(90vw,480px)] max-h-[85vh] overflow-y-auto"
          style={{ zIndex: 'var(--z-dialog)' }}
        >
          <div className="flex items-center justify-between mb-4">
            <DialogPrimitive.Title className="text-[var(--text-lg)] font-semibold text-[var(--color-text)]">
              {title}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close className="p-1 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-tertiary)] transition-colors">
              <X size={18} />
            </DialogPrimitive.Close>
          </div>
          {description && (
            <DialogPrimitive.Description className="text-[var(--text-sm)] text-[var(--color-text-secondary)] mb-4">
              {description}
            </DialogPrimitive.Description>
          )}
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
