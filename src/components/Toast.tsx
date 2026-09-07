import { useCallback, useEffect, useState, createContext, useContext, type ReactNode } from 'react';

interface ToastItem {
  id: string;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
}

interface ToastContextValue {
  toast(message: string, type?: ToastItem['type']): void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastItem['type'] = 'info') => {
    const id = crypto.randomUUID();
    setItems((prev) => [...prev, { id, message, type }]);
  }, []);

  const dismiss = useCallback((id: string) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-4 right-4 flex flex-col gap-2" style={{ zIndex: 'var(--z-toast)' }}>
        {items.map((item) => (
          <ToastItem key={item.id} item={item} onDismiss={dismiss} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function ToastItem({ item, onDismiss }: { item: ToastItem; onDismiss: (id: string) => void }) {
  useEffect(() => {
    const t = setTimeout(() => onDismiss(item.id), 4000);
    return () => clearTimeout(t);
  }, [item.id, onDismiss]);

  const bgColors: Record<string, string> = {
    info: 'var(--color-info-subtle)',
    success: 'var(--color-success-subtle)',
    error: 'var(--color-danger-subtle)',
    warning: 'var(--color-warning-subtle)',
  };

  const borderColors: Record<string, string> = {
    info: 'var(--color-info)',
    success: 'var(--color-success)',
    error: 'var(--color-danger)',
    warning: 'var(--color-warning)',
  };

  return (
    <div
      role="alert"
      onClick={() => onDismiss(item.id)}
      className="cursor-pointer rounded-[var(--radius-md)] px-4 py-3 shadow-[var(--shadow-lg)] min-w-[280px] max-w-[420px] text-[var(--text-sm)]"
      style={{
        backgroundColor: bgColors[item.type],
        borderLeft: `3px solid ${borderColors[item.type]}`,
        color: 'var(--color-text)',
        animation: 'slideIn var(--duration-normal) var(--ease-out)',
      }}
    >
      {item.message}
    </div>
  );
}
