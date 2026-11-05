import { parseAnalyticsToken, parseRepoUrl, parseSiteUrl } from './parse';

/**
 * Public site configuration, read from environment variables at build time (see `.env.example`).
 * Every value is optional: when it is empty, the features that depend on it are hidden or do
 * nothing, and the build never fails because of it.
 *
 * - `siteUrl` (`SITE_URL`): public origin. `astro.config.mjs` reads the same variable with the
 *   same parser, so in Astro pages `Astro.site` is the same value (as a `URL`).
 * - `repoUrl` (`PUBLIC_REPO_URL`): GitHub repository, used for the footer link and the
 *   "Report a wrong fact" links (`lib/report.ts`).
 * - `analyticsToken` (`PUBLIC_ANALYTICS_CLOUDFLARE_TOKEN`): site token of Cloudflare Web Analytics.
 *   Empty = analytics off (see `lib/analytics.ts`).
 */
export const siteConfig = {
  siteUrl: parseSiteUrl(import.meta.env.SITE_URL),
  repoUrl: parseRepoUrl(import.meta.env.PUBLIC_REPO_URL),
  analyticsToken: parseAnalyticsToken(import.meta.env.PUBLIC_ANALYTICS_CLOUDFLARE_TOKEN),
} as const;
