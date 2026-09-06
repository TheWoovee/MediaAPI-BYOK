import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export type Identity = { email: string };

const jwksCache = new Map<string, JWTVerifyGetKey>();

function isLocalRequest(req: Request): boolean {
  const u = new URL(req.url);
  const host = (req.headers.get('host') ?? u.host).split(':')[0];
  if (host === 'localhost' || host === '127.0.0.1') return true;
  // wrangler dev --local rewrites hostname to the route pattern but sets CF-Connecting-IP: 127.0.0.1
  const cfIp = req.headers.get('CF-Connecting-IP');
  if (cfIp === '127.0.0.1') return true;
  return false;
}

export async function identify(
  req: Request,
  env: { ACCESS_TEAM_DOMAIN: string; ACCESS_AUD: string; DEV_TRUST_EMAIL?: string },
  getKey?: JWTVerifyGetKey,
): Promise<Identity | null> {
  const token = req.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) {
    if (env.DEV_TRUST_EMAIL && isLocalRequest(req)) {
      return { email: env.DEV_TRUST_EMAIL };
    }
    return null;
  }
  let key = getKey ?? jwksCache.get(env.ACCESS_TEAM_DOMAIN);
  if (!key) {
    key = createRemoteJWKSet(new URL(`${env.ACCESS_TEAM_DOMAIN}/cdn-cgi/access/certs`));
    jwksCache.set(env.ACCESS_TEAM_DOMAIN, key);
  }
  try {
    const { payload } = await jwtVerify(token, key, {
      issuer: env.ACCESS_TEAM_DOMAIN,
      audience: env.ACCESS_AUD,
    });
    return typeof payload.email === 'string' ? { email: payload.email } : null;
  } catch {
    return null;
  }
}
