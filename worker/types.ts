export interface WorkerEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  TMP?: R2Bucket; // optional: temp uploads are disabled when the R2 bucket is not configured
  AI: Ai;
  KEK: string;
  KEK_VERSION?: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ENVIRONMENT?: string;
  DEV_TRUST_EMAIL?: string;
  [key: string]: unknown;
}
