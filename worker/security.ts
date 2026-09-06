import type { MiddlewareHandler } from 'hono';
import type { WorkerEnv } from './types';

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "connect-src 'self' https://generativelanguage.googleapis.com https://*.hf.space http://localhost:* http://127.0.0.1:*",
  "frame-ancestors 'none'",
].join('; ');

export const securityHeaders: MiddlewareHandler<{ Bindings: WorkerEnv }> = async (c, next) => {
  await next();
  const original = c.res;
  const headers = new Headers(original.headers);
  headers.set('Content-Security-Policy', CSP);
  headers.set('Referrer-Policy', 'no-referrer');
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  c.res = new Response(original.body, {
    status: original.status,
    statusText: original.statusText,
    headers,
  });
};
