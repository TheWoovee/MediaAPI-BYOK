const te = new TextEncoder();
const b64d = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const buf = (u: Uint8Array): ArrayBuffer => u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

export function currentKekVersion(env: { KEK_VERSION?: string }): number {
  return Number(env.KEK_VERSION ?? '1');
}

export function resolveKekString(env: { KEK: string; KEK_VERSION?: string; [key: string]: unknown }, version?: number): string {
  const v = version ?? currentKekVersion(env);
  const versioned = env[`KEK_V${v}`];
  return typeof versioned === 'string' ? versioned : env.KEK;
}

export async function importKek(b64: string): Promise<CryptoKey> {
  return crypto.subtle.importKey('raw', buf(b64d(b64)), 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function newDek(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
}

export async function wrapDek(
  kek: CryptoKey,
  dek: CryptoKey,
  aad: string,
): Promise<{ wrapped: Uint8Array; iv: Uint8Array }> {
  const raw = await crypto.subtle.exportKey('raw', dek);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: buf(iv), additionalData: buf(te.encode(aad)) }, kek, raw);
  return { wrapped: new Uint8Array(ct), iv };
}

export async function unwrapDek(kek: CryptoKey, wrapped: Uint8Array, iv: Uint8Array, aad: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: buf(iv), additionalData: buf(te.encode(aad)) },
    kek,
    buf(wrapped),
  );
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function seal(
  dek: CryptoKey,
  plaintext: string,
  aad: string,
): Promise<{ ciphertext: Uint8Array; iv: Uint8Array }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: buf(iv), additionalData: buf(te.encode(aad)) },
    dek,
    buf(te.encode(plaintext)),
  );
  return { ciphertext: new Uint8Array(ct), iv };
}

export async function open(dek: CryptoKey, ciphertext: Uint8Array, iv: Uint8Array, aad: string): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: buf(iv), additionalData: buf(te.encode(aad)) },
    dek,
    buf(ciphertext),
  );
  return new TextDecoder().decode(pt);
}
