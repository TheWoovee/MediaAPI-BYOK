import { useState, useEffect, useCallback } from 'react';
import { Server, Plus, Trash2, Circle, Copy, AlertTriangle, Check } from 'lucide-react';
import type { LocalServer } from '@shared/types';
import * as api from '../../lib/api';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Dialog } from '../../components/Dialog';
import { EmptyState } from '../../components/EmptyState';
import { useToast } from '../../components/Toast';

type ServerKind = 'comfyui' | 'a1111' | 'openai-compat' | 'swarmui';

interface HealthStatus {
  online: boolean;
  lastCheck: number;
}

const HEALTH_ENDPOINTS: Record<ServerKind, string> = {
  comfyui: '/system_stats',
  a1111: '/sdapi/v1/progress',
  'openai-compat': '/v1/models',
  swarmui: '/API/GetCurrentStatus',
};

function getOrigin(): string {
  return window.location.origin;
}

function getLaunchCommand(kind: ServerKind, mode: 'direct' | 'relay'): string {
  const origin = getOrigin();
  if (kind === 'comfyui') {
    return mode === 'direct'
      ? `python main.py --listen 127.0.0.1 --enable-cors-header ${origin}`
      : `python main.py --listen 127.0.0.1`;
  }
  if (kind === 'a1111') {
    return mode === 'direct'
      ? `python launch.py --api --listen --cors-allow-origins=${origin}`
      : `python launch.py --api --listen`;
  }
  return '';
}

