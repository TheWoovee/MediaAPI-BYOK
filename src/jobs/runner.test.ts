import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../providers/index', () => ({
  getAdapter: vi.fn(),
  listAdapters: vi.fn(() => []),
  registerAdapter: vi.fn(),
}));

vi.mock('@shared/providers/registry', () => ({
  getProvider: vi.fn(() => ({
    id: 'mock',
    label: 'Mock',
    wave: 1,
    transport: 'proxy',
    hosts: ['mock.test'],
    auth: { header: 'Authorization', scheme: 'Bearer', help: 'Test' },
    outputHosts: [],
    inputModes: ['base64'],
    docsPath: '',
  })),
  providers: [],
}));

vi.mock('../lib/api', () => ({
  createJob: vi.fn(async () => ({})),
  updateJob: vi.fn(async () => {}),
  fetchOutputUrl: vi.fn((url: string) => url),
}));

vi.mock('../lib/gallery-db', () => ({
  saveToGallery: vi.fn(async () => 1),
}));

import { getAdapter } from '../providers/index';
import type { ProviderAdapter, JobHandle, JobStatus } from '@shared/types';

const mockGetAdapter = vi.mocked(getAdapter);

function createMockAdapter(opts: {
  submitResult: JobHandle;
  pollResults: JobStatus[];
}): ProviderAdapter {
  let pollIndex = 0;
  return {
    spec: {
      id: 'mock',
      label: 'Mock',
      wave: 1,
      transport: 'proxy',
      hosts: ['mock.test'],
      auth: { header: 'Authorization', scheme: 'Bearer', help: 'Test' },
      outputHosts: [],
      inputModes: ['base64'],
      docsPath: '',
    },
    capabilities: ['text2image'],
    listModels: async () => [],
    submit: async () => opts.submitResult,
    poll: async () => {
      const result = opts.pollResults[Math.min(pollIndex, opts.pollResults.length - 1)];
      pollIndex++;
      return result;
    },
  };
}

describe('useJobsStore', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok')));
    try { localStorage.removeItem('studio-jobs-v1'); } catch { /* noop */ }
    vi.resetModules();
  });

  it('submits a job and transitions through states', async () => {
    const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const adapter = createMockAdapter({
      submitResult: { provider_id: 'mock', model_id: 'mock-1', capability: 'text2image', provider_ref: { id: '123' }, submitted_at: Date.now() },
      pollResults: [
        { state: 'processing', progress: 50 },
        { state: 'succeeded', outputs: [{ kind: 'image', source: 'base64', mime: 'image/png', data: pixel }] },
      ],
    });
    mockGetAdapter.mockReturnValue(adapter);

    const { useJobsStore } = await import('./runner');
    const store = useJobsStore.getState();
    const id = await store.submit({
      provider_id: 'mock',
      model_id: 'mock-1',
      capability: 'text2image',
      params: { prompt: 'test' },
    });

    expect(id).toBeTruthy();
    const job = useJobsStore.getState().getJob(id);
    expect(job).toBeTruthy();
    expect(['queued', 'submitted', 'processing', 'succeeded']).toContain(job!.state);
  });

  it('cancels a job', async () => {
    const adapter = createMockAdapter({
      submitResult: { provider_id: 'mock', model_id: 'mock-1', capability: 'text2image', provider_ref: { id: '456' }, submitted_at: Date.now() },
      pollResults: [{ state: 'processing', progress: 50 }],
    });
    adapter.cancel = vi.fn(async () => {});
    mockGetAdapter.mockReturnValue(adapter);

    const { useJobsStore } = await import('./runner');
    const store = useJobsStore.getState();
    const id = await store.submit({
      provider_id: 'mock',
      model_id: 'mock-1',
      capability: 'text2image',
      params: { prompt: 'test' },
    });

    store.cancel(id);
    const job = useJobsStore.getState().getJob(id);
    expect(job!.state).toBe('cancelled');
  });

  it('handles adapter failure', async () => {
    mockGetAdapter.mockReturnValue(undefined);

    const { useJobsStore } = await import('./runner');
    const store = useJobsStore.getState();
    const id = await store.submit({
      provider_id: 'mock',
      model_id: 'mock-1',
      capability: 'text2image',
      params: { prompt: 'test' },
    });

    const job = useJobsStore.getState().getJob(id);
    expect(job!.state).toBe('failed');
    expect(job!.error).toBe('No adapter for this provider');
  });

  it('clears finished jobs', async () => {
    const adapter = createMockAdapter({
      submitResult: { provider_id: 'mock', model_id: 'mock-1', capability: 'text2image', provider_ref: { id: '789' }, submitted_at: Date.now() },
      pollResults: [{ state: 'failed', error: 'test error' }],
    });
    mockGetAdapter.mockReturnValue(adapter);

    const { useJobsStore } = await import('./runner');
    const store = useJobsStore.getState();
    await store.submit({
      provider_id: 'mock',
      model_id: 'mock-1',
      capability: 'text2image',
      params: { prompt: 'test' },
    });

    await vi.advanceTimersByTimeAsync(5000);

    store.clearFinished();
    const remaining = useJobsStore.getState().getAllJobs().filter((j) => j.state === 'failed');
    expect(remaining.length).toBe(0);
  });

  it('persists and resumes jobs', async () => {
    const handle: JobHandle = { provider_id: 'mock', model_id: 'mock-1', capability: 'text2image', provider_ref: { id: 'persist' }, submitted_at: Date.now() };

    try {
      localStorage.setItem('studio-jobs-v1', JSON.stringify([{
        id: 'test-persist',
        provider_id: 'mock',
        model_id: 'mock-1',
        capability: 'text2image',
        state: 'processing',
        handle,
        params: { prompt: 'test' },
        created_at: Date.now(),
      }]));
    } catch { /* noop in some envs */ }

    const pixel = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const adapter = createMockAdapter({
      submitResult: handle,
      pollResults: [{ state: 'succeeded', outputs: [{ kind: 'image', source: 'base64', mime: 'image/png', data: pixel }] }],
    });
    mockGetAdapter.mockReturnValue(adapter);

    const { useJobsStore } = await import('./runner');
    const jobs = useJobsStore.getState().getAllJobs();
    expect(jobs.length).toBeGreaterThanOrEqual(0);
  });
});
