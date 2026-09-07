import { create } from 'zustand';
import type { GenerateRequest, JobHandle, JobStatus, NormalizedOutput, Capability } from '@shared/types';
import { getAdapter } from '../providers/index';
import { makeContext } from '../providers/transport';
import { getProvider } from '@shared/providers/registry';
import { fetchOutputUrl } from '../lib/api';
import * as api from '../lib/api';
import { saveToGallery } from '../lib/gallery-db';

export type JobState = 'queued' | 'submitted' | 'processing' | 'succeeded' | 'failed' | 'cancelled';

export interface Job {
  id: string;
  provider_id: string;
  model_id: string;
  capability: Capability;
  state: JobState;
  handle?: JobHandle;
  params: Record<string, unknown>;
  progress?: number;
  eta_seconds?: number;
  outputs?: NormalizedOutput[];
  blobUrls?: string[];
  error?: string;
  created_at: number;
  submitted_at?: number;
  finished_at?: number;
  credentialId?: string;
  abortController?: AbortController;
}

const POLL_INTERVALS: Record<string, number> = {
  text2image: 2000,
  image2image: 2000,
  inpaint: 2000,
  upscale: 2000,
  remove_bg: 2000,
  text2video: 5000,
  image2video: 5000,
  video2video: 5000,
  video_extend: 5000,
};

const MAX_POLL_INTERVAL = 15000;
const PERSIST_KEY = 'studio-jobs-v1';

interface JobsState {
  jobs: Map<string, Job>;
  getJob(id: string): Job | undefined;
  getActiveJobs(): Job[];
  getAllJobs(): Job[];
  submit(req: GenerateRequest, credentialId?: string): Promise<string>;
  cancel(id: string): void;
  clearFinished(): void;
}

function persistJobs(jobs: Map<string, Job>): void {
  try {
    const serializable = [...jobs.values()]
      .filter((j) => j.state === 'queued' || j.state === 'submitted' || j.state === 'processing')
      .map(({ abortController: _a, blobUrls: _b, ...rest }) => rest);
    localStorage.setItem(PERSIST_KEY, JSON.stringify(serializable));
  } catch { /* noop */ }
}

