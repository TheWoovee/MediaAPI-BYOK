import type {
  AdapterContext,
  Capability,
  GenerateRequest,
  JobHandle,
  JobStatus,
  ModelSpec,
  NormalizedOutput,
  ProviderAdapter,
} from '@shared/types';
import { getProvider } from '@shared/providers/registry';

import { buildModelSpecs, CUSTOM_MODEL_ID, OFFLINE_OPTIONS, TEMPLATES, type ApiWorkflow, type DynamicOptions, type ParamMapEntry } from './models';

const providerSpec = getProvider('comfyui');
if (!providerSpec) {
  throw new Error('comfyui ProviderSpec not registered in shared/providers/registry.ts');
}

const CAPABILITIES: Capability[] = [
  'text2image',
  'image2image',
  'inpaint',
  'upscale',
  'image2video',
];

/** Every ComfyUI call is a relative path; the 'local' transport (src/providers/transport.ts) rewrites this to the configured server. */
function url(path: string): string {
  return `http://localhost/${path.replace(/^\//, '')}`;
}

// ---------------------------------------------------------------------------
// /prompt
// ---------------------------------------------------------------------------

interface PromptOkResponse {
  prompt_id: string;
  number: number;
  node_errors: Record<string, unknown>;
}

interface PromptErrorResponse {
  error?: { type?: string; message?: string; details?: string };
  node_errors?: Record<string, unknown>;
}

function isPromptError(json: unknown): json is PromptErrorResponse {
  return typeof json === 'object' && json !== null && 'error' in json;
}

function describePromptError(json: PromptErrorResponse, httpStatus: number): string {
  const parts: string[] = [];
  if (json.error?.message) parts.push(json.error.message);
  if (json.node_errors && Object.keys(json.node_errors).length > 0) {
    parts.push(`node_errors: ${Object.keys(json.node_errors).join(', ')}`);
  }
  if (parts.length === 0) parts.push(`HTTP ${httpStatus}`);
  return parts.join(' | ');
}

// ---------------------------------------------------------------------------
// Uploads
// ---------------------------------------------------------------------------

interface UploadedFile {
  name: string;
  subfolder: string;
  type: string;
}

function uploadedFilename(f: UploadedFile): string {
  return f.subfolder ? `${f.subfolder}/${f.name}` : f.name;
}

/** Duck-types a MediaInput ({ blob, name? }) or a raw Blob out of an unknown param value. */
function extractBlob(value: unknown): { blob: Blob; name?: string } | undefined {
  if (value instanceof Blob) return { blob: value };
  if (value && typeof value === 'object' && 'blob' in value) {
    const v = value as { blob: unknown; name?: unknown };
    if (v.blob instanceof Blob) {
      return { blob: v.blob, name: typeof v.name === 'string' ? v.name : undefined };
    }
  }
  return undefined;
}

async function uploadImage(ctx: AdapterContext, blob: Blob, name: string | undefined): Promise<UploadedFile> {
  const form = new FormData();
  form.append('image', blob, name ?? 'input.png');
  form.append('overwrite', 'true');
  form.append('type', 'input');
  const res = await ctx.fetch(url('upload/image'), { method: 'POST', body: form, signal: ctx.signal });
  if (!res.ok) {
    throw new Error(`ComfyUI /upload/image failed: HTTP ${res.status}`);
  }
  return (await res.json()) as UploadedFile;
}

// ---------------------------------------------------------------------------
// Seed handling
// ---------------------------------------------------------------------------

function randomSeed(): number {
  return Math.floor(Math.random() * 2 ** 32);
}

/** Randomizes when unset or -1, per ComfyUI's control_after_generate being frontend-only. */
function resolveSeed(paramValue: unknown, requestSeed: number | undefined): number {
  const raw = paramValue ?? requestSeed;
  if (raw === undefined || raw === null) return randomSeed();
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return randomSeed();
  return Math.floor(n);
}

// ---------------------------------------------------------------------------
// Workflow patching
// ---------------------------------------------------------------------------

function cloneWorkflow(workflow: ApiWorkflow): ApiWorkflow {
  return JSON.parse(JSON.stringify(workflow)) as ApiWorkflow;
}

function patchInput(workflow: ApiWorkflow, entry: ParamMapEntry | undefined, value: unknown): void {
  if (!entry) return;
  const node = workflow[entry.nodeId];
  if (!node) return;
  node.inputs[entry.inputKey] = value;
}

