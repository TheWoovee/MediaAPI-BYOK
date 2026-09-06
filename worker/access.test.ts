import { describe, it, expect } from 'vitest';
import { generateKeyPair, exportJWK, SignJWT, createLocalJWKSet } from 'jose';
import { identify } from './access';

const env = { ACCESS_TEAM_DOMAIN: 'https://thewoovee.cloudflareaccess.com', ACCESS_AUD: 'aud-123' };

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

  it('refuses requests without a token and never trusts DEV_TRUST_EMAIL off localhost', async () => {
    const { getKey } = await setup();
    expect(await identify(req(), env, getKey)).toBeNull();
    expect(await identify(req(undefined, 'www.thewoovee.com'), { ...env, DEV_TRUST_EMAIL: 'dev@x' }, getKey)).toBeNull();
    expect(await identify(req(undefined, 'localhost'), { ...env, DEV_TRUST_EMAIL: 'dev@x' }, getKey)).toEqual({
      email: 'dev@x',
    });
    // also trusts Host header (wrangler dev rewrites URL hostname but keeps the Host header)
    expect(
      await identify(req(undefined, 'www.thewoovee.com', 'localhost:8787'), { ...env, DEV_TRUST_EMAIL: 'dev@x' }, getKey),
    ).toEqual({ email: 'dev@x' });
  });
});
