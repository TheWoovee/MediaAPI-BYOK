import { Hono } from 'hono';
import { isAllowedModel } from '@shared/providers/workers-ai-models';
import type { WorkerEnv } from '../types';

export const aiApp = new Hono<{ Bindings: WorkerEnv }>();

aiApp.post('/ai/run/:model{.+}', async (c) => {
  const model = c.req.param('model');

  if (!model.startsWith('@cf/') || !isAllowedModel(model)) {
    return c.json({ error: 'model not allowed' }, 400);
  }

  const body = await c.req.json();

  const result = await (c.env.AI as Ai).run(model as Parameters<Ai['run']>[0], body);

  if (result instanceof ReadableStream) {
    return new Response(result, {
      headers: { 'content-type': 'image/png', 'cache-control': 'no-store' },
    });
  }

  return c.json({ image: (result as { image: string }).image });
});