async function buildCustomWorkflow(req: GenerateRequest, ctx: AdapterContext): Promise<ApiWorkflow> {
  const raw = req.params.workflow_json;
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    throw new Error('workflow_json is required for the ComfyUI custom-workflow model');
  }

  let workflow: ApiWorkflow;
  try {
    workflow = JSON.parse(raw) as ApiWorkflow;
  } catch (err) {
    throw new Error(`workflow_json is not valid JSON: ${(err as Error).message}`);
  }

  const promptNodeId = req.params.prompt_node_id;
  const prompt = req.params.prompt;
  if (typeof promptNodeId === 'string' && promptNodeId.length > 0 && typeof prompt === 'string' && prompt.length > 0) {
    const inputKey = typeof req.params.prompt_input_key === 'string' && req.params.prompt_input_key ? req.params.prompt_input_key : 'text';
    patchInput(workflow, { nodeId: promptNodeId, inputKey }, prompt);
  }

  const seedNodeId = req.params.seed_node_id;
  if (typeof seedNodeId === 'string' && seedNodeId.length > 0) {
    const inputKey = typeof req.params.seed_input_key === 'string' && req.params.seed_input_key ? req.params.seed_input_key : 'seed';
    patchInput(workflow, { nodeId: seedNodeId, inputKey }, resolveSeed(req.params.seed, req.seed));
  }

  // Custom workflows have no known param -> node mapping, so a MediaInput param can only be
  // uploaded, not wired in automatically. Upload it (so the file exists on the server) and
  // tell the caller to reference the returned filename inside workflow_json themselves.
  for (const [key, value] of Object.entries(req.params)) {
    if (key === 'workflow_json') continue;
    const extracted = extractBlob(value);
    if (!extracted) continue;
    const uploaded = await uploadImage(ctx, extracted.blob, extracted.name);
    ctx.log(`ComfyUI custom workflow: uploaded param "${key}" as "${uploadedFilename(uploaded)}"; reference it by filename in workflow_json.`);
  }

  return workflow;
}

// ---------------------------------------------------------------------------
// listModels
// ---------------------------------------------------------------------------

interface ObjectInfoNode {
  input?: {
    required?: Record<string, unknown[]>;
    optional?: Record<string, unknown[]>;
  };
}

async function fetchObjectInfo(ctx: AdapterContext, nodeClass: string): Promise<ObjectInfoNode | undefined> {
  try {
    const res = await ctx.fetch(url(`object_info/${nodeClass}`), { signal: ctx.signal });
    if (!res.ok) return undefined;
    const json = (await res.json()) as Record<string, unknown>;
    return json[nodeClass] as ObjectInfoNode | undefined;
  } catch {
    return undefined;
  }
}

function comboOptions(nodeInfo: ObjectInfoNode | undefined, inputKey: string): string[] | undefined {
  const widget = nodeInfo?.input?.required?.[inputKey];
  if (!Array.isArray(widget) || widget.length === 0) return undefined;
  const first = widget[0];
  if (Array.isArray(first) && first.every((x) => typeof x === 'string')) {
    return first as string[];
  }
  return undefined;
}

async function listModels(ctx: AdapterContext): Promise<ModelSpec[]> {
  const [ckptInfo, samplerInfo, upscaleInfo] = await Promise.all([
    fetchObjectInfo(ctx, 'CheckpointLoaderSimple'),
    fetchObjectInfo(ctx, 'KSampler'),
    fetchObjectInfo(ctx, 'UpscaleModelLoader'),
  ]);

  const dyn: DynamicOptions = {
    ckptNames: comboOptions(ckptInfo, 'ckpt_name') ?? OFFLINE_OPTIONS.ckptNames,
    samplerNames: comboOptions(samplerInfo, 'sampler_name') ?? OFFLINE_OPTIONS.samplerNames,
    schedulers: comboOptions(samplerInfo, 'scheduler') ?? OFFLINE_OPTIONS.schedulers,
    upscaleModels: comboOptions(upscaleInfo, 'model_name') ?? OFFLINE_OPTIONS.upscaleModels,
  };

  return buildModelSpecs(dyn);
}

// ---------------------------------------------------------------------------
// submit
// ---------------------------------------------------------------------------

