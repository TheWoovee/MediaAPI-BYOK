import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router';

afterEach(cleanup);

vi.mock('../lib/api', () => ({
  fetchMe: vi.fn(async () => ({ email: 'test@test.com', kek_version: 1, reveal_count: 0 })),
  fetchProviders: vi.fn(async () => []),
  fetchCredentials: vi.fn(async () => []),
  fetchLocalServers: vi.fn(async () => []),
  fetchJobs: vi.fn(async () => ({ jobs: [], cursor: null })),
  createJob: vi.fn(async () => ({})),
  updateJob: vi.fn(async () => {}),
  fetchOutputUrl: vi.fn((url: string) => url),
  createCredential: vi.fn(async () => ({})),
  deleteCredential: vi.fn(async () => {}),
  setDefaultCredential: vi.fn(async () => {}),
  revealCredential: vi.fn(async () => ''),
  createLocalServer: vi.fn(async () => ({})),
  deleteLocalServer: vi.fn(async () => {}),
}));

vi.mock('../providers/index', () => ({
  getAdapter: vi.fn(),
  listAdapters: vi.fn(() => []),
  registerAdapter: vi.fn(),
}));

vi.mock('@shared/providers/registry', () => ({
  getProvider: vi.fn(),
  providers: [],
}));

vi.mock('../lib/gallery-db', () => ({
  saveToGallery: vi.fn(async () => 1),
  getGalleryItems: vi.fn(async () => []),
  clearGallery: vi.fn(async () => {}),
  getGalleryCount: vi.fn(async () => 0),
}));

vi.mock('../lib/theme', () => ({
  getStoredTheme: vi.fn(() => 'system'),
  setStoredTheme: vi.fn(),
  applyTheme: vi.fn(),
  getEffectiveTheme: vi.fn(() => 'dark'),
}));

import { Layout } from './Layout';
import { GeneratePage } from './pages/Generate';
import { EditPage } from './pages/Edit';
import { VideoPage } from './pages/Video';
import { HistoryPage } from './pages/History';
import { ProvidersPage } from './pages/Providers';
import { LocalPage } from './pages/Local';
import { SettingsPage } from './pages/Settings';

function renderRoute(path: string, element: React.ReactNode) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="*" element={element} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { headers: { 'content-type': 'application/json' } })));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('route render tests (no infinite loops)', () => {
  it('renders Generate without error', () => {
    expect(() => renderRoute('/generate', <GeneratePage />)).not.toThrow();
  });

  it('renders Edit without error', () => {
    expect(() => renderRoute('/edit', <EditPage />)).not.toThrow();
  });

  it('renders Video without error', () => {
    expect(() => renderRoute('/video', <VideoPage />)).not.toThrow();
  });

  it('renders History without error', () => {
    expect(() => renderRoute('/history', <HistoryPage />)).not.toThrow();
  });

  it('renders Providers without error', () => {
    expect(() => renderRoute('/providers', <ProvidersPage />)).not.toThrow();
  });

  it('renders Local without error', () => {
    expect(() => renderRoute('/local', <LocalPage />)).not.toThrow();
  });

  it('renders Settings without error', () => {
    expect(() => renderRoute('/settings', <SettingsPage />)).not.toThrow();
  });
});
