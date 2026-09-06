import { Outlet, NavLink } from 'react-router';
import { useEffect, useState } from 'react';

const NAV_ITEMS = [
  { to: '/generate', label: 'Generate' },
  { to: '/edit', label: 'Edit' },
  { to: '/history', label: 'History' },
  { to: '/providers', label: 'Providers' },
  { to: '/local', label: 'Local' },
  { to: '/settings', label: 'Settings' },
];

export function Layout() {
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    fetch('/studio/api/me')
      .then((r) => r.json() as Promise<{ email?: string }>)
      .then((j) => setEmail(j.email ?? null))
      .catch(() => setEmail(null));
  }, []);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <header
        style={{
          borderBottom: '1px solid var(--color-border)',
          padding: '12px 24px',
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          backgroundColor: 'var(--color-bg-secondary)',
        }}
      >
        <span style={{ fontWeight: 700, fontSize: '18px' }}>Studio</span>
        <nav style={{ display: 'flex', gap: '16px', flex: 1 }}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              style={({ isActive }) => ({
                textDecoration: 'none',
                color: isActive ? 'var(--color-primary)' : 'var(--color-text-secondary)',
                fontWeight: isActive ? 600 : 400,
                fontSize: '14px',
              })}
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        {email && (
          <span style={{ fontSize: '13px', color: 'var(--color-text-muted)' }}>{email}</span>
        )}
      </header>
      <main style={{ flex: 1, padding: '24px', maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
        <Outlet />
      </main>
    </div>
  );
}