export function LocalPage() {
  const [servers, setServers] = useState<LocalServer[]>([]);
  const [health, setHealth] = useState<Record<string, HealthStatus>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newKind, setNewKind] = useState<ServerKind>('comfyui');
  const [newLabel, setNewLabel] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('http://localhost:8188');
  const [newMode, setNewMode] = useState<'direct' | 'relay'>('direct');
  const [copiedCmd, setCopiedCmd] = useState(false);
  const { toast } = useToast();

  const loadServers = useCallback(() => {
    api.fetchLocalServers()
      .then((r) => setServers(r.servers ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => { loadServers(); }, [loadServers]);

  const checkHealth = useCallback(async (server: LocalServer) => {
    const endpoint = HEALTH_ENDPOINTS[server.kind as ServerKind] ?? '/';
    try {
      const res = await fetch(`${server.base_url}${endpoint}`, { method: 'GET', signal: AbortSignal.timeout(5000) });
      setHealth((prev) => ({ ...prev, [server.id]: { online: res.ok, lastCheck: Date.now() } }));
    } catch {
      setHealth((prev) => ({ ...prev, [server.id]: { online: false, lastCheck: Date.now() } }));
    }
  }, []);

  useEffect(() => {
    servers.forEach((s) => checkHealth(s));
    const interval = setInterval(() => servers.forEach((s) => checkHealth(s)), 15000);
    return () => clearInterval(interval);
  }, [servers, checkHealth]);

  async function handleAdd() {
    if (!newLabel.trim() || !newBaseUrl.trim()) return;
    try {
      await api.createLocalServer({
        kind: newKind,
        label: newLabel.trim(),
        base_url: newBaseUrl.trim().replace(/\/$/, ''),
        mode: newMode,
      });
      toast('Server added', 'success');
      setAddDialogOpen(false);
      setNewLabel('');
      setNewBaseUrl('http://localhost:8188');
      loadServers();
    } catch (e) {
      toast((e as Error).message || 'Failed to add', 'error');
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteLocalServer(id);
      toast('Server removed', 'success');
      loadServers();
    } catch { /* noop */ }
  }

  const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
  const launchCmd = getLaunchCommand(newKind, newMode);

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[var(--text-xl)] font-semibold">Local Servers</h1>
        <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setAddDialogOpen(true)}>
          Add Server
        </Button>
      </div>

      {isSafari && (
        <div className="flex items-start gap-2 p-3 mb-4 rounded-[var(--radius-md)] bg-[var(--color-warning-subtle)] text-[var(--color-warning)] text-[var(--text-sm)]">
          <AlertTriangle size={16} className="shrink-0 mt-0.5" />
          <div>
            <strong>Safari blocks localhost connections</strong> from HTTPS pages. Use relay mode (tunnel through the Worker) or switch to Chrome/Firefox for direct local access.
          </div>
        </div>
      )}

      {servers.length === 0 ? (
        <EmptyState
          icon={Server}
          title="No local servers"
          description="Connect ComfyUI, A1111/Forge, or other local generation servers"
          action={<Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setAddDialogOpen(true)}>Add Server</Button>}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {servers.map((s) => {
            const status = health[s.id];
            return (
              <div key={s.id} className="border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-panel)] p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Circle
                      size={10}
                      className={`shrink-0 ${status?.online ? 'fill-[var(--color-success)] text-[var(--color-success)]' : 'fill-[var(--color-text-muted)] text-[var(--color-text-muted)]'}`}
                    />
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{s.label}</span>
                        <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)] uppercase">
                          {s.kind}
                        </span>
                        <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]">
                          {s.mode}
                        </span>
                      </div>
                      <div className="text-[var(--text-xs)] text-[var(--color-text-muted)] font-mono mt-0.5">{s.base_url}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => checkHealth(s)}>Ping</Button>
                    <button onClick={() => handleDelete(s.id)} className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)] transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen} title="Add Local Server">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label className="text-[var(--text-sm)] font-medium text-[var(--color-text-secondary)]">Server Type</label>
            <div className="flex gap-1.5 flex-wrap">
              {(['comfyui', 'a1111', 'openai-compat', 'swarmui'] as ServerKind[]).map((k) => (
                <button
                  key={k}
                  onClick={() => {
                    setNewKind(k);
                    if (k === 'comfyui') setNewBaseUrl('http://localhost:8188');
                    else if (k === 'a1111') setNewBaseUrl('http://localhost:7860');
                    else setNewBaseUrl('http://localhost:8080');
                  }}
                  className={`px-3 py-1.5 rounded-[var(--radius-sm)] text-[var(--text-sm)] transition-colors ${
                    newKind === k
                      ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]'
                      : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)] hover:bg-[var(--color-border)]'
                  }`}
                >
                  {k === 'comfyui' ? 'ComfyUI' : k === 'a1111' ? 'A1111/Forge' : k === 'openai-compat' ? 'OpenAI-compat' : 'SwarmUI'}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[var(--text-sm)] font-medium text-[var(--color-text-secondary)]">Mode</label>
            <div className="flex gap-1.5">
              <button
                onClick={() => setNewMode('direct')}
                className={`flex-1 px-3 py-2 rounded-[var(--radius-sm)] text-[var(--text-sm)] transition-colors text-center ${
                  newMode === 'direct' ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]' : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
                }`}
              >
                <div className="font-medium">Direct</div>
                <div className="text-[var(--text-xs)] opacity-80">Same PC (localhost)</div>
              </button>
              <button
                onClick={() => setNewMode('relay')}
                className={`flex-1 px-3 py-2 rounded-[var(--radius-sm)] text-[var(--text-sm)] transition-colors text-center ${
                  newMode === 'relay' ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]' : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
                }`}
              >
                <div className="font-medium">Relay</div>
                <div className="text-[var(--text-xs)] opacity-80">Via tunnel (anywhere)</div>
              </button>
            </div>
          </div>

          <Input placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <Input placeholder="Base URL" value={newBaseUrl} onChange={(e) => setNewBaseUrl(e.target.value)} />

          {launchCmd && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[var(--text-sm)] font-medium text-[var(--color-text-secondary)]">Launch command</label>
              <div className="relative">
                <code className="block bg-[var(--color-bg-tertiary)] rounded-[var(--radius-sm)] p-3 text-[var(--text-xs)] font-mono text-[var(--color-text-secondary)] break-all pr-10">
                  {launchCmd}
                </code>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(launchCmd);
                    setCopiedCmd(true);
                    setTimeout(() => setCopiedCmd(false), 2000);
                  }}
                  className="absolute top-2 right-2 p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-colors"
                >
                  {copiedCmd ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}

          {newMode === 'direct' && (
            <div className="text-[var(--text-xs)] text-[var(--color-text-muted)] bg-[var(--color-bg-tertiary)] rounded-[var(--radius-sm)] p-3">
              Chrome 142+ will show a Local Network Access permission prompt when connecting. Allow it once. Firefox works without a prompt. Safari blocks localhost from HTTPS — use relay mode instead.
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <Button variant="ghost" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAdd} disabled={!newLabel.trim() || !newBaseUrl.trim()}>Add Server</Button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