async function submit(req: GenerateRequest, ctx: AdapterContext): Promise<JobHandle> {
  const clientId = crypto.randomUUID();

  let workflow: ApiWorkflow;

  if (req.model_id === CUSTOM_MODEL_ID) {
    workflow = await buildCustomWorkflow(req, ctx);
  } else {
    const template = TEMPLATES[req.model_id];
    if (!template) {
      throw new Error(`Unknown ComfyUI model_id: ${req.model_id}`);
    }
    workflow = cloneWorkflow(template.workflow);

    // Media params first: upload the blob, then patch the returned filename into its node.
    for (const paramName of template.mediaParams) {
      const extracted = extractBlob(req.params[paramName]);
      if (!extracted) continue;
      const uploaded = await uploadImage(ctx, extracted.blob, extracted.name);
      patchInput(workflow, template.paramMap[paramName], uploadedFilename(uploaded));
    }

    // Everything else except seed (randomized below) and already-handled media params.
    for (const [paramName, value] of Object.entries(req.params)) {
      if (template.mediaParams.includes(paramName)) continue;
      if (paramName === template.seedParam) continue;
      if (value === undefined) continue;
      patchInput(workflow, template.paramMap[paramName], value);
    }

    if (template.seedParam) {
      const seed = resolveSeed(req.params[template.seedParam], req.seed);
      patchInput(workflow, template.paramMap[template.seedParam], seed);
    }

    if (template.batchParam && req.n && req.n > 0) {
      patchInput(workflow, template.paramMap[template.batchParam], req.n);
    }
  }

  const res = await ctx.fetch(url('prompt'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
    signal: ctx.signal,
  });

  const json: unknown = await res.json().catch(() => undefined);

  if (!res.ok || !json || isPromptError(json)) {
    const message = json && isPromptError(json) ? describePromptError(json, res.status) : `HTTP ${res.status}`;
    throw new Error(`ComfyUI /prompt failed: ${message}`);
  }

  const ok = json as PromptOkResponse;
  ctx.log(`ComfyUI: queued prompt ${ok.prompt_id}`);

  return {
    provider_id: 'comfyui',
    model_id: req.model_id,
    capability: req.capability,
    provider_ref: { promptId: ok.prompt_id, clientId },
    submitted_at: Date.now(),
  };
}

// ---------------------------------------------------------------------------
// poll
// ---------------------------------------------------------------------------

interface QueueResponse {
  queue_running: unknown[][];
  queue_pending: unknown[][];
}

interface HistoryOutputItem {
  filename: string;
  subfolder?: string;
  type?: string;
}

interface HistoryNodeOutput {
  images?: HistoryOutputItem[];
  gifs?: HistoryOutputItem[];
  audio?: HistoryOutputItem[];
  animated?: boolean[];
  [key: string]: unknown;
}

interface HistoryEntry {
  outputs?: Record<string, HistoryNodeOutput>;
  status?: {
    status_str?: 'success' | 'error';
    completed?: boolean;
    messages?: [string, Record<string, unknown>][];
  };
}

type HistoryResponse = Record<string, HistoryEntry>;

function isInQueueList(list: unknown[][] | undefined, promptId: string): boolean {
  if (!Array.isArray(list)) return false;
  return list.some((item) => Array.isArray(item) && item[1] === promptId);
}

async function queueState(ctx: AdapterContext, promptId: string): Promise<JobStatus> {
  try {
    const res = await ctx.fetch(url('queue'), { signal: ctx.signal });
    if (res.ok) {
      const queue = (await res.json()) as QueueResponse;
      if (isInQueueList(queue.queue_running, promptId)) return { state: 'processing' };
      if (isInQueueList(queue.queue_pending, promptId)) return { state: 'queued' };
    }
  } catch {
    // Network hiccup on the queue check; fall through to the conservative default.
  }
  // Not found in either list and no history yet: most likely just submitted.
  return { state: 'queued' };
}

function extractErrorMessage(entry: HistoryEntry): string {
  const messages = entry.status?.messages ?? [];
  for (const [type, data] of messages) {
    if (type === 'execution_error') {
      const msg = (data as { exception_message?: string }).exception_message;
      if (msg) return msg;
    }
  }
  return 'ComfyUI workflow execution failed';
}

const EXT_MIME: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
};

const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mkv', 'gif']);
const SKIPPED_OUTPUT_KEYS = new Set(['audio', 'animated']);

function extensionOf(filename: string): string {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename);
  return match ? match[1].toLowerCase() : '';
}

function isOutputItem(value: unknown): value is HistoryOutputItem {
  return typeof value === 'object' && value !== null && typeof (value as HistoryOutputItem).filename === 'string';
}

