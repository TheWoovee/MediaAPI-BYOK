import { useState, useEffect } from 'react';
import { Moon, Sun, Monitor, LogOut, Shield } from 'lucide-react';
import { useAppStore } from '../../stores/app';
import { fetchMe } from '../../lib/api';
import type { Theme } from '../../lib/theme';

const themes: { value: Theme; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function SettingsPage() {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const email = useAppStore((s) => s.email);

  const [kekVersion, setKekVersion] = useState<number | null>(null);
  const [revealCount, setRevealCount] = useState(0);

  useEffect(() => {
    fetchMe().then((me) => {
      setKekVersion(me.kek_version);
      setRevealCount(me.reveal_count);
    }).catch(() => {});
  }, []);

  return (
    <div className="p-4 lg:p-6 max-w-2xl mx-auto">
      <h1 className="text-[var(--text-xl)] font-semibold mb-6">Settings</h1>

      <div className="flex flex-col gap-6">
        {/* Account */}
        <section className="border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-panel)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)]">
            <h2 className="text-[var(--text-base)] font-medium">Account</h2>
          </div>
          <div className="p-4 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Email</span>
              <span className="text-[var(--text-sm)] font-mono">{email ?? 'Loading...'}</span>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Shield size={14} className="text-[var(--color-text-muted)]" />
                <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">KEK Version</span>
              </div>
              <span className="text-[var(--text-sm)] font-mono tabular-nums">{kekVersion ?? '—'}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[var(--text-sm)] text-[var(--color-text-secondary)]">Key Reveals</span>
              <span className="text-[var(--text-sm)] font-mono tabular-nums">{revealCount}</span>
            </div>
            <div className="pt-2 border-t border-[var(--color-border-subtle)]">
              <a
                href="/cdn-cgi/access/logout"
                className="inline-flex items-center gap-2 text-[var(--text-sm)] text-[var(--color-danger)] hover:underline"
              >
                <LogOut size={14} />
                Sign out
              </a>
            </div>
          </div>
        </section>

        {/* Theme */}
        <section className="border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-panel)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)]">
            <h2 className="text-[var(--text-base)] font-medium">Appearance</h2>
          </div>
          <div className="p-4">
            <div className="flex gap-2">
              {themes.map((t) => (
                <button
                  key={t.value}
                  onClick={() => setTheme(t.value)}
                  className={`flex-1 flex flex-col items-center gap-2 py-3 rounded-[var(--radius-md)] border transition-colors ${
                    theme === t.value
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                      : 'border-[var(--color-border)] hover:border-[var(--color-text-muted)]'
                  }`}
                >
                  <t.icon size={20} className={theme === t.value ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'} />
                  <span className={`text-[var(--text-sm)] font-medium ${theme === t.value ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-secondary)]'}`}>
                    {t.label}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* About */}
        <section className="border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-panel)] overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border-subtle)] bg-[var(--color-bg-secondary)]">
            <h2 className="text-[var(--text-base)] font-medium">About</h2>
          </div>
          <div className="p-4 text-[var(--text-sm)] text-[var(--color-text-secondary)]">
            <p>MediaAPI Studio — Bring your own keys to generate and edit images and videos through 27+ cloud and local providers.</p>
            <p className="mt-2 text-[var(--text-xs)] text-[var(--color-text-muted)]">Your API keys are encrypted with envelope encryption (AES-GCM) and never leave the server unencrypted. Media is never stored on the server.</p>
          </div>
        </section>
      </div>
    </div>
  );
}
