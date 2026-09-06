import { Hono } from 'hono';
import { BASE_PATH } from '@shared/config';
import { identify } from './access';
import { proxyApp } from './proxy';
import { credentialsApp } from './routes/credentials';
import { localServersApp } from './routes/local-servers';
import { jobsApp } from './routes/jobs';
import { uploadsApp, cleanExpiredUploads } from './routes/uploads';
import { securityHeaders } from './security';
import { providers } from '@shared/providers/registry';
import type { WorkerEnv } from './types';

const app = new Hono<{ Bindings: WorkerEnv }>().basePath(BASE_PATH);

app.use('*', securityHeaders);

app.get('/api/health', (c) => c.json({ ok: true, ts: Date.now() }));

app.get('/api/tmp/:id', async (c) => {
  const id = c.req.param('id');
  const row = await c.env.DB.prepare('SELECT r2_key, mime, expires_at FROM temp_uploads WHERE id=?')
    .bind(id)
    .first<{ r2_key: string; mime: string; expires_at: number }>();

  if (!row || row.expires_at < Date.now()) return c.json({ error: 'not found' }, 404);

  const obj = await c.env.TMP.get(row.r2_key);
  if (!obj) return c.json({ error: 'not found' }, 404);

  return new Response(obj.body, {
    headers: {
      'content-type': row.mime,
      'cache-control': 'private, max-age=3600',
    },
  });
});

app.use('/api/*', async (c, next) => {
  if (c.req.path === `${BASE_PATH}/api/health` || c.req.path.startsWith(`${BASE_PATH}/api/tmp/`)) {
    return next();
  }
  const id = await identify(c.req.raw, c.env);
  if (!id) return c.json({ error: 'unauthenticated' }, 403);
  c.set('email' as never, id.email as never);
  await next();
});

app.get('/api/me', async (c) => {
  const email = c.get('email' as never) as string;
  const user = await c.env.DB.prepare('SELECT kek_version, reveal_count FROM users WHERE email=?')
    .bind(email)
    .first<{ kek_version: number; reveal_count: number }>();
  return c.json({ email, kek_version: user?.kek_version ?? null, reveal_count: user?.reveal_count ?? 0 });
});

app.get('/api/providers', (c) => {
  return c.json({
    providers: providers.map((p) => ({
      id: p.id,
      label: p.label,
      wave: p.wave,
      transport: p.transport,
      hosts: p.hosts,
      auth: { header: p.auth.header, scheme: p.auth.scheme, help: p.auth.help },
      inputModes: p.inputModes,
      outputExpiry: p.outputExpiry,
    })),
  });
});

app.route('/api', credentialsApp);
app.route('/api', localServersApp);
app.route('/api', proxyApp);
app.route('/api', jobsApp);
app.route('/api', uploadsApp);

app.get('*', async (c) => {
  const url = new URL(c.req.url);
  const accept = c.req.header('accept') ?? '';
  if (accept.includes('text/html') || url.pathname === BASE_PATH || url.pathname === `${BASE_PATH}/`) {
    return c.env.ASSETS.fetch(new Request(new URL(`${BASE_PATH}/`, url), { headers: c.req.raw.headers }));
  }
  return c.env.ASSETS.fetch(c.req.raw);
});

export default {
  fetch: app.fetch,
  async scheduled(_event: ScheduledEvent, env: WorkerEnv, _ctx: ExecutionContext): Promise<void> {
    await cleanExpiredUploads(env);
  },
};
