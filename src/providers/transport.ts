import { BASE_PATH } from '@shared/config';
import type { ProviderSpec, AdapterContext } from '@shared/types';

export interface MakeContextOpts {
  credentialId?: string;
  credential?: string;
  localServerId?: string;
  localServerBaseUrl?: string;
  localServerMode?: 'direct' | 'relay';
  signal?: AbortSignal;
}

export function makeContext(spec: ProviderSpec, opts: MakeContextOpts = {}): AdapterContext {
  const proxyFetch = buildFetch(spec, opts);

  return {
    providerId: spec.id,
    credentialId: opts.credentialId,
    credential: opts.credential,
    localServerId: opts.localServerId,
    fetch: proxyFetch,
    resolveUrl(pathOrUrl: string): string {
      try {
        new URL(pathOrUrl);
        return pathOrUrl;
      } catch {
        const host = spec.hosts[0] ?? 'localhost';
        return `https://${host}/${pathOrUrl.replace(/^\//, '')}`;
      }
    },
    async uploadTemp(blob: Blob): Promise<string> {
      const res = await fetch(`${BASE_PATH}/api/uploads`, {
        method: 'POST',
        headers: { 'content-type': blob.type || 'application/octet-stream' },
        body: blob,
      });
      const json = await res.json() as { url: string };
      return json.url;
    },
    signal: opts.signal,
    log(_msg: string): void {
      // no-op in browser
    },
  };
}

function extractRequestInfo(input: RequestInfo | URL, init?: RequestInit): { url: string; method: string; headers: Headers } {
  if (input instanceof Request) {
    const headers = new Headers(input.headers);
    if (init?.headers) {
      new Headers(init.headers).forEach((v, k) => headers.set(k, v));
    }
    return { url: input.url, method: init?.method ?? input.method, headers };
  }
  const url = input instanceof URL ? input.href : input;
  return { url, method: init?.method ?? 'GET', headers: new Headers(init?.headers) };
}

function buildFetch(spec: ProviderSpec, opts: MakeContextOpts): typeof fetch {
  if (spec.transport === 'proxy') {
    return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const { url, method, headers } = extractRequestInfo(input, init);
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/^\//, '') + parsed.search;

      if (opts.credentialId) {
        headers.set('X-Credential', opts.credentialId);
      } else if (opts.credential) {
        headers.set('X-Credential-Inline', opts.credential);
      }

      if (parsed.hostname !== spec.hosts[0]) {
        headers.set('X-Proxy-Host', parsed.hostname);
      }

      const body = ['GET', 'HEAD'].includes(method) ? undefined : init?.body;

      return fetch(`${BASE_PATH}/api/proxy/${spec.id}/${path}`, {
        method,
        headers,
        body,
        signal: opts.signal,
      });
    };
  }

  if (spec.transport === 'direct') {
    return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const { url, method, headers } = extractRequestInfo(input, init);
      if (opts.credential && spec.auth.scheme === 'raw') {
        headers.set(spec.auth.header, opts.credential);
      } else if (opts.credential && spec.auth.scheme === 'Key') {
        headers.set(spec.auth.header, `Key ${opts.credential}`);
      } else if (opts.credential) {
        headers.set(spec.auth.header, `Bearer ${opts.credential}`);
      }
      return fetch(url, { method, headers, body: init?.body, signal: opts.signal });
    };
  }

  if (spec.transport === 'local') {
    return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const { url, method, headers } = extractRequestInfo(input, init);
      const parsed = new URL(url);
      const path = parsed.pathname.replace(/^\//, '') + parsed.search;
      const body = ['GET', 'HEAD'].includes(method) ? undefined : init?.body;

      if (opts.localServerMode === 'relay' && opts.localServerId) {
        return fetch(`${BASE_PATH}/api/local/${opts.localServerId}/${path}`, {
          method,
          headers,
          body,
          signal: opts.signal,
        });
      }

      const baseUrl = opts.localServerBaseUrl ?? `http://localhost:8188`;
      return fetch(`${baseUrl}/${path}`, {
        method,
        headers,
        body,
        signal: opts.signal,
      });
    };
  }

  return fetch;
}
