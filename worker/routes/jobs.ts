import { Hono } from 'hono';
import type { WorkerEnv } from '../types';

export const jobsApp = new Hono<{ Bindings: WorkerEnv }>();

jobsApp.get('/jobs', async (c) => {
  const email = c.get('email' as never) as string;
  const cursor = c.req.query('cursor');
  const limit = Math.min(Number(c.req.query('limit') ?? 50), 100);

  let query = 'SELECT * FROM jobs WHERE email=?';
  const params: unknown[] = [email];

  if (cursor) {
    query += ' AND created_at < ?';
    params.push(Number(cursor));
  }

  query += ' ORDER BY created_at DESC LIMIT ?';
  params.push(limit + 1);

  const rows = await c.env.DB.prepare(query).bind(...params).all();
  const results = rows.results.slice(0, limit);
  const hasMore = rows.results.length > limit;

  return c.json({
    jobs: results,
    next_cursor: hasMore && results.length > 0 ? (results[results.length - 1] as { created_at: number }).created_at : null,
  });
});

jobsApp.post('/jobs', async (c) => {
  const email = c.get('email' as never) as string;
  const body = await c.req.json<{
    provider_id: string;
    model_id: string;
    capability: string;
    request_json: string;
    provider_ref_json?: string;
    status: string;
  }>();

  const id = crypto.randomUUID();
  const now = Date.now();

  await c.env.DB.prepare(
    'INSERT INTO jobs (id,email,provider_id,model_id,capability,request_json,provider_ref_json,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(id, email, body.provider_id, body.model_id, body.capability, body.request_json, body.provider_ref_json ?? null, body.status, now, now)
    .run();

  return c.json({ id }, 201);
});

jobsApp.patch('/jobs/:id', async (c) => {
  const email = c.get('email' as never) as string;
  const jobId = c.req.param('id');
  const body = await c.req.json<{
    status?: string;
    provider_ref_json?: string;
    outputs_json?: string;
    error?: string;
    cost_hint?: string;
  }>();

  const updates: string[] = [];
  const values: unknown[] = [];

  for (const [key, value] of Object.entries(body)) {
    if (value !== undefined) {
      updates.push(`${key}=?`);
      values.push(value);
    }
  }
  if (updates.length === 0) return c.json({ ok: true });

  updates.push('updated_at=?');
  values.push(Date.now());
  values.push(jobId);
  values.push(email);

  const result = await c.env.DB.prepare(`UPDATE jobs SET ${updates.join(',')} WHERE id=? AND email=?`)
    .bind(...values)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});
