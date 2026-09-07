import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose';

export type Identity = { email: string };

const jwksCache = new Map<string, JWTVerifyGetKey>();

function isLocalHost(req: Request): boolean {
  const u = new URL(req.url);
  const host = (req.headers.get('host') ?? u.host).split(':')[0];
  return host === 'localhost' || host === '127.0.0.1';
}

export async function identify(
  req: Request,
  env: { ACCESS_TEAM_DOMAIN: string; ACCESS_AUD: string; ENVIRONMENT?: string; DEV_TRUST_EMAIL?: string },
  getKey?: JWTVerifyGetKey,
): Promise<Identity | null> {
  const token = req.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) {
    if (env.DEV_TRUST_EMAIL && env.ENVIRONMENT === 'development' && isLocalHost(req)) {
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
