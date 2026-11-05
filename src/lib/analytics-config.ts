/**
 * Everything about the analytics provider that is plain data, so `astro.config.mjs` (build time),
 * the client wrapper (`analytics.ts`) and the tests share one definition.
 *
 * Provider: Cloudflare Web Analytics, installed by hand (a script tag we add ourselves), so it
 * works on any host and respects Do Not Track. It sets no cookies and collects no personal data.
 * It does not offer custom events, so none are sent.
 */

/** The beacon script. */
export const BEACON_SCRIPT_URL = 'https://static.cloudflareinsights.com/beacon.min.js';

/** Where the manually installed beacon sends its measurements (`/cdn-cgi/rum` on this host). */
export const BEACON_CONNECT_ORIGIN = 'https://cloudflareinsights.com';

/** Script URL with the site token, for a `<script type="module">` tag. */
export function buildBeaconSrc(token: string): string {
  return `${BEACON_SCRIPT_URL}?token=${encodeURIComponent(token)}`;
}

/**
 * Content Security Policy additions, only when analytics is configured, so a build without a
 * token keeps `'self'` as the only source. `script` replaces Astro's script resource list
 * (which does not contain `'self'` unless listed), so it repeats `'self'`.
 */
export function analyticsCspSources(token: string | undefined): {
  script: string[];
  connect: string[];
} {
  if (!token) return { script: ["'self'"], connect: ["'self'"] };
  return {
    script: ["'self'", BEACON_SCRIPT_URL],
    connect: ["'self'", BEACON_CONNECT_ORIGIN],
  };
}
