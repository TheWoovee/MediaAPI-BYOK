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
      // no-op in browser; adapters can call ctx.log for debugging
    },
  };
}

function buildFetch(spec: ProviderSpec, opts: MakeContextOpts): typeof fetch {
  if (spec.transport === 'proxy') {
    return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const req = new Request(input, init);
      const url = new URL(req.url);
      const path = url.pathname.replace(/^\//, '') + url.search;

      const headers = new Headers(req.headers);
      if (opts.credentialId) {
        headers.set('X-Credential', opts.credentialId);
      } else if (opts.credential) {
        headers.set('X-Credential-Inline', opts.credential);
      }

      if (url.hostname !== spec.hosts[0]) {
        headers.set('X-Proxy-Host', url.hostname);
      }

      return fetch(`${BASE_PATH}/api/proxy/${spec.id}/${path}`, {
        method: req.method,
        headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      });
    };
  }

  if (spec.transport === 'direct') {
    return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const req = new Request(input, init);
      const headers = new Headers(req.headers);
      if (opts.credential && spec.auth.scheme === 'raw') {
        headers.set(spec.auth.header, opts.credential);
      } else if (opts.credential && spec.auth.scheme === 'Key') {
        headers.set(spec.auth.header, `Key ${opts.credential}`);
      } else if (opts.credential) {
        headers.set(spec.auth.header, `Bearer ${opts.credential}`);
      }
      return fetch(req.url, { ...init, headers });
    };
  }

  if (spec.transport === 'local') {
    return (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const req = new Request(input, init);
      const url = new URL(req.url);
      const path = url.pathname.replace(/^\//, '') + url.search;

      if (opts.localServerMode === 'relay' && opts.localServerId) {
        return fetch(`${BASE_PATH}/api/local/${opts.localServerId}/${path}`, {
          method: req.method,
          headers: req.headers,
          body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
        });
      }

      const baseUrl = opts.localServerBaseUrl ?? `http://localhost:8188`;
      return fetch(`${baseUrl}/${path}`, {
        method: req.method,
        headers: req.headers,
        body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.body,
      });
    };
  }

  return fetch;
}