async function collectOutputs(entry: HistoryEntry, ctx: AdapterContext): Promise<NormalizedOutput[]> {
  const outputs: NormalizedOutput[] = [];
  const nodeOutputs = entry.outputs ?? {};

  for (const nodeOutput of Object.values(nodeOutputs)) {
    const animatedFlag = Array.isArray(nodeOutput.animated) && nodeOutput.animated.some(Boolean);

    for (const [key, items] of Object.entries(nodeOutput)) {
      if (SKIPPED_OUTPUT_KEYS.has(key) || !Array.isArray(items)) continue;

      for (const item of items) {
        if (!isOutputItem(item)) continue;

        const ext = extensionOf(item.filename);
        const isVideo = animatedFlag || VIDEO_EXTENSIONS.has(ext);
        const mime = EXT_MIME[ext] ?? 'application/octet-stream';
        const viewUrl = url(
          `view?${new URLSearchParams({
            filename: item.filename,
            subfolder: item.subfolder ?? '',
            type: item.type ?? 'output',
          }).toString()}`,
        );

        const bytesRes = await ctx.fetch(viewUrl, { signal: ctx.signal });
        if (!bytesRes.ok) {
          ctx.log(`ComfyUI: failed to fetch output "${item.filename}" (HTTP ${bytesRes.status})`);
          continue;
        }

        outputs.push({
          kind: isVideo ? 'video' : 'image',
          source: 'bytes',
          mime,
          data: await bytesRes.arrayBuffer(),
          filename: item.filename,
        });
      }
    }
  }

  return outputs;
}

async function poll(h: JobHandle, ctx: AdapterContext): Promise<JobStatus> {
  const ref = h.provider_ref as { promptId?: string } | undefined;
  const promptId = ref?.promptId;
  if (!promptId) {
    return { state: 'failed', error: 'Missing ComfyUI prompt_id in job handle' };
  }

  const historyRes = await ctx.fetch(url(`history/${promptId}`), { signal: ctx.signal });
  if (!historyRes.ok) {
    return { state: 'processing', message: `ComfyUI /history returned HTTP ${historyRes.status}` };
  }

  const historyJson = (await historyRes.json()) as HistoryResponse;
  const entry = historyJson[promptId];

  if (!entry) {
    return queueState(ctx, promptId);
  }

  const statusStr = entry.status?.status_str;
  if (statusStr === 'error') {
    return { state: 'failed', error: extractErrorMessage(entry) };
  }

  if (statusStr !== 'success' || !entry.status?.completed) {
    return { state: 'processing' };
  }

  return { state: 'succeeded', outputs: await collectOutputs(entry, ctx) };
}

// ---------------------------------------------------------------------------
// cancel
// ---------------------------------------------------------------------------

async function interruptPrompt(ctx: AdapterContext, promptId: string): Promise<void> {
  await ctx.fetch(url('interrupt'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt_id: promptId }),
    signal: ctx.signal,
  });
}

async function deleteFromQueue(ctx: AdapterContext, promptId: string): Promise<void> {
  await ctx.fetch(url('queue'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ delete: [promptId] }),
    signal: ctx.signal,
  });
}

async function cancel(h: JobHandle, ctx: AdapterContext): Promise<void> {
  const ref = h.provider_ref as { promptId?: string } | undefined;
  const promptId = ref?.promptId;
  if (!promptId) return;

  const res = await ctx.fetch(url('queue'), { signal: ctx.signal });
  if (!res.ok) {
    // Best effort: the running job is the common case worth covering even if /queue itself failed.
    await interruptPrompt(ctx, promptId);
    return;
  }

  const queue = (await res.json()) as QueueResponse;
  if (isInQueueList(queue.queue_running, promptId)) {
    await interruptPrompt(ctx, promptId);
    return;
  }
  if (isInQueueList(queue.queue_pending, promptId)) {
    await deleteFromQueue(ctx, promptId);
  }
  // Not in either list: already finished (or unknown to the server) — nothing to cancel.
}

// ---------------------------------------------------------------------------
// testCredential
// ---------------------------------------------------------------------------

interface SystemStatsResponse {
  system?: { comfyui_version?: string };
  devices?: { name?: string }[];
}

async function testCredential(ctx: AdapterContext): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await ctx.fetch(url('system_stats'), { signal: ctx.signal });
    if (!res.ok) {
      const hint = res.status === 403 ? ' (start ComfyUI with --enable-cors-header <your origin>)' : '';
      return { ok: false, message: `ComfyUI returned HTTP ${res.status}${hint}` };
    }
    const json = (await res.json()) as SystemStatsResponse;
    const version = json.system?.comfyui_version ?? 'unknown version';
    const gpu = json.devices?.[0]?.name ?? 'unknown GPU';
    return { ok: true, message: `ComfyUI ${version} connected (GPU: ${gpu})` };
  } catch (err) {
    return { ok: false, message: `ComfyUI not reachable: ${(err as Error).message}` };
  }
}

// ---------------------------------------------------------------------------

export const comfyuiAdapter: ProviderAdapter = {
  spec: providerSpec,
  capabilities: CAPABILITIES,
  listModels,
  submit,
  poll,
  cancel,
  testCredential,
};
