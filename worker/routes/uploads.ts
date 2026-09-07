import { Hono } from 'hono';
import { BASE_PATH } from '@shared/config';
import type { WorkerEnv } from '../types';

const UPLOAD_TTL_MS = 60 * 60 * 1000; // 1 hour
const ALLOWED_MIME_RE = /^(image|video)\//;

export const TMP_PATH = '/api/tmp/';

export const uploadsApp = new Hono<{ Bindings: WorkerEnv }>();

uploadsApp.post('/uploads', async (c) => {
  const email = c.get('email' as never) as string;
  const contentType = c.req.header('content-type') ?? 'application/octet-stream';

  if (!ALLOWED_MIME_RE.test(contentType)) {
    return c.json({ error: 'only image/* and video/* content types are accepted' }, 400);
  }

  const body = await c.req.arrayBuffer();
  if (body.byteLength === 0) return c.json({ error: 'empty body' }, 400);
  if (body.byteLength > 50 * 1024 * 1024) return c.json({ error: 'file too large (50MB max)' }, 400);

  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  const id = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
  const r2Key = `tmp/${id}`;
  const now = Date.now();
  const expiresAt = now + UPLOAD_TTL_MS;

  if (!c.env.TMP) return c.json({ error: 'temporary uploads are not configured on this deployment (R2 bucket missing)' }, 501);
  await c.env.TMP.put(r2Key, body, { httpMetadata: { contentType } });
  await c.env.DB.prepare(
    'INSERT INTO temp_uploads (id, email, r2_key, mime, bytes, expires_at) VALUES (?,?,?,?,?,?)',
  )
    .bind(id, email, r2Key, contentType, body.byteLength, expiresAt)
    .run();

  const origin = new URL(c.req.url).origin;
  return c.json({ id, url: `${origin}${BASE_PATH}${TMP_PATH}${id}`, expires_at: expiresAt }, 201);
});

uploadsApp.get('/tmp/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT r2_key, mime, expires_at FROM temp_uploads WHERE id=?')
    .bind(id)
    .first<{ r2_key: string; mime: string; expires_at: number }>();

  if (!row || row.expires_at < Date.now()) return c.json({ error: 'not found' }, 404);

  if (!c.env.TMP) return c.json({ error: 'not found' }, 404);
  const obj = await c.env.TMP.get(row.r2_key);
  if (!obj) return c.json({ error: 'not found' }, 404);

  return new Response(obj.body, {
    headers: {
      'content-type': row.mime,
      'cache-control': 'private, max-age=3600',
    },
  });
});

export async function cleanExpiredUploads(env: WorkerEnv): Promise<number> {
  const now = Date.now();
  const expired = await env.DB.prepare('SELECT id, r2_key FROM temp_uploads WHERE expires_at < ?').bind(now).all();
  let count = 0;
  for (const row of expired.results as { id: string; r2_key: string }[]) {
    if (env.TMP) await env.TMP.delete(row.r2_key);
    await env.DB.prepare('DELETE FROM temp_uploads WHERE id=?').bind(row.id).run();
    count++;
  }
  return count;
}
