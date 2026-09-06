import { describe, it, expect } from 'vitest';
import { importKek, newDek, wrapDek, unwrapDek, seal, open } from './crypto';

const KEK = 'q3Zg7mYb5o0yq1yq9sV2Xf7rXk4sZq1u8bJf0Q2r6Zc=';

describe('envelope encryption', () => {
  it('round-trips and binds AAD and KEK', async () => {
    const kek = await importKek(KEK);
    const dek = await newDek();
    const w = await wrapDek(kek, dek, 'you@example.com');
    const dek2 = await unwrapDek(kek, w.wrapped, w.iv, 'you@example.com');
    const s = await seal(dek2, 'xai-SECRET', 'you@example.com|id1|xai');
    expect(await open(dek2, s.ciphertext, s.iv, 'you@example.com|id1|xai')).toBe('xai-SECRET');
    await expect(open(dek2, s.ciphertext, s.iv, 'other@example.com|id1|xai')).rejects.toThrow();
    await expect(unwrapDek(kek, w.wrapped, w.iv, 'other@example.com')).rejects.toThrow();
    await expect(
      unwrapDek(await importKek('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='), w.wrapped, w.iv, 'you@example.com'),
    ).rejects.toThrow();
  });

  it('encrypts and decrypts arbitrary credential secrets', async () => {
    const kek = await importKek(KEK);
    const dek = await newDek();
    const w = await wrapDek(kek, dek, 'user@test.com');
    const dek2 = await unwrapDek(kek, w.wrapped, w.iv, 'user@test.com');

    const secrets = ['sk-short', 'a'.repeat(1000), 'special-chars!@#$%^&*()_+-=[]{}|;:,.<>?'];
    for (const secret of secrets) {
      const s = await seal(dek2, secret, 'user@test.com|cred1|provider1');
      const result = await open(dek2, s.ciphertext, s.iv, 'user@test.com|cred1|provider1');
      expect(result).toBe(secret);
    }
  });
});
