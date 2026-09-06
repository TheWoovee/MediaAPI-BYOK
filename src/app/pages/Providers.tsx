import { useEffect, useState, useCallback } from 'react';
import { providers } from '@shared/providers/registry';
import type { Credential } from '@shared/types';

export function ProvidersPage() {
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [adding, setAdding] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [secret, setSecret] = useState('');
  const [revealed, setRevealed] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const loadCredentials = useCallback(() => {
    fetch('/studio/api/credentials')
      .then((r) => r.json() as Promise<{ credentials: Credential[] }>)
      .then((j) => setCredentials(j.credentials ?? []))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadCredentials();
  }, [loadCredentials]);

  async function handleAdd(providerId: string) {
    if (!label || !secret) return;
    setError(null);
    const res = await fetch('/studio/api/credentials', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider_id: providerId, label, secret }),
    });
    if (!res.ok) {
      setError('Failed to save credential');
      return;
    }
    setAdding(null);
    setLabel('');
    setSecret('');
    loadCredentials();
  }

  async function handleDelete(id: string) {
    await fetch(`/studio/api/credentials/${id}`, { method: 'DELETE' });
    loadCredentials();
  }

  async function handleReveal(id: string) {
    const res = await fetch(`/studio/api/credentials/${id}/reveal`, { method: 'POST' });
    if (res.ok) {
      const j = (await res.json()) as { secret: string };
      setRevealed((prev) => ({ ...prev, [id]: j.secret }));
    }
  }

  return (
    <div>
      <h1 style={{ fontSize: '24px', fontWeight: 700, marginBottom: '16px' }}>Providers</h1>
      {error && (
        <div style={{ color: 'var(--color-danger)', marginBottom: '12px' }}>{error}</div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {providers.map((p) => {
          const creds = credentials.filter((c) => c.provider_id === p.id);
          return (
            <div
              key={p.id}
              style={{
                border: '1px solid var(--color-border)',
                borderRadius: 'var(--radius-md)',
                padding: '16px',
                backgroundColor: 'var(--color-bg-secondary)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{p.label}</span>
                  <span style={{ color: 'var(--color-text-muted)', fontSize: '12px', marginLeft: '8px' }}>
                    wave {p.wave} &middot; {p.transport}
                  </span>
                </div>
                <button
                  onClick={() => {
                    setAdding(adding === p.id ? null : p.id);
                    setLabel('');
                    setSecret('');
                  }}
                  style={{
                    background: 'var(--color-primary)',
                    color: 'var(--color-primary-text)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    padding: '4px 12px',
                    cursor: 'pointer',
                    fontSize: '13px',
                  }}
                >
                  {adding === p.id ? 'Cancel' : 'Add Key'}
                </button>
              </div>
              {adding === p.id && (
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    placeholder="Label"
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--color-bg)',
                      color: 'var(--color-text)',
                    }}
                  />
                  <input
                    placeholder="API Key"
                    type="password"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                    style={{
                      flex: 2,
                      padding: '6px 10px',
                      border: '1px solid var(--color-border)',
                      borderRadius: 'var(--radius-sm)',
                      backgroundColor: 'var(--color-bg)',
                      color: 'var(--color-text)',
                    }}
                  />
                  <button
                    onClick={() => handleAdd(p.id)}
                    style={{
                      background: 'var(--color-success)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      padding: '6px 16px',
                      cursor: 'pointer',
                    }}
                  >
                    Save
                  </button>
                </div>
              )}
              {creds.length > 0 && (
                <div style={{ fontSize: '13px' }}>
                  {creds.map((cr) => (
                    <div
                      key={cr.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '4px 0',
                        borderTop: '1px solid var(--color-border)',
                      }}
                    >
                      <span style={{ flex: 1 }}>
                        {cr.label} &middot; ****{cr.last4}
                        {cr.is_default && (
                          <span style={{ color: 'var(--color-primary)', marginLeft: '4px', fontSize: '11px' }}>DEFAULT</span>
                        )}
                      </span>
                      {revealed[cr.id] ? (
                        <code style={{ fontFamily: 'var(--font-mono)', fontSize: '12px', color: 'var(--color-warning)' }}>
                          {revealed[cr.id]}
                        </code>
                      ) : (
                        <button
                          onClick={() => handleReveal(cr.id)}
                          style={{ background: 'none', border: 'none', color: 'var(--color-primary)', cursor: 'pointer', fontSize: '12px' }}
                        >
                          Reveal
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(cr.id)}
                        style={{ background: 'none', border: 'none', color: 'var(--color-danger)', cursor: 'pointer', fontSize: '12px' }}
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
