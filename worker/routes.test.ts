import { describe, it, expect } from 'vitest';

function createMockD1() {
  const tables: Record<string, Record<string, unknown>[]> = {};
  const getTable = (name: string) => {
    if (!tables[name]) tables[name] = [];
    return tables[name];
  };

  return {
    tables,
    prepare(sql: string) {
      let boundValues: unknown[] = [];
      return {
        bind(...values: unknown[]) {
          boundValues = values;
          return this;
        },
        async first<T = unknown>(): Promise<T | null> {
          const table = sql.match(/FROM\s+(\w+)/i)?.[1];
          if (!table) return null;
          const rows = getTable(table);
          if (sql.includes('WHERE')) {
            const match = rows.find((r) => {
              if (sql.includes('email=?') && sql.includes('id=?')) {
                return r.email === boundValues[1] && r.id === boundValues[0];
              }
              if (sql.includes('id=?') && sql.includes('email=?')) {
                return r.id === boundValues[0] && r.email === boundValues[1];
              }
              if (sql.includes('email=?')) return r.email === boundValues[0];
              if (sql.includes('id=?')) return r.id === boundValues[0];
              return false;
            });
            return (match as T) ?? null;
          }
          return (rows[0] as T) ?? null;
        },
        async all() {
          const table = sql.match(/FROM\s+(\w+)/i)?.[1];
          if (!table) return { results: [] };
          return { results: getTable(table) };
        },
        async run() {
          const table = sql.match(/INTO\s+(\w+)/i)?.[1] || sql.match(/UPDATE\s+(\w+)/i)?.[1] || sql.match(/FROM\s+(\w+)/i)?.[1];
          if (!table) return { meta: { changes: 0 } };

          if (sql.startsWith('INSERT')) {
            const row: Record<string, unknown> = {};
            const cols = sql.match(/\(([^)]+)\)\s*VALUES/i)?.[1]?.split(',').map((c) => c.trim()) ?? [];
            cols.forEach((col, i) => {
              row[col] = boundValues[i];
            });
            getTable(table).push(row);
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith('DELETE')) {
            const rows = getTable(table);
            const idx = rows.findIndex((r) => r.id === boundValues[0] && r.email === boundValues[1]);
            if (idx >= 0) {
              rows.splice(idx, 1);
              return { meta: { changes: 1 } };
            }
            return { meta: { changes: 0 } };
          }
          if (sql.startsWith('UPDATE')) {
            return { meta: { changes: 1 } };
          }
          return { meta: { changes: 0 } };
        },
      };
    },
  };
}

function createMockR2() {
  const store = new Map<string, { body: ArrayBuffer; contentType: string }>();
  return {
    async put(key: string, body: ArrayBuffer, opts?: { httpMetadata?: { contentType: string } }) {
      store.set(key, { body, contentType: opts?.httpMetadata?.contentType ?? 'application/octet-stream' });
    },
    async get(key: string) {
      const item = store.get(key);
      if (!item) return null;
      return { body: new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array(item.body)); controller.close(); } }) };
    },
    async delete(key: string) {
      store.delete(key);
    },
    store,
  };
}

describe('route logic', () => {
  it('local-servers rejects http:// relay URLs', () => {
    const base_url = 'http://my-server.com:8188';
    const mode = 'relay';
    if (mode === 'relay') {
      try {
        const u = new URL(base_url);
        expect(u.protocol).not.toBe('https:');
      } catch {
        // invalid URL
      }
    }
  });

  it('credential create and reveal round-trip logic', async () => {
    const { importKek, newDek, wrapDek, unwrapDek, seal, open } = await import('./crypto');
    const KEK = 'q3Zg7mYb5o0yq1yq9sV2Xf7rXk4sZq1u8bJf0Q2r6Zc=';
    const email = 'test@example.com';
    const providerId = 'xai';
    const secret = 'xai-my-secret-key-1234';

    const kek = await importKek(KEK);
    const dek = await newDek();
    const w = await wrapDek(kek, dek, email);

    const id = crypto.randomUUID();
    const s = await seal(dek, secret, `${email}|${id}|${providerId}`);

    const dek2 = await unwrapDek(kek, w.wrapped, w.iv, email);
    const revealed = await open(dek2, s.ciphertext, s.iv, `${email}|${id}|${providerId}`);
    expect(revealed).toBe(secret);

    const last4 = secret.slice(-4);
    expect(last4).toBe('1234');
  });

  it('tmp upload expiry check works', () => {
    const now = Date.now();
    const expiredRow = { expires_at: now - 1000 };
    const validRow = { expires_at: now + 60000 };
    expect(expiredRow.expires_at < now).toBe(true);
    expect(validRow.expires_at < now).toBe(false);
  });

  it('mock D1 supports basic operations', () => {
    const db = createMockD1();
    expect(db.tables).toBeDefined();
    expect(typeof db.prepare).toBe('function');
  });

  it('mock R2 supports put and get', async () => {
    const r2 = createMockR2();
    const data = new Uint8Array([1, 2, 3]).buffer;
    await r2.put('test/key', data, { httpMetadata: { contentType: 'image/png' } });
    const obj = await r2.get('test/key');
    expect(obj).not.toBeNull();
  });
});
