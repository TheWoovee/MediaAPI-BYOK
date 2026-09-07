import { useState, useEffect, useCallback } from 'react';
import { Server, Plus, Trash2, Circle, Copy, AlertTriangle, Check, Info } from 'lucide-react';
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

function getLaunchCommands(): Record<'comfyui' | 'a1111' | 'openai-compat', { direct: string; note?: string }> {
  const origin = getOrigin();
  return {
    comfyui: {
      direct: `python main.py --listen 127.0.0.1 --port 8188 --enable-cors-header ${origin}`,
    },
    a1111: {
      direct: `./webui.sh --api --listen --cors-allow-origins=${origin}`,
    },
    'openai-compat': {
      direct: 'http://localhost:PORT/v1',
      note: 'Replace PORT with your server\'s port (e.g. 11434 for Ollama). Add as kind "OpenAI-compatible".',
    },
  };
}

export function LocalPage() {
  const [servers, setServers] = useState<LocalServer[]>([]);
  const [health, setHealth] = useState<Record<string, HealthStatus>>({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [newKind, setNewKind] = useState<ServerKind>('comfyui');
  const [newLabel, setNewLabel] = useState('');
  const [newBaseUrl, setNewBaseUrl] = useState('http://localhost:8188');
  const [newMode, setNewMode] = useState<'direct' | 'relay'>('direct');
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
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

  function copyToClipboard(text: string, key: string) {
    navigator.clipboard.writeText(text);
    setCopiedCmd(key);
    setTimeout(() => setCopiedCmd(null), 2000);
  }

  async function handleAdd() {
    if (!newLabel.trim() || !newBaseUrl.trim()) return;
    if (newMode === 'relay') {
      try { const u = new URL(newBaseUrl); if (u.protocol !== 'https:') { toast('Relay mode requires an HTTPS URL (Cloudflare Tunnel)', 'error'); return; } } catch { /* invalid URL, let server reject */ }
      if (/^(localhost|127\.|0\.|192\.168\.|10\.)/.test(new URL(newBaseUrl).hostname)) { toast('Relay mode requires a public tunnel URL, not localhost/LAN', 'error'); return; }
    }
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
  const origin = getOrigin();
  const launchCommands = getLaunchCommands();

  const dialogLaunchCmd = newMode === 'direct'
    ? (newKind === 'comfyui' ? `python main.py --listen 127.0.0.1 --port 8188 --enable-cors-header ${origin}` :
       newKind === 'a1111' ? `./webui.sh --api --listen --cors-allow-origins=${origin}` : '')
    : (newKind === 'comfyui' ? 'python main.py --listen 127.0.0.1 --port 8188' :
       newKind === 'a1111' ? './webui.sh --api --listen' : '');

  return (
    <div className="grid grid-cols-1 gap-6 p-4 lg:p-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-[var(--text-xl)] font-semibold">Local Servers</h1>
        <Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setAddDialogOpen(true)}>
          Add Server
        </Button>
      </div>

      <div className="flex flex-col gap-2 text-[var(--text-xs)]">
        <div className="flex items-start gap-2 p-3 rounded-[var(--radius-md)] bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]">
          <Info size={14} className="shrink-0 mt-0.5" />
          <span><strong className="text-[var(--color-text-secondary)]">Chrome 142+</strong> shows a one-time &quot;Allow local network access&quot; prompt when connecting to localhost. Click Allow — the grant is remembered per site.</span>
        </div>
        {isSafari && (
          <div className="flex items-start gap-2 p-3 rounded-[var(--radius-md)] bg-[var(--color-warning-subtle)] text-[var(--color-warning)]">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span><strong>Safari</strong> blocks HTTP localhost calls from an HTTPS page. Add servers in relay mode (Cloudflare Tunnel) or use Chrome/Firefox.</span>
          </div>
        )}
      </div>

      {servers.length === 0 ? (
        <div className="flex flex-col items-center gap-6 py-12">
          <EmptyState
            icon={Server}
            title="No local servers"
            description="Connect ComfyUI, A1111/Forge, or other local generation servers"
            action={<Button variant="primary" size="sm" icon={<Plus size={14} />} onClick={() => setAddDialogOpen(true)}>Add Server</Button>}
          />
          <div className="w-full max-w-lg">
            <h3 className="text-[var(--text-xs)] font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Quick Start Commands</h3>
            <div className="flex flex-col gap-2">
              {(['comfyui', 'a1111', 'openai-compat'] as const).map((k) => (
                <div key={k} className="bg-[var(--color-bg-tertiary)] rounded-[var(--radius-sm)] p-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[var(--text-xs)] font-medium text-[var(--color-text-secondary)] w-24 shrink-0">
                      {k === 'comfyui' ? 'ComfyUI' : k === 'a1111' ? 'A1111/Forge' : 'OpenAI-compat'}
                    </span>
                    <code className="text-[var(--text-xs)] font-mono text-[var(--color-text-muted)] flex-1 min-w-0 break-all">{launchCommands[k].direct}</code>
                    <button
                      onClick={() => copyToClipboard(launchCommands[k].direct, k)}
                      className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] transition-colors shrink-0"
                    >
                      {copiedCmd === k ? <Check size={12} /> : <Copy size={12} />}
                    </button>
                  </div>
                  {launchCommands[k].note && (
                    <div className="text-[10px] text-[var(--color-text-muted)] mt-1 pl-[6.5rem]">{launchCommands[k].note}</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
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
                onClick={() => { setNewMode('direct'); setNewBaseUrl('http://localhost:8188'); }}
                className={`flex-1 px-3 py-2 rounded-[var(--radius-sm)] text-[var(--text-sm)] transition-colors text-center ${
                  newMode === 'direct' ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]' : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
                }`}
              >
                <div className="font-medium">Direct</div>
                <div className="text-[var(--text-xs)] opacity-80">Browser connects to localhost on this PC</div>
              </button>
              <button
                onClick={() => { setNewMode('relay'); setNewBaseUrl('https://'); }}
                className={`flex-1 px-3 py-2 rounded-[var(--radius-sm)] text-[var(--text-sm)] transition-colors text-center ${
                  newMode === 'relay' ? 'bg-[var(--color-accent)] text-[var(--color-accent-text)]' : 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-secondary)]'
                }`}
              >
                <div className="font-medium">Relay</div>
                <div className="text-[var(--text-xs)] opacity-80">HTTPS tunnel (Cloudflare Tunnel, ngrok)</div>
              </button>
            </div>
          </div>

          <Input placeholder="Label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          <Input placeholder={newMode === 'relay' ? 'Tunnel URL (https://...)' : 'Base URL'} value={newBaseUrl} onChange={(e) => setNewBaseUrl(e.target.value)} />

          {dialogLaunchCmd && (
            <div className="flex flex-col gap-1.5">
              <label className="text-[var(--text-sm)] font-medium text-[var(--color-text-secondary)]">Launch command</label>
              <div className="relative">
                <code className="block bg-[var(--color-bg-tertiary)] rounded-[var(--radius-sm)] p-3 text-[var(--text-xs)] font-mono text-[var(--color-text-secondary)] break-all pr-10">
                  {dialogLaunchCmd}
                </code>
                <button
                  onClick={() => copyToClipboard(dialogLaunchCmd, 'dialog')}
                  className="absolute top-2 right-2 p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-colors"
                >
                  {copiedCmd === 'dialog' ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            </div>
          )}

          {newMode === 'direct' && (
            <div className="text-[var(--text-xs)] text-[var(--color-text-muted)] bg-[var(--color-bg-tertiary)] rounded-[var(--radius-sm)] p-3">
              Chrome 142+ shows a one-time local network access prompt — click Allow. Safari blocks localhost from HTTPS; use relay mode instead.
            </div>
          )}

          {newMode === 'relay' && (
            <div className="text-[var(--text-xs)] text-[var(--color-text-muted)] bg-[var(--color-bg-tertiary)] rounded-[var(--radius-sm)] p-3">
              Run <code className="px-1 py-0.5 bg-[var(--color-bg-secondary)] rounded">cloudflared tunnel run</code> to expose your local server over HTTPS. Requires a public URL — localhost and LAN IPs are rejected.
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
