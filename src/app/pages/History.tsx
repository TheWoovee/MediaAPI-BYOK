import { useState, useEffect, useCallback, useMemo } from 'react';
import { Clock, RefreshCw, Trash2, Image, Film, Filter, HardDrive } from 'lucide-react';
import type { JobRecord } from '@shared/types';
import * as api from '../../lib/api';
import { getGalleryItems, getGalleryCount, clearGallery, type GalleryItem } from '../../lib/gallery-db';
import { providers } from '@shared/providers/registry';
import { EmptyState } from '../../components/EmptyState';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';

type Tab = 'server' | 'device';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function statusBadge(status: string) {
  const colors: Record<string, string> = {
    succeeded: 'bg-[var(--color-success-subtle)] text-[var(--color-success)]',
    failed: 'bg-[var(--color-danger-subtle)] text-[var(--color-danger)]',
    processing: 'bg-[var(--color-info-subtle)] text-[var(--color-info)]',
    queued: 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]',
    cancelled: 'bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]',
  };
  return (
    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colors[status] ?? ''}`}>
      {status}
    </span>
  );
}

export function HistoryPage() {
  const [tab, setTab] = useState<Tab>('server');
  const [jobs, setJobs] = useState<JobRecord[]>([]);
  const [cursor, setCursor] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [filterProvider, setFilterProvider] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [galleryCount, setGalleryCount] = useState(0);
  const { toast } = useToast();

  const loadJobs = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const result = await api.fetchJobs(reset ? undefined : cursor);
      if (reset) {
        setJobs(result.jobs);
      } else {
        setJobs((prev) => [...prev, ...result.jobs]);
      }
      setCursor(result.cursor);
    } catch { /* noop */ }
    setLoading(false);
  }, [cursor]);

  const loadGallery = useCallback(async () => {
    const items = await getGalleryItems(200);
    setGalleryItems(items);
    setGalleryCount(await getGalleryCount());
  }, []);

  useEffect(() => {
    loadJobs(true);
    loadGallery();
  }, []);

  const handleClearGallery = useCallback(async () => {
    await clearGallery();
    setGalleryItems([]);
    setGalleryCount(0);
    toast('Device gallery cleared', 'success');
  }, [toast]);

  const filtered = useMemo(() => {
    return jobs.filter((j) => {
      if (filterProvider && j.provider_id !== filterProvider) return false;
      if (filterStatus && j.status !== filterStatus) return false;
      return true;
    });
  }, [jobs, filterProvider, filterStatus]);

  const grouped = useMemo(() => {
    const groups = new Map<string, JobRecord[]>();
    for (const j of filtered) {
      const day = formatDate(j.created_at);
      const list = groups.get(day) ?? [];
      list.push(j);
      groups.set(day, list);
    }
    return groups;
  }, [filtered]);

  const providerLabel = (id: string) => providers.find((p) => p.id === id)?.label ?? id;
  const uniqueProviders = [...new Set(jobs.map((j) => j.provider_id))];

  return (
    <div className="p-4 lg:p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-[var(--text-xl)] font-semibold">History</h1>
        <div className="flex gap-2">
          <Button size="sm" variant={tab === 'server' ? 'primary' : 'secondary'} icon={<Clock size={14} />} onClick={() => setTab('server')}>
            Jobs
          </Button>
          <Button size="sm" variant={tab === 'device' ? 'primary' : 'secondary'} icon={<HardDrive size={14} />} onClick={() => setTab('device')}>
            Device ({galleryCount})
          </Button>
        </div>
      </div>

      {tab === 'server' && (
        <>
          <div className="flex gap-2 mb-4 flex-wrap">
            <div className="flex items-center gap-1.5">
              <Filter size={14} className="text-[var(--color-text-muted)]" />
              <select
                value={filterProvider}
                onChange={(e) => setFilterProvider(e.target.value)}
                className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1 text-[var(--text-sm)]"
              >
                <option value="">All providers</option>
                {uniqueProviders.map((p) => <option key={p} value={p}>{providerLabel(p)}</option>)}
              </select>
            </div>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-[var(--radius-sm)] px-2 py-1 text-[var(--text-sm)]"
            >
              <option value="">All statuses</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
              <option value="processing">Processing</option>
              <option value="cancelled">Cancelled</option>
            </select>
            <Button size="sm" variant="ghost" icon={<RefreshCw size={14} />} onClick={() => loadJobs(true)} loading={loading}>
              Refresh
            </Button>
          </div>

          {filtered.length === 0 ? (
            <EmptyState
              icon={Clock}
              title="No jobs found"
              description={loading ? 'Loading...' : 'Your generation history will appear here'}
            />
          ) : (
            <div className="flex flex-col gap-6">
              {[...grouped.entries()].map(([day, dayJobs]) => (
                <div key={day}>
                  <h3 className="text-[var(--text-sm)] font-medium text-[var(--color-text-muted)] mb-2">{day}</h3>
                  <div className="flex flex-col gap-1">
                    {dayJobs.map((j) => {
                      const isImage = !['text2video', 'image2video', 'video2video', 'video_extend'].includes(j.capability);
                      return (
                        <div key={j.id} className="flex items-center gap-3 px-3 py-2.5 rounded-[var(--radius-sm)] hover:bg-[var(--color-bg-secondary)] transition-colors group">
                          <div className="w-8 h-8 rounded-[var(--radius-sm)] bg-[var(--color-bg-tertiary)] flex items-center justify-center shrink-0">
                            {isImage ? <Image size={14} className="text-[var(--color-text-muted)]" /> : <Film size={14} className="text-[var(--color-text-muted)]" />}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-[var(--text-sm)] font-medium truncate">{j.model_id}</span>
                              {statusBadge(j.status)}
                            </div>
                            <div className="flex items-center gap-2 text-[var(--text-xs)] text-[var(--color-text-muted)]">
                              <span>{providerLabel(j.provider_id)}</span>
                              <span>&middot;</span>
                              <span>{j.capability.replace('2', '→')}</span>
                              <span>&middot;</span>
                              <span>{formatTime(j.created_at)}</span>
                            </div>
                          </div>
                          {j.error && (
                            <span className="text-[var(--text-xs)] text-[var(--color-danger)] max-w-[200px] truncate" title={j.error}>
                              {j.error}
                            </span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
              {cursor && (
                <Button size="sm" variant="ghost" onClick={() => loadJobs()} loading={loading}>
                  Load more
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {tab === 'device' && (
        <>
          <div className="flex items-center justify-between mb-4">
            <p className="text-[var(--text-sm)] text-[var(--color-text-muted)]">
              {galleryCount} items saved on this device
            </p>
            {galleryCount > 0 && (
              <Button size="sm" variant="danger" icon={<Trash2 size={14} />} onClick={handleClearGallery}>
                Clear Gallery
              </Button>
            )}
          </div>
          {galleryItems.length === 0 ? (
            <EmptyState
              icon={HardDrive}
              title="Device gallery empty"
              description="Generated outputs are saved here automatically for offline access"
            />
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {galleryItems.map((item) => {
                const isVideo = item.mime.startsWith('video/');
                const url = URL.createObjectURL(item.blob);
                return (
                  <div key={item.id} className="rounded-[var(--radius-md)] overflow-hidden bg-[var(--color-bg-tertiary)] group relative">
                    {isVideo ? (
                      <video src={url} className="w-full aspect-video object-cover" controls playsInline />
                    ) : (
                      <img src={url} alt={item.filename} className="w-full aspect-square object-cover" loading="lazy" />
                    )}
                    <div className="p-2">
                      <div className="text-[var(--text-xs)] text-[var(--color-text-muted)] truncate">{item.filename}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
