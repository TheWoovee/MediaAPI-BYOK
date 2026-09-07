import type {
  ProviderAdapter,
  Capability,
  ModelSpec,
  GenerateRequest,
  JobHandle,
  JobStatus,
  NormalizedOutput,
  AdapterContext,
} from '@shared/types';
import { getProvider } from '@shared/providers/registry';
import { models } from './models';

interface HfSpaceProviderRef {
  host: string;
  api_name: string;
  event_id: string;
}

/** Resolve the runtime host for a Hugging Face Space via the Hub API. */
async function resolveSpaceHost(
  spaceId: string,
  ctx: AdapterContext,
): Promise<string> {
  const res = await ctx.fetch(
    `https://huggingface.co/api/spaces/${spaceId}/host`,
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(
      `Failed to resolve Space host for "${spaceId}": ${res.status} ${text}`,
    );
  }
  const json = (await res.json()) as { host: string };
  return json.host;
}

/** Guess MIME type from a filename extension. */
function mimeFromFilename(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'webp':
      return 'image/webp';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'gif':
      return 'image/gif';
    case 'mp4':
      return 'video/mp4';
    case 'webm':
      return 'video/webm';
    default:
      return 'application/octet-stream';
  }
}

/** Guess output kind from MIME type. */
function kindFromMime(mime: string): 'image' | 'video' {
  return mime.startsWith('video/') ? 'video' : 'image';
}

/**
 * Parse a raw SSE text response into discrete events.
 * Each event block is separated by a blank line. Within a block,
 * lines starting with "event:" give the event type and lines
 * starting with "data:" give the payload.
 */
function parseSSE(text: string): Array<{ event: string; data: string }> {
  const blocks = text.split('\n\n');
  const events: Array<{ event: string; data: string }> = [];

  for (const block of blocks) {
    const trimmed = block.trim();
    if (!trimmed) continue;

    let event = '';
    const dataLines: string[] = [];

    for (const line of trimmed.split('\n')) {
      if (line.startsWith('event:')) {
        event = line.slice('event:'.length).trim();
      } else if (line.startsWith('data:')) {
        dataLines.push(line.slice('data:'.length).trim());
      }
    }

    if (event) {
      events.push({ event, data: dataLines.join('\n') });
    }
  }

  return events;
}

/**
 * Extract normalised outputs from a Gradio "complete" data array.
 * Gradio returns an array of positional values. File outputs are objects
 * with a `url` field (and sometimes `path` / `meta`). We pick out any
 * file-like objects and normalise them.
 */
function normalizeOutputs(
  data: unknown[],
  host: string,
): NormalizedOutput[] {
  const outputs: NormalizedOutput[] = [];

  for (const item of data) {
    if (item && typeof item === 'object' && 'url' in item) {
      const fileItem = item as { url: string; path?: string };
      let url = fileItem.url;

      // Ensure absolute URL
      if (url.startsWith('/')) {
        url = `${host}${url}`;
      }

      const filename = url.split('/').pop() ?? '';
      const mime = mimeFromFilename(filename);
      const kind = kindFromMime(mime);

      outputs.push({
        kind,
        source: 'url',
        mime,
        data: url,
        filename,
      });
    }
  }

  return outputs;
}

export const hfSpaceAdapter: ProviderAdapter = {
  spec: getProvider('hf-space')!,
  capabilities: ['text2image', 'image2image', 'text2video', 'image2video'] as Capability[],

  async listModels(_ctx: AdapterContext): Promise<ModelSpec[]> {
    // Static meta-model. In the future this could discover params from
    // the Space's /gradio_api/info endpoint.
    return models;
  },

  async submit(req: GenerateRequest, ctx: AdapterContext): Promise<JobHandle> {
    const spaceId = req.params.space_id as string | undefined;
    const apiName = (req.params.api_name as string | undefined) ?? '/infer';

    if (!spaceId) {
      throw new Error('space_id is required');
    }

    // 1. Resolve the Space runtime host
    const host = await resolveSpaceHost(spaceId, ctx);

    // 2. Build the data array from remaining params (everything except
    //    space_id and api_name is treated as a positional Gradio arg).
    const data: unknown[] = [];
    for (const [key, value] of Object.entries(req.params)) {
      if (key === 'space_id' || key === 'api_name') continue;
      data.push(value);
    }

    // 3. Submit the prediction
    const endpoint = apiName.startsWith('/') ? apiName.slice(1) : apiName;
    const res = await ctx.fetch(`${host}/gradio_api/call/${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(
        `Gradio submit failed: ${res.status} ${text}`,
      );
    }

    const json = (await res.json()) as { event_id: string };

    const providerRef: HfSpaceProviderRef = {
      host,
      api_name: endpoint,
      event_id: json.event_id,
    };

    return {
      provider_id: 'hf-space',
      model_id: req.model_id,
      capability: req.capability,
      provider_ref: providerRef,
      submitted_at: Date.now(),
    };
  },

  async poll(h: JobHandle, ctx: AdapterContext): Promise<JobStatus> {
    const ref = h.provider_ref as HfSpaceProviderRef;

    const res = await ctx.fetch(
      `${ref.host}/gradio_api/call/${ref.api_name}/${ref.event_id}`,
    );

    if (!res.ok) {
      return {
        state: 'failed',
        error: `Poll request failed: ${res.status}`,
      };
    }

    const text = await res.text();
    const events = parseSSE(text);

    // Walk events in order; the last meaningful event wins.
    let status: JobStatus = { state: 'processing' };

    for (const ev of events) {
      switch (ev.event) {
        case 'heartbeat':
          status = { state: 'processing' };
          break;

        case 'generating':
          status = { state: 'processing', message: 'Generating...' };
          break;

        case 'complete': {
          let dataArr: unknown[];
          try {
            dataArr = JSON.parse(ev.data) as unknown[];
          } catch {
            return { state: 'failed', error: `Invalid complete data: ${ev.data}` };
          }
          const outputs = normalizeOutputs(dataArr, ref.host);
          status = { state: 'succeeded', outputs };
          break;
        }

        case 'error':
          status = { state: 'failed', error: ev.data };
          break;
      }
    }

    return status;
  },

  async cancel(h: JobHandle, ctx: AdapterContext): Promise<void> {
    const ref = h.provider_ref as HfSpaceProviderRef;

    await ctx.fetch(`${ref.host}/gradio_api/cancel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_id: ref.event_id,
        session_hash: '',
        fn_index: 0,
      }),
    });
  },

  async testCredential(ctx: AdapterContext): Promise<{ ok: boolean; message?: string }> {
    const res = await ctx.fetch('https://huggingface.co/api/whoami-v2');

    if (!res.ok) {
      return { ok: false, message: `Auth failed: ${res.status}` };
    }

    const json = (await res.json()) as { name?: string };
    return { ok: true, message: `Authenticated as ${json.name ?? 'unknown'}` };
  },
};
