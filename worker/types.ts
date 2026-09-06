export interface WorkerEnv {
  ASSETS: Fetcher;
  DB: D1Database;
  TMP: R2Bucket;
  AI: Ai;
  KEK: string;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  DEV_TRUST_EMAIL?: string;
}
