/**
 * Pure parsers for the public configuration values that come from environment variables.
 * They live apart from `site.ts` (which reads `import.meta.env`) so that `astro.config.mjs`
 * and unit tests can use them too. An empty or invalid value yields `undefined`, which
 * means "not configured": the features that need the value hide themselves or do nothing.
 */

function parseUrl(value: string | undefined): URL | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  try {
    return new URL(trimmed);
  } catch {
    return undefined;
  }
}

/**
 * `SITE_URL`: the public origin of the deployed site, for example `https://typing.example.com`.
 * Only `http` and `https` are accepted. Any path, query or hash is dropped, because the site
 * is served from the root of its domain. The result has no trailing slash.
 */
export function parseSiteUrl(value: string | undefined): string | undefined {
  const url = parseUrl(value);
  if (!url || (url.protocol !== 'https:' && url.protocol !== 'http:')) return undefined;
  return url.origin;
}

/**
 * `PUBLIC_REPO_URL`: the public GitHub repository, `https://github.com/<owner>/<repo>`.
 * A trailing slash, `.git` suffix, query and hash are removed. Anything else (another host,
 * extra path segments such as `/tree/main`, a missing repository name) is rejected, because
 * the issue links built from it only work for a repository root.
 */
export function parseRepoUrl(value: string | undefined): string | undefined {
  const url = parseUrl(value);
  if (!url || url.protocol !== 'https:' || url.hostname !== 'github.com') return undefined;
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 2) return undefined;
  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/, '');
  if (!owner || !repo) return undefined;
  return `https://github.com/${owner}/${repo}`;
}

/**
 * `PUBLIC_ANALYTICS_CLOUDFLARE_TOKEN`: the site token of Cloudflare Web Analytics (a 32-character
 * hex string in practice). It ends up in a script URL, so only letters, digits, `-` and `_` of a
 * plausible length are accepted; anything else counts as "not configured".
 */
export function parseAnalyticsToken(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || !/^[A-Za-z0-9_-]{16,64}$/.test(trimmed)) return undefined;
  return trimmed;
}
