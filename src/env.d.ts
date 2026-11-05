/// <reference path="../.astro/types.d.ts" />

interface ImportMetaEnv {
  /** Public origin of the site (see `.env.example`). */
  readonly SITE_URL?: string;
  /** Public GitHub repository URL (see `.env.example`). */
  readonly PUBLIC_REPO_URL?: string;
  /** Cloudflare Web Analytics site token; empty = no analytics (see `.env.example`). */
  readonly PUBLIC_ANALYTICS_CLOUDFLARE_TOKEN?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
