import './styles/tokens.css';
import './styles/app.css';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router';
import { BASE_PATH } from '@shared/config';
import { Layout } from './app/Layout';
import { GeneratePage } from './app/pages/Generate';
import { EditPage } from './app/pages/Edit';
import { HistoryPage } from './app/pages/History';
import { ProvidersPage } from './app/pages/Providers';
import { LocalPage } from './app/pages/Local';
import { SettingsPage } from './app/pages/Settings';

createRoot(document.getElementById('root')!).render(
  <BrowserRouter basename={BASE_PATH}>
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/generate" replace />} />
        <Route path="generate" element={<GeneratePage />} />
        <Route path="edit" element={<EditPage />} />
        <Route path="history" element={<HistoryPage />} />
        <Route path="providers" element={<ProvidersPage />} />
        <Route path="local" element={<LocalPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  </BrowserRouter>,
);