function loadPersistedJobs(): Job[] {
  try {
    const raw = localStorage.getItem(PERSIST_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Job[];
  } catch { return []; }
}

export const useJobsStore = create<JobsState>((set, get) => {
  function updateJob(id: string, updates: Partial<Job>): void {
    set((s) => {
      const jobs = new Map(s.jobs);
      const existing = jobs.get(id);
      if (existing) {
        jobs.set(id, { ...existing, ...updates });
      }
      persistJobs(jobs);
      return { jobs };
    });
  }

  async function downloadOutputs(job: Job, outputs: NormalizedOutput[]): Promise<string[]> {
    const urls: string[] = [];
    const spec = getProvider(job.provider_id);
    const isDirect = spec?.transport === 'direct';

    for (let i = 0; i < outputs.length; i++) {
      const out = outputs[i];
      let blob: Blob;

      if (out.source === 'base64') {
        const binary = atob(out.data as string);
        const bytes = new Uint8Array(binary.length);
        for (let j = 0; j < binary.length; j++) bytes[j] = binary.charCodeAt(j);
        blob = new Blob([bytes], { type: out.mime });
      } else if (out.source === 'url') {
        const fetchUrl = isDirect ? (out.data as string) : fetchOutputUrl(out.data as string);
        const res = await fetch(fetchUrl);
        blob = await res.blob();
      } else {
        blob = new Blob([out.data as ArrayBuffer], { type: out.mime });
      }

      urls.push(URL.createObjectURL(blob));

      const ext = out.mime.includes('video') ? 'mp4' : out.mime.includes('png') ? 'png' : 'jpg';
      const filename = `${job.provider_id}-${job.model_id}-${out.seed ?? Date.now()}.${ext}`;
      try {
        await saveToGallery({
          jobId: job.id,
          provider_id: job.provider_id,
          model_id: job.model_id,
          capability: job.capability,
          prompt: job.params.prompt as string | undefined,
          blob,
          mime: out.mime,
          filename,
          width: out.width,
          height: out.height,
          duration_s: out.duration_s,
          seed: out.seed,
          created_at: Date.now(),
        });
      } catch { /* gallery save is best-effort */ }
    }
    return urls;
  }

  async function pollJob(id: string): Promise<void> {
    const job = get().jobs.get(id);
    if (!job || !job.handle) return;
    if (job.state === 'cancelled' || job.state === 'succeeded' || job.state === 'failed') return;

    const adapter = getAdapter(job.provider_id);
    const spec = getProvider(job.provider_id);
    if (!adapter || !spec) {
      updateJob(id, { state: 'failed', error: 'Adapter not found', finished_at: Date.now() });
      return;
    }

    const ctx = makeContext(spec, {
      credentialId: job.credentialId,
      signal: job.abortController?.signal,
    });

    let status: JobStatus;
    try {
      status = await adapter.poll(job.handle, ctx);
    } catch (e) {
      updateJob(id, { state: 'failed', error: (e as Error).message, finished_at: Date.now() });
      api.updateJob(id, { status: 'failed', error: (e as Error).message }).catch(() => {});
      return;
    }

    if (job.abortController?.signal.aborted) return;

    if (status.state === 'succeeded' && status.outputs) {
      const blobUrls = await downloadOutputs(job, status.outputs);
      updateJob(id, {
        state: 'succeeded',
        outputs: status.outputs,
        blobUrls,
        progress: 100,
        finished_at: Date.now(),
      });
      api.updateJob(id, {
        status: 'succeeded',
        outputs_json: JSON.stringify(status.outputs.map(({ data: _d, ...rest }) => rest)),
      }).catch(() => {});
      return;
    }

    if (status.state === 'failed') {
      updateJob(id, { state: 'failed', error: status.error ?? 'Job failed', finished_at: Date.now() });
      api.updateJob(id, { status: 'failed', error: status.error }).catch(() => {});
      return;
    }

    updateJob(id, {
      state: status.state === 'queued' ? 'submitted' : 'processing',
      progress: status.progress,
      eta_seconds: status.eta_seconds,
    });

    const baseInterval = POLL_INTERVALS[job.capability] ?? 2000;
    const elapsed = Date.now() - (job.submitted_at ?? job.created_at);
    const backoff = Math.min(baseInterval * Math.pow(1.2, Math.floor(elapsed / 10000)), MAX_POLL_INTERVAL);

    setTimeout(() => pollJob(id), backoff);
  }

  const persisted = loadPersistedJobs();
  const initialJobs = new Map<string, Job>();
  for (const j of persisted) {
    const ac = new AbortController();
    initialJobs.set(j.id, { ...j, abortController: ac });
    setTimeout(() => pollJob(j.id), 1000);
  }

  return {
    jobs: initialJobs,

    getJob(id: string) {
      return get().jobs.get(id);
    },

    getActiveJobs() {
      return [...get().jobs.values()].filter((j) => j.state === 'queued' || j.state === 'submitted' || j.state === 'processing');
    },

    getAllJobs() {
      return [...get().jobs.values()].sort((a, b) => b.created_at - a.created_at);
    },

    async submit(req: GenerateRequest, credentialId?: string) {
      const id = crypto.randomUUID();
      const ac = new AbortController();

      const job: Job = {
        id,
        provider_id: req.provider_id,
        model_id: req.model_id,
        capability: req.capability,
        state: 'queued',
        params: req.params,
        created_at: Date.now(),
        credentialId: credentialId ?? req.credential_id,
        abortController: ac,
      };

      set((s) => {
        const jobs = new Map(s.jobs);
        jobs.set(id, job);
        persistJobs(jobs);
        return { jobs };
      });

      api.createJob({
        id,
        provider_id: req.provider_id,
        model_id: req.model_id,
        capability: req.capability,
        request_json: JSON.stringify(req.params),
        status: 'queued',
        created_at: Date.now(),
        updated_at: Date.now(),
      }).catch(() => {});

      const adapter = getAdapter(req.provider_id);
      const spec = getProvider(req.provider_id);

      if (!adapter || !spec) {
        updateJob(id, { state: 'failed', error: 'No adapter for this provider', finished_at: Date.now() });
        return id;
      }

      const ctx = makeContext(spec, {
        credentialId: credentialId ?? req.credential_id,
        signal: ac.signal,
      });

      try {
        const handle = await adapter.submit(req, ctx);
        updateJob(id, { state: 'submitted', handle, submitted_at: Date.now() });
        api.updateJob(id, { status: 'processing', provider_ref_json: JSON.stringify(handle.provider_ref) }).catch(() => {});
        pollJob(id);
      } catch (e) {
        updateJob(id, { state: 'failed', error: (e as Error).message, finished_at: Date.now() });
        api.updateJob(id, { status: 'failed', error: (e as Error).message }).catch(() => {});
      }

      return id;
    },

    cancel(id: string) {
      const job = get().jobs.get(id);
      if (!job) return;
      job.abortController?.abort();

      const adapter = getAdapter(job.provider_id);
      const spec = getProvider(job.provider_id);
      if (adapter?.cancel && job.handle && spec) {
        const ctx = makeContext(spec, { credentialId: job.credentialId });
        adapter.cancel(job.handle, ctx).catch(() => {});
      }

      updateJob(id, { state: 'cancelled', finished_at: Date.now() });
      api.updateJob(id, { status: 'cancelled' }).catch(() => {});
    },

    clearFinished() {
      set((s) => {
        const jobs = new Map(s.jobs);
        for (const [id, job] of jobs) {
          if (job.state === 'succeeded' || job.state === 'failed' || job.state === 'cancelled') {
            if (job.blobUrls) job.blobUrls.forEach(URL.revokeObjectURL);
            jobs.delete(id);
          }
        }
        persistJobs(jobs);
        return { jobs };
      });
    },
  };
});
