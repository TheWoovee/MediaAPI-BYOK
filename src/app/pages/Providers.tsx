import { useEffect, useState, useCallback } from 'react';
import { Key, Plus, Eye, EyeOff, Trash2, Star, ExternalLink, Check, AlertCircle, Loader2 } from 'lucide-react';
import { providers } from '@shared/providers/registry';
import type { Credential } from '@shared/types';
import { getAdapter } from '../../providers/index';
import * as api from '../../lib/api';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Dialog } from '../../components/Dialog';
import { useToast } from '../../components/Toast';

export function ProvidersPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [secret, setSecret] = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<{ ok: boolean; message?: string } | null>(null);
  const { toast } = useToast();

  const transportLabel: Record<string, string> = {
    proxy: 'Via secure proxy',
    direct: 'Direct from your browser',
    local: 'Via your local server',
  };

  const loadCredentials = useCallback(() => {
    api.fetchCredentials()
      .then((j) => setCredentials(j.credentials ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => { loadCredentials(); }, [loadCredentials]);

  async function handleAdd(providerId: string) {
    if (!label.trim() || !secret.trim()) return;
    try {
      await api.createCredential({ provider_id: providerId, label: label.trim(), secret: secret.trim() });
      toast('Credential saved', 'success');
      setAdding(null);
      setLabel('');
      setSecret('');
      loadCredentials();
    } catch (e) {
      toast((e as Error).message || 'Failed to save credential', 'error');
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.deleteCredential(id);
      toast('Credential deleted', 'success');
      setConfirmDelete(null);
      loadCredentials();
    } catch (e) {
      toast((e as Error).message || 'Failed to delete', 'error');
    }
  }

  async function handleSetDefault(id: string) {
    try {
      await api.setDefaultCredential(id);
      loadCredentials();
    } catch { /* noop */ }
  }

  async function handleReveal(id: string) {
    if (revealed[id]) {
      setRevealed((prev) => { const next = { ...prev }; delete next[id]; return next; });
      return;
    }
    try {
      const result = await api.revealCredential(id);
      setRevealed((prev) => ({ ...prev, [id]: result.secret }));
    } catch {
      toast('Failed to reveal', 'error');
    }
  }

  async function handleTestKey(providerId: string) {
    const adapter = getAdapter(providerId);
    if (!adapter?.testCredential) return;
    setTesting(providerId);
    setTestResult(null);
    try {
      const cred = credentials.find((c) => c.provider_id === providerId && c.is_default) ?? credentials.find((c) => c.provider_id === providerId);
      const { makeContext } = await import('../../providers/transport');
      const ctx = makeContext(adapter.spec, { credentialId: cred?.id });
      const result = await adapter.testCredential(ctx);
      setTestResult(result);
    } catch (e) {
      setTestResult({ ok: false, message: (e as Error).message });
    }
    setTesting(null);
  }

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <h1 className="text-[var(--text-xl)] font-semibold mb-6">Providers</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {providers.map((p) => {
          const creds = credentials.filter((c) => c.provider_id === p.id);
          const hasAdapter = getAdapter(p.id) !== undefined;

          return (
            <div
              key={p.id}
              className={`border rounded-[var(--radius-md)] bg-[var(--color-panel)] overflow-hidden transition-colors flex flex-col ${
                hasAdapter ? 'border-[var(--color-border)]' : 'border-[var(--color-border-subtle)] opacity-70'
              }`}
            >
              <div className="p-4 flex flex-col flex-1">
                {/* Header: name + status */}
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 mb-1">
                  <span className="font-medium text-[var(--text-md)]">{p.label}</span>
                  <span
                    className={`shrink-0 text-[var(--text-xs)] ${hasAdapter ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'}`}
                    title={transportLabel[p.transport] ?? p.transport}
                  >
                    {hasAdapter ? 'Ready' : 'Coming soon'}
                  </span>
                </div>
                {!hasAdapter && (
                  <span className="self-start mb-1 px-1.5 py-0.5 text-[9px] font-medium rounded bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]">
                    COMING SOON
                  </span>
                )}
                <p className="text-[var(--text-xs)] text-[var(--color-text-muted)] mb-3">{p.auth.help}</p>

                {creds.length > 0 && (
                  <div className="flex flex-col gap-1.5 mb-3">
                    {creds.map((cr) => (
                      <div key={cr.id} className="flex items-center gap-2 text-[var(--text-sm)]">
                        <Key size={12} className="text-[var(--color-text-muted)] shrink-0" />
                        <span className="flex-1 truncate">
                          {cr.label}
                          <span className="text-[var(--color-text-muted)] ml-1">****{cr.last4}</span>
                        </span>
                        {cr.is_default && <Star size={12} className="text-[var(--color-accent)] shrink-0" />}
                        <div className="flex gap-0.5">
                          {!cr.is_default && (
                            <button onClick={() => handleSetDefault(cr.id)} className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:bg-[var(--color-accent-subtle)] transition-colors" title="Set default">
                              <Star size={12} />
                            </button>
                          )}
                          <button onClick={() => handleReveal(cr.id)} className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-tertiary)] transition-colors" title={revealed[cr.id] ? 'Hide' : 'Reveal'}>
                            {revealed[cr.id] ? <EyeOff size={12} /> : <Eye size={12} />}
                          </button>
                          <button onClick={() => setConfirmDelete(cr.id)} className="p-1 rounded text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)] transition-colors" title="Delete">
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                    {Object.entries(revealed).filter(([id]) => creds.some((c) => c.id === id)).map(([id, secret]) => (
                      <code key={id} className="text-[var(--text-xs)] bg-[var(--color-bg-tertiary)] rounded px-2 py-1 font-mono text-[var(--color-warning)] break-all">
                        {secret}
                      </code>
                    ))}
                  </div>
                )}

                {/* Footer: actions pushed to bottom */}
                <div className="mt-auto pt-3">
                  {adding === p.id ? (
                    <div className="flex flex-col gap-2">
                      <Input placeholder="Label (e.g. 'Personal')" value={label} onChange={(e) => setLabel(e.target.value)} className="!h-8" />
                      <Input placeholder="API Key" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} className="!h-8" />
                      <div className="flex gap-2">
                        <Button size="sm" variant="primary" onClick={() => handleAdd(p.id)} disabled={!label.trim() || !secret.trim()}>Save</Button>
                        <Button size="sm" variant="ghost" onClick={() => { setAdding(null); setLabel(''); setSecret(''); }}>Cancel</Button>
                      </div>
                    </div>
                  ) : hasAdapter ? (
                    <div className="flex gap-2">
                      <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={() => { setAdding(p.id); setLabel(''); setSecret(''); }}>Add Key</Button>
                      {creds.length > 0 && getAdapter(p.id)?.testCredential && (
                        <Button
                          size="sm"
                          variant="ghost"
                          loading={testing === p.id}
                          onClick={() => handleTestKey(p.id)}
                          icon={testing === p.id ? <Loader2 size={14} className="animate-spin" /> : undefined}
                        >
                          Test
                        </Button>
                      )}
                      {p.docsPath && (
                        <Button size="sm" variant="ghost" icon={<ExternalLink size={14} />} onClick={() => {}}>Docs</Button>
                      )}
                    </div>
                  ) : (
                    <span className="inline-block text-[var(--text-xs)] text-[var(--color-text-muted)] italic">
                      Coming soon
                    </span>
                  )}

                  {testing === null && testResult && (
                    <div className={`mt-2 flex items-center gap-1.5 text-[var(--text-xs)] ${testResult.ok ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]'}`}>
                      {testResult.ok ? <Check size={12} /> : <AlertCircle size={12} />}
                      {testResult.message ?? (testResult.ok ? 'Key is valid' : 'Key validation failed')}
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Dialog
        open={!!confirmDelete}
        onOpenChange={() => setConfirmDelete(null)}
        title="Delete Credential"
        description="This will permanently delete this API key. Jobs using it will fail."
      >
        <div className="flex gap-2 justify-end mt-4">
          <Button variant="ghost" onClick={() => setConfirmDelete(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => confirmDelete && handleDelete(confirmDelete)}>Delete</Button>
        </div>
      </Dialog>
    </div>
  );
}
