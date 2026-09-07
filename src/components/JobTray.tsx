import { Loader2, X, Check, AlertCircle } from 'lucide-react';
import { useJobsStore, type Job } from '../jobs/runner';

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

function JobItem({ job }: { job: Job }) {
  const cancel = useJobsStore((s) => s.cancel);
  const elapsed = Date.now() - job.created_at;

  const stateIcon = {
    queued: <Loader2 size={14} className="animate-spin text-[var(--color-text-muted)]" />,
    submitted: <Loader2 size={14} className="animate-spin text-[var(--color-accent)]" />,
    processing: <Loader2 size={14} className="animate-spin text-[var(--color-accent)]" />,
    succeeded: <Check size={14} className="text-[var(--color-success)]" />,
    failed: <AlertCircle size={14} className="text-[var(--color-danger)]" />,
    cancelled: <X size={14} className="text-[var(--color-text-muted)]" />,
  }[job.state];

  const isActive = job.state === 'queued' || job.state === 'submitted' || job.state === 'processing';

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-[var(--text-sm)]">
      {stateIcon}
      <span className="flex-1 truncate text-[var(--color-text-secondary)]">
        {job.model_id}
      </span>
      {isActive && (
        <>
          {job.progress != null && job.progress > 0 && (
            <span className="text-[var(--text-xs)] text-[var(--color-text-muted)] tabular-nums">
              {Math.round(job.progress)}%
            </span>
          )}
          {job.eta_seconds != null && (
            <span className="text-[var(--text-xs)] text-[var(--color-text-muted)] tabular-nums">
              ~{job.eta_seconds}s
            </span>
          )}
          <span className="text-[var(--text-xs)] text-[var(--color-text-muted)] tabular-nums">
            {formatElapsed(elapsed)}
          </span>
          <button
            onClick={() => cancel(job.id)}
            className="p-0.5 rounded text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:bg-[var(--color-danger-subtle)] transition-colors"
            title="Cancel"
          >
            <X size={12} />
          </button>
        </>
      )}
      {job.state === 'failed' && (
        <span className="text-[var(--text-xs)] text-[var(--color-danger)] truncate max-w-[120px]" title={job.error}>
          {job.error}
        </span>
      )}
    </div>
  );
}

export function JobTray() {
  const jobs = useJobsStore((s) => s.getAllJobs());

  if (jobs.length === 0) return null;

  const active = jobs.filter((j) => j.state === 'queued' || j.state === 'submitted' || j.state === 'processing');
  const finished = jobs.filter((j) => j.state !== 'queued' && j.state !== 'submitted' && j.state !== 'processing');

  return (
    <div className="border border-[var(--color-border)] rounded-[var(--radius-md)] bg-[var(--color-panel)] overflow-hidden">
      {active.length > 0 && (
        <div className="border-b border-[var(--color-border-subtle)]">
          <div className="px-3 py-1.5 text-[var(--text-xs)] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
            Active ({active.length})
          </div>
          {active.map((j) => <JobItem key={j.id} job={j} />)}
        </div>
      )}
      {finished.length > 0 && (
        <div>
          <div className="px-3 py-1.5 text-[var(--text-xs)] font-medium text-[var(--color-text-muted)] uppercase tracking-wider">
            Recent
          </div>
          {finished.slice(0, 5).map((j) => <JobItem key={j.id} job={j} />)}
        </div>
      )}
    </div>
  );
}
