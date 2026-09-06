import { Hono } from 'hono';
import type { WorkerEnv } from '../types';
import { importKek, newDek, wrapDek, unwrapDek, seal, open } from '../crypto';

export const credentialsApp = new Hono<{ Bindings: WorkerEnv }>();

credentialsApp.get('/credentials', async (c) => {
  const email = c.get('email' as never) as string;
  const rows = await c.env.DB.prepare(
    'SELECT id, provider_id, label, last4, is_default, created_at, updated_at FROM credentials WHERE email=? ORDER BY created_at DESC',
  )
    .bind(email)
    .all();
  return c.json({ credentials: rows.results });
});

credentialsApp.post('/credentials', async (c) => {
  const email = c.get('email' as never) as string;
  const body = await c.req.json<{ provider_id: string; label: string; secret: string }>();
  if (!body.provider_id || !body.label || !body.secret) {
    return c.json({ error: 'provider_id, label, and secret are required' }, 400);
  }

  const kek = await importKek(c.env.KEK);
  const row = await c.env.DB.prepare('SELECT wrapped_dek, dek_iv FROM users WHERE email=?')
    .bind(email)
    .first<{ wrapped_dek: ArrayBuffer; dek_iv: ArrayBuffer }>();

  let dek: CryptoKey;
  if (!row) {
    dek = await newDek();
    const w = await wrapDek(kek, dek, email);
    await c.env.DB.prepare(
      'INSERT INTO users (email, wrapped_dek, dek_iv, kek_version, created_at, reveal_count) VALUES (?,?,?,?,?,0)',
    )
      .bind(email, w.wrapped, w.iv, 1, Date.now())
      .run();
  } else {
    dek = await unwrapDek(kek, new Uint8Array(row.wrapped_dek), new Uint8Array(row.dek_iv), email);
  }

  const id = crypto.randomUUID();
  const s = await seal(dek, body.secret, `${email}|${id}|${body.provider_id}`);
  const now = Date.now();

  const existingDefault = await c.env.DB.prepare(
    'SELECT id FROM credentials WHERE email=? AND provider_id=? AND is_default=1',
  )
    .bind(email, body.provider_id)
    .first();
  const isDefault = existingDefault ? 0 : 1;

  await c.env.DB.prepare(
    'INSERT INTO credentials (id,email,provider_id,label,last4,ciphertext,iv,is_default,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
  )
    .bind(id, email, body.provider_id, body.label, body.secret.slice(-4), s.ciphertext, s.iv, isDefault, now, now)
    .run();

  return c.json({ id, last4: body.secret.slice(-4) }, 201);
});

credentialsApp.patch('/credentials/:id', async (c) => {
  const email = c.get('email' as never) as string;
  const credId = c.req.param('id');
  const body = await c.req.json<{ label?: string; is_default?: boolean }>();

  const existing = await c.env.DB.prepare('SELECT id, provider_id FROM credentials WHERE id=? AND email=?')
    .bind(credId, email)
    .first<{ id: string; provider_id: string }>();
  if (!existing) return c.json({ error: 'not found' }, 404);

  if (body.is_default) {
    await c.env.DB.prepare('UPDATE credentials SET is_default=0 WHERE email=? AND provider_id=?')
      .bind(email, existing.provider_id)
      .run();
    await c.env.DB.prepare('UPDATE credentials SET is_default=1, updated_at=? WHERE id=?').bind(Date.now(), credId).run();
  }
  if (body.label) {
    await c.env.DB.prepare('UPDATE credentials SET label=?, updated_at=? WHERE id=?')
      .bind(body.label, Date.now(), credId)
      .run();
  }

  return c.json({ ok: true });
});

credentialsApp.delete('/credentials/:id', async (c) => {
  const email = c.get('email' as never) as string;
  const credId = c.req.param('id');
  const result = await c.env.DB.prepare('DELETE FROM credentials WHERE id=? AND email=?').bind(credId, email).run();
  if (result.meta.changes === 0) return c.json({ error: 'not found' }, 404);
  return c.json({ ok: true });
});

credentialsApp.post('/credentials/:id/reveal', async (c) => {
  const email = c.get('email' as never) as string;
  const credId = c.req.param('id');
  const kek = await importKek(c.env.KEK);

  const user = await c.env.DB.prepare('SELECT wrapped_dek, dek_iv FROM users WHERE email=?')
    .bind(email)
    .first<{ wrapped_dek: ArrayBuffer; dek_iv: ArrayBuffer }>();
  const cred = await c.env.DB.prepare('SELECT provider_id, ciphertext, iv FROM credentials WHERE id=? AND email=?')
    .bind(credId, email)
    .first<{ provider_id: string; ciphertext: ArrayBuffer; iv: ArrayBuffer }>();

  if (!user || !cred) return c.json({ error: 'not found' }, 404);

  const dek = await unwrapDek(kek, new Uint8Array(user.wrapped_dek), new Uint8Array(user.dek_iv), email);
  const secret = await open(
    dek,
    new Uint8Array(cred.ciphertext),
    new Uint8Array(cred.iv),
    `${email}|${credId}|${cred.provider_id}`,
  );

  await c.env.DB.prepare('UPDATE users SET reveal_count = reveal_count + 1 WHERE email=?').bind(email).run();

  return c.json({ secret });
});
