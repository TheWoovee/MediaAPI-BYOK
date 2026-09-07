type Handler = (e: KeyboardEvent) => void;

const listeners = new Map<string, Set<Handler>>();

function getKey(e: KeyboardEvent): string {
  const parts: string[] = [];
  if (e.metaKey || e.ctrlKey) parts.push('mod');
  if (e.shiftKey) parts.push('shift');
  if (e.altKey) parts.push('alt');
  parts.push(e.key.toLowerCase());
  return parts.join('+');
}

function dispatch(e: KeyboardEvent): void {
  const key = getKey(e);
  const handlers = listeners.get(key);
  if (handlers) {
    for (const h of handlers) {
      h(e);
    }
  }
}

let attached = false;

function ensureAttached(): void {
  if (attached) return;
  attached = true;
  document.addEventListener('keydown', dispatch);
}

export function onHotkey(combo: string, handler: Handler): () => void {
  ensureAttached();
  const normalized = combo.toLowerCase();
  let set = listeners.get(normalized);
  if (!set) {
    set = new Set();
    listeners.set(normalized, set);
  }
  set.add(handler);
  return () => {
    set!.delete(handler);
    if (set!.size === 0) listeners.delete(normalized);
  };
}

export function isMac(): boolean {
  return navigator.platform?.includes('Mac') ?? false;
}
