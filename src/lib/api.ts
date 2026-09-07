import { BASE_PATH } from '@shared/config';
import type { Credential, LocalServer, JobRecord } from '@shared/types';

const base = `${BASE_PATH}/api`;

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(body || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchMe(): Promise<{ email: string; kek_version: number | null; reveal_count: number }> {
  return json(await fetch(`${base}/me`));
}

export async function fetchProviders(): Promise<{ providers: Array<{ id: string; label: string; wave: number; transport: string; hosts: string[]; auth: { header: string; scheme?: string; help: string }; inputModes: string[]; outputExpiry?: string }> }> {
  return json(await fetch(`${base}/providers`));
}

export async function fetchCredentials(): Promise<{ credentials: Credential[] }> {
  return json(await fetch(`${base}/credentials`));
}

export async function createCredential(data: { provider_id: string; label: string; secret: string }): Promise<Credential> {
  return json(await fetch(`${base}/credentials`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }));
}

export async function deleteCredential(id: string): Promise<void> {
  const res = await fetch(`${base}/credentials/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function setDefaultCredential(id: string): Promise<void> {
  const res = await fetch(`${base}/credentials/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ is_default: true }) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function revealCredential(id: string): Promise<{ secret: string }> {
  return json(await fetch(`${base}/credentials/${id}/reveal`, { method: 'POST' }));
}

export async function fetchLocalServers(): Promise<{ servers: LocalServer[] }> {
  return json(await fetch(`${base}/local-servers`));
}

export async function createLocalServer(data: { kind: string; label: string; base_url: string; mode: 'direct' | 'relay'; auth?: string }): Promise<LocalServer> {
  return json(await fetch(`${base}/local-servers`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }));
}

export async function deleteLocalServer(id: string): Promise<void> {
  const res = await fetch(`${base}/local-servers/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export async function fetchJobs(cursor?: string): Promise<{ jobs: JobRecord[]; cursor?: string }> {
  const qs = cursor ? `?cursor=${cursor}` : '';
  return json(await fetch(`${base}/jobs${qs}`));
}

export async function createJob(data: Partial<JobRecord>): Promise<JobRecord> {
  return json(await fetch(`${base}/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) }));
}

export async function updateJob(id: string, data: Partial<JobRecord>): Promise<void> {
  const res = await fetch(`${base}/jobs/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(data) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

export function fetchOutputUrl(url: string): string {
  return `${base}/fetch?url=${encodeURIComponent(url)}`;
}
