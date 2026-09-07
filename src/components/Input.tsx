import { forwardRef, type InputHTMLAttributes, type TextareaHTMLAttributes } from 'react';

const baseClass = 'w-full bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-3 py-2 text-[var(--text-base)] text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] transition-colors transition-[var(--duration-fast)] focus:border-[var(--color-accent)] focus:outline-none disabled:opacity-50';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  ({ className = '', ...props }, ref) => (
    <input ref={ref} className={`${baseClass} h-9 ${className}`} {...props} />
  ),
);
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className = '', ...props }, ref) => (
    <textarea ref={ref} className={`${baseClass} min-h-[80px] resize-y ${className}`} {...props} />
  ),
);
Textarea.displayName = 'Textarea';
