import './styles/tokens.css';
import './styles/app.css';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { lazy, Suspense } from 'react';
import { BASE_PATH } from '@shared/config';
import { Layout } from './app/Layout';

const GeneratePage = lazy(() => import('./app/pages/Generate').then((m) => ({ default: m.GeneratePage })));
const EditPage = lazy(() => import('./app/pages/Edit').then((m) => ({ default: m.EditPage })));
const VideoPage = lazy(() => import('./app/pages/Video').then((m) => ({ default: m.VideoPage })));
const HistoryPage = lazy(() => import('./app/pages/History').then((m) => ({ default: m.HistoryPage })));
const ProvidersPage = lazy(() => import('./app/pages/Providers').then((m) => ({ default: m.ProvidersPage })));
const LocalPage = lazy(() => import('./app/pages/Local').then((m) => ({ default: m.LocalPage })));
const SettingsPage = lazy(() => import('./app/pages/Settings').then((m) => ({ default: m.SettingsPage })));

if (import.meta.env.DEV) {
  import('./providers/mock').then(({ mockAdapter }) => {
    import('./providers/index').then(({ registerAdapter }) => {
      registerAdapter(mockAdapter);
    });
  });
}

function Loading() {
  return (
    <div className="flex items-center justify-center h-full">
      <div className="w-6 h-6 border-2 border-[var(--color-accent)] border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename={BASE_PATH}>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/generate" replace />} />
        <Route path="generate" element={<Suspense fallback={<Loading />}><GeneratePage /></Suspense>} />
        <Route path="edit" element={<Suspense fallback={<Loading />}><EditPage /></Suspense>} />
        <Route path="video" element={<Suspense fallback={<Loading />}><VideoPage /></Suspense>} />
        <Route path="history" element={<Suspense fallback={<Loading />}><HistoryPage /></Suspense>} />
        <Route path="providers" element={<Suspense fallback={<Loading />}><ProvidersPage /></Suspense>} />
        <Route path="local" element={<Suspense fallback={<Loading />}><LocalPage /></Suspense>} />
        <Route path="settings" element={<Suspense fallback={<Loading />}><SettingsPage /></Suspense>} />
      </Route>
    </Routes>
  </BrowserRouter>,
);
