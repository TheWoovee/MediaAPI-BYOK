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
  min?: number;
  max?: number;
  step?: number;
  showWhen?: { field: string; value: unknown };
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
  transport: 'proxy' | 'direct';
  hosts: string[];
  auth: ProviderAuth;
  outputHosts: string[];
  inputModes: InputMode[];
  outputExpiry?: string;
  docsPath: string;
}

export interface ModelSpec {
  id: string;
  label: string;
  capabilities: Capability[];
  params: Record<string, ParamSchema>;
  priceHint?: string;
}

export interface GenerateRequest {
  provider_id: string;
  model_id: string;
  capability: Capability;
  params: Record<string, unknown>;
  credential_id?: string;
  inline_credential?: string;
}

export interface JobHandle {
  provider_id: string;
  provider_ref: unknown;
  poll_url?: string;
}

export type JobStatusState = 'queued' | 'processing' | 'succeeded' | 'failed' | 'cancelled';

export interface JobStatus {
  state: JobStatusState;
  progress?: number;
  outputs?: NormalizedOutput[];
  error?: string;
}

export interface NormalizedOutput {
  kind: 'image' | 'video';
  source: 'url' | 'base64' | 'bytes';
  mime: string;
  data: string | ArrayBuffer;
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
  listModels(ctx: AdapterContext): Promise<ModelSpec[]>;
  submit(req: GenerateRequest, ctx: AdapterContext): Promise<JobHandle>;
  poll(h: JobHandle, ctx: AdapterContext): Promise<JobStatus>;
  cancel?(h: JobHandle, ctx: AdapterContext): Promise<void>;
}

export interface AdapterContext {
  fetch: typeof fetch;
  credential: string;
}
