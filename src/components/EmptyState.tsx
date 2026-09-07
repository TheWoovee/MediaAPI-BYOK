import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-12 h-12 rounded-[var(--radius-lg)] bg-[var(--color-bg-tertiary)] flex items-center justify-center mb-4">
        <Icon size={24} className="text-[var(--color-text-muted)]" />
      </div>
      <h3 className="text-[var(--text-md)] font-medium text-[var(--color-text)] mb-1">{title}</h3>
      {description && (
        <p className="text-[var(--text-sm)] text-[var(--color-text-muted)] max-w-sm">{description}</p>
      )}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
