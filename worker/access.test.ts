import { describe, it, expect } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { identify } from './access';

const env = {
  ACCESS_TEAM_DOMAIN: 'https://thewoovee.cloudflareaccess.com',
  ACCESS_AUD: 'aud-123',
  ENVIRONMENT: 'development' as string | undefined,
};

async function setup() {
  const { publicKey, privateKey } = await generateKeyPair('RS256');
  const jwk = { ...(await exportJWK(publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  return { privateKey, getKey: createLocalJWKSet({ keys: [jwk] }) };
}

const sign = (pk: CryptoKey, claims: Record<string, unknown>, opts: { iss?: string; aud?: string; exp?: string } = {}) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(opts.iss ?? env.ACCESS_TEAM_DOMAIN)
    .setAudience(opts.aud ?? env.ACCESS_AUD)
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '10m')
    .sign(pk);

const req = (token?: string, host = 'www.thewoovee.com', hostHeader?: string) => {
  const headers: Record<string, string> = {};
  if (token) headers['Cf-Access-Jwt-Assertion'] = token;
  if (hostHeader) headers['host'] = hostHeader;
  return new Request(`https://${host}/studio/api/me`, { headers });
};

describe('Access JWT verification', () => {
  it('accepts a valid token and returns the email', async () => {
    const { privateKey, getKey } = await setup();
    const t = await sign(privateKey, { email: 'you@example.com' });
    expect(await identify(req(t), env, getKey)).toEqual({ email: 'you@example.com' });
  });

  it('rejects wrong audience, wrong issuer, expired, and foreign key', async () => {
    const { privateKey, getKey } = await setup();
    expect(await identify(req(await sign(privateKey, { email: 'a@b.c' }, { aud: 'other' })), env, getKey)).toBeNull();
    expect(
      await identify(req(await sign(privateKey, { email: 'a@b.c' }, { iss: 'https://evil.cloudflareaccess.com' })), env, getKey),
    ).toBeNull();
    expect(await identify(req(await sign(privateKey, { email: 'a@b.c' }, { exp: '-1m' })), env, getKey)).toBeNull();
    const other = await setup();
    expect(await identify(req(await sign(other.privateKey, { email: 'a@b.c' })), env, getKey)).toBeNull();
  });

  it('trusts DEV_TRUST_EMAIL only when ENVIRONMENT=development AND hostname is localhost', async () => {
    const { getKey } = await setup();
    const devEnv = { ...env, DEV_TRUST_EMAIL: 'dev@x', ENVIRONMENT: 'development' as string | undefined };

    // no token, non-localhost → null
    expect(await identify(req(), devEnv, getKey)).toBeNull();
    expect(await identify(req(undefined, 'www.thewoovee.com'), devEnv, getKey)).toBeNull();

    // localhost with ENVIRONMENT=development → trusted
    expect(await identify(req(undefined, 'localhost'), devEnv, getKey)).toEqual({ email: 'dev@x' });

    // Host header override to localhost
    expect(
      await identify(req(undefined, 'www.thewoovee.com', 'localhost:8787'), devEnv, getKey),
    ).toEqual({ email: 'dev@x' });
  });

  it('ignores DEV_TRUST_EMAIL when ENVIRONMENT=production even on localhost', async () => {
    const { getKey } = await setup();
    const prodEnv = { ...env, DEV_TRUST_EMAIL: 'dev@x', ENVIRONMENT: 'production' };
    expect(await identify(req(undefined, 'localhost'), prodEnv, getKey)).toBeNull();
  });

  it('ignores DEV_TRUST_EMAIL when ENVIRONMENT is undefined', async () => {
    const { getKey } = await setup();
    const noEnv = { ...env, DEV_TRUST_EMAIL: 'dev@x', ENVIRONMENT: undefined };
    expect(await identify(req(undefined, 'localhost'), noEnv, getKey)).toBeNull();
  });
});
