export type Capability =
  | 'text2image'
  | 'image2image'
  | 'inpaint'
  | 'upscale'
  | 'remove_bg'
  | 'text2video'
  | 'image2video'
  | 'video2video'
  | 'video_extend';

export type ParamType = 'string' | 'number' | 'integer' | 'boolean' | 'enum' | 'image' | 'images' | 'video' | 'mask';

export interface ParamSchema {
  type: ParamType;
  label: string;
  help?: string;
  required?: boolean;
  default?: string | number | boolean;
  enum?: string[];
  options?: { value: string; label: string }[];
  min?: number;
  max?: number;
  step?: number;
  showWhen?: { field: string; value: unknown };
  advanced?: boolean;
  unit?: string;
  group?: string;
  placeholder?: string;
  multiline?: boolean;
  accept?: string;
  maxItems?: number;
}

export type InputMode = 'base64' | 'url' | 'multipart' | 'own-upload';

export type AuthScheme = 'Bearer' | 'Key' | 'raw' | 'jwt-hs256';

export interface ProviderAuth {
  header: string;
  scheme?: AuthScheme;
  extraHeaders?: Record<string, string>;
  help: string;
}

export interface ProviderSpec {
  id: string;
  label: string;
  wave: 1 | 2 | 3;
  transport: 'proxy' | 'direct' | 'local';
  hosts: string[];
  auth: ProviderAuth;
  outputHosts: string[];
  inputModes: InputMode[];
  outputExpiry?: string;
  docsPath: string;
}

export interface ModelSpec {
  id: string;
  provider_id: string;
  label: string;
  description?: string;
  capabilities: Capability[];
  params: Record<string, ParamSchema>;
  limits?: { maxImages?: number; durations?: number[]; resolutions?: string[]; aspectRatios?: string[] };
  pricing?: { unit: string; amount: number; currency: 'USD' | 'credits' | 'neurons' };
  priceHint?: string;
}

export type MediaInput = { blob: Blob; name?: string };

export interface GenerateRequest {
  provider_id: string;
  model_id: string;
  capability: Capability;
  params: Record<string, unknown>;
  credential_id?: string;
  inline_credential?: string;
  n?: number;
  seed?: number;
}

export interface JobHandle {
  provider_id: string;
  model_id: string;
  capability: Capability;
  provider_ref: unknown;
  poll_url?: string;
  submitted_at: number;
}

export type JobStatusState = 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled';

export interface JobStatus {
  state: JobStatusState;
  progress?: number;
  outputs?: NormalizedOutput[];
  error?: string;
  eta_seconds?: number;
  message?: string;
}

export interface NormalizedOutput {
  kind: 'image' | 'video';
  source: 'url' | 'base64' | 'bytes';
  mime: string;
  data: string | ArrayBuffer;
  expires_at?: number;
  filename?: string;
  width?: number;
  height?: number;
  duration_s?: number;
  seed?: number;
}

export interface Credential {
  id: string;
  provider_id: string;
  label: string;
  last4: string;
  is_default: boolean;
  created_at: number;
  updated_at: number;
}

export interface LocalServer {
  id: string;
  kind: string;
  label: string;
  base_url: string;
  mode: 'direct' | 'relay';
  created_at: number;
  updated_at: number;
}

export interface JobRecord {
  id: string;
  provider_id: string;
  model_id: string;
  capability: Capability;
  request_json: string;
  provider_ref_json?: string;
  status: JobStatusState;
  outputs_json?: string;
  error?: string;
  cost_hint?: string;
  created_at: number;
  updated_at: number;
}

export interface ProviderAdapter {
  spec: ProviderSpec;
  capabilities: Capability[];
  listModels(ctx: AdapterContext): Promise<ModelSpec[]>;
  submit(req: GenerateRequest, ctx: AdapterContext): Promise<JobHandle>;
  poll(h: JobHandle, ctx: AdapterContext): Promise<JobStatus>;
  cancel?(h: JobHandle, ctx: AdapterContext): Promise<void>;
  testCredential?(ctx: AdapterContext): Promise<{ ok: boolean; message?: string }>;
}

export interface AdapterContext {
  providerId: string;
  credentialId?: string;
  credential?: string;
  localServerId?: string;
  fetch: typeof fetch;
  resolveUrl(pathOrUrl: string): string;
  uploadTemp(blob: Blob): Promise<string>;
  signal?: AbortSignal;
  log(msg: string): void;
}
