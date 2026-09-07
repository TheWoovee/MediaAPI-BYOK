import { Outlet, NavLink, useLocation, useNavigate } from 'react-router';
import { useEffect, useState } from 'react';
import {
  Sparkles, Pencil, Film, Clock, Key, Server, Settings, WifiOff,
  PanelLeftClose, PanelLeftOpen, MoreHorizontal, X,
} from 'lucide-react';
import { useAppStore } from '../stores/app';
import { useModelsStore } from '../stores/models';
import { fetchMe } from '../lib/api';
import { applyTheme, getStoredTheme } from '../lib/theme';
import { ToastProvider } from '../components/Toast';

const NAV_ITEMS = [
  { to: '/generate', label: 'Generate', icon: Sparkles },
  { to: '/edit', label: 'Edit', icon: Pencil },
  { to: '/video', label: 'Video', icon: Film },
  { to: '/history', label: 'History', icon: Clock },
  { to: '/providers', label: 'Providers', icon: Key },
  { to: '/local', label: 'Local', icon: Server },
  { to: '/settings', label: 'Settings', icon: Settings },
];

/** First 4 items show as direct tabs on mobile; the rest live behind "More". */
const MOBILE_PRIMARY = NAV_ITEMS.slice(0, 4);
const MOBILE_OVERFLOW = NAV_ITEMS.slice(4);

export function Layout() {
  const email = useAppStore((s) => s.email);
  const setEmail = useAppStore((s) => s.setEmail);
  const online = useAppStore((s) => s.online);
  const setOnline = useAppStore((s) => s.setOnline);
  const collapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const loadModels = useModelsStore((s) => s.loadModels);
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const isOverflowActive = MOBILE_OVERFLOW.some((item) =>
    location.pathname.startsWith(item.to),
  );

  useEffect(() => {
    applyTheme(getStoredTheme());
    fetchMe().then((me) => setEmail(me.email)).catch(() => setEmail(null));
    loadModels();
  }, [setEmail, loadModels]);

  useEffect(() => {
    const handleOnline = () => setOnline(true);
    const handleOffline = () => setOnline(false);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [setOnline]);

  return (
    <ToastProvider>
      <div className="h-screen flex flex-col overflow-hidden bg-[var(--color-canvas)]">
        {!online && (
          <div className="flex items-center justify-center gap-2 py-1.5 px-4 bg-[var(--color-warning-subtle)] text-[var(--color-warning)] text-[var(--text-sm)] font-medium">
            <WifiOff size={14} />
            You are offline
          </div>
        )}

        <div className="flex flex-1 min-h-0">
          {/* Desktop left rail */}
          <nav
            className="hidden md:flex flex-col border-r border-[var(--color-border-subtle)] bg-[var(--color-panel)] shrink-0 transition-[width] duration-200"
            style={{
              width: collapsed ? '56px' : '180px',
              zIndex: 'var(--z-rail)',
            }}
          >
            <div className="flex items-center justify-between px-3 h-12 border-b border-[var(--color-border-subtle)]">
              {!collapsed && (
                <span className="text-[var(--text-md)] font-semibold text-[var(--color-text)] tracking-tight">
                  Studio
                </span>
              )}
              <button
                onClick={toggleSidebar}
                className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
              >
                {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
              </button>
            </div>

            <div className="flex-1 py-2 flex flex-col gap-0.5 px-2">
              {NAV_ITEMS.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-2.5 py-2 rounded-[var(--radius-sm)] text-[var(--text-sm)] font-medium transition-colors ${
                      isActive
                        ? 'bg-[var(--color-accent-subtle)] text-[var(--color-accent)]'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-tertiary)]'
                    }`
                  }
                  title={collapsed ? item.label : undefined}
                >
                  <item.icon size={18} className="shrink-0" />
                  {!collapsed && <span>{item.label}</span>}
                </NavLink>
              ))}
            </div>

            {email && !collapsed && (
              <div className="px-3 py-3 border-t border-[var(--color-border-subtle)]">
                <span className="text-[var(--text-xs)] text-[var(--color-text-muted)] truncate block">
                  {email}
                </span>
              </div>
            )}
          </nav>

          {/* Main content */}
          <main className="flex-1 min-w-0 overflow-y-auto pb-16 md:pb-0">
            <Outlet />
          </main>
        </div>

        {/* Mobile "More" slide-up sheet */}
        {moreOpen && (
          <div className="md:hidden fixed inset-0" style={{ zIndex: 'var(--z-modal, 50)' }}>
            {/* Backdrop */}
            <div
              className="absolute inset-0 bg-black/40"
              onClick={() => setMoreOpen(false)}
            />
            {/* Sheet */}
            <div className="absolute bottom-0 left-0 right-0 bg-[var(--color-panel)] rounded-t-2xl border-t border-[var(--color-border-subtle)] pb-safe">
              <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border-subtle)]">
                <span className="text-[var(--text-sm)] font-semibold text-[var(--color-text)]">
                  More
                </span>
                <button
                  onClick={() => setMoreOpen(false)}
                  className="p-1.5 rounded-[var(--radius-sm)] text-[var(--color-text-muted)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-tertiary)] transition-colors"
                >
                  <X size={18} />
                </button>
              </div>
              <div className="py-2">
                {MOBILE_OVERFLOW.map((item) => {
                  const isActive = location.pathname.startsWith(item.to);
                  return (
                    <button
                      key={item.to}
                      onClick={() => {
                        setMoreOpen(false);
                        navigate(item.to);
                      }}
                      className={`w-full flex items-center gap-3 px-5 py-3 text-[var(--text-sm)] font-medium transition-colors ${
                        isActive
                          ? 'text-[var(--color-accent)] bg-[var(--color-accent-subtle)]'
                          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-[var(--color-bg-tertiary)]'
                      }`}
                    >
                      <item.icon size={20} className="shrink-0" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Mobile bottom tab bar — 5 tabs */}
        <nav className="md:hidden flex border-t border-[var(--color-border-subtle)] bg-[var(--color-panel)] shrink-0 safe-area-bottom">
          {MOBILE_PRIMARY.map((item) => {
            const isActive = location.pathname.startsWith(item.to);
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
                  isActive
                    ? 'text-[var(--color-accent)]'
                    : 'text-[var(--color-text-muted)]'
                }`}
              >
                <item.icon size={20} />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={`flex-1 flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium transition-colors ${
              isOverflowActive || moreOpen
                ? 'text-[var(--color-accent)]'
                : 'text-[var(--color-text-muted)]'
            }`}
          >
            <MoreHorizontal size={20} />
            <span>More</span>
          </button>
        </nav>
      </div>
    </ToastProvider>
  );
}
