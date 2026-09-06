// Envelope encryption: KEK (Worker secret, base64 32 bytes) wraps a per-user DEK; DEK encrypts credentials.
const te = new TextEncoder()
const b64d = (s: string) => Uint8Array.from(atob(s), c => c.charCodeAt(0))
export async function importKek(b64: string) {
  return crypto.subtle.importKey('raw', b64d(b64), 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export async function newDek() {
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt'])
}
export async function wrapDek(kek: CryptoKey, dek: CryptoKey, aad: string) {
  const raw = new Uint8Array(await crypto.subtle.exportKey('raw', dek))
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aad) }, kek, raw)
  return { wrapped: new Uint8Array(ct), iv }
}
export async function unwrapDek(kek: CryptoKey, wrapped: Uint8Array, iv: Uint8Array, aad: string) {
  const raw = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aad) }, kek, wrapped)
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt'])
}
export async function seal(dek: CryptoKey, plaintext: string, aad: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aad) }, dek, te.encode(plaintext))
  return { ciphertext: new Uint8Array(ct), iv }
}
export async function open(dek: CryptoKey, ciphertext: Uint8Array, iv: Uint8Array, aad: string) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, additionalData: te.encode(aad) }, dek, ciphertext)
  return new TextDecoder().decode(pt)
}
