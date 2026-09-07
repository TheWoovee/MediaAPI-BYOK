import { Hono } from 'hono';
import { isAllowedModel } from '@shared/providers/workers-ai-models';
import type { WorkerEnv } from '../types';

const MAX_WIDTH = 2048;
const MAX_HEIGHT = 2048;
const MAX_STEPS = 50;
const DAILY_LIMIT = 100;

function capParams(body: Record<string, unknown>): void {
  if (typeof body.width === 'number') body.width = Math.min(Math.max(1, body.width), MAX_WIDTH);
  if (typeof body.height === 'number') body.height = Math.min(Math.max(1, body.height), MAX_HEIGHT);
  if (typeof body.steps === 'number') body.steps = Math.min(Math.max(1, body.steps), MAX_STEPS);
  if (typeof body.num_steps === 'number') body.num_steps = Math.min(Math.max(1, body.num_steps), MAX_STEPS);
}

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

export const aiApp = new Hono<{ Bindings: WorkerEnv }>();

aiApp.post('/ai/run/:model{.+}', async (c) => {
  const model = c.req.param('model');

  if (!model.startsWith('@cf/') || !isAllowedModel(model)) {
    return c.json({ error: 'model not allowed' }, 400);
  }

  const email = c.get('email' as never) as string;
  const day = todayKey();

  const row = await c.env.DB.prepare(
    'SELECT count FROM ai_usage_daily WHERE email=? AND day=?',
  )
    .bind(email, day)
    .first<{ count: number }>();

  if (row && row.count >= DAILY_LIMIT) {
    return c.json({ error: 'daily Workers AI limit reached' }, 429);
  }

  const body = await c.req.json() as Record<string, unknown>;
  capParams(body);

  const result = await (c.env.AI as Ai).run(model as Parameters<Ai['run']>[0], body);

  await c.env.DB.prepare(
    'INSERT INTO ai_usage_daily (email, day, count) VALUES (?, ?, 1) ON CONFLICT(email, day) DO UPDATE SET count = count + 1',
  )
    .bind(email, day)
    .run();

  if (result instanceof ReadableStream) {
    return new Response(result, {
      headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
    });
  }

  return c.json({ image: (result as { image: string }).image });
});
