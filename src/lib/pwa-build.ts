import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, sep } from 'node:path';

/**
 * Build-time part of the service worker (T30). It runs in Node after `astro build`: it lists the
 * files of the output folder, decides which ones the worker stores, and writes `dist/sw.js` from
 * the template in `src/pwa/sw-template.js`. Nothing here ships to the browser.
 *
 * Imports are relative and end in `.ts` because `astro.config.mjs` loads this file through Node
 * (type stripping), where the `@/` alias does not exist.
 */

/** File name of the generated worker inside the output folder. */
export const SERVICE_WORKER_FILE = 'sw.js';

/** The placeholders of the template, each followed by the default value it stands for. */
const PLACEHOLDERS = {
  revision: "/*REVISION*/'dev'",
  precache: '/*PRECACHE_URLS*/[]',
  data: '/*DATA_URLS*/[]',
  fallback: "/*FALLBACK_URL*/'/'",
} as const;

/**
 * Output files the worker never stores:
 * - the worker itself, and the host's `_headers` and `_redirects` files;
 * - `robots.txt` and the sitemaps (crawlers only);
 * - `404.html` (hosts answer that URL with a redirect, which a cache must not keep);
 * - the social preview images under `og/` (only link previews fetch them);
 * - source maps.
 */
export function isExcludedFromPrecache(relativeUrlPath: string): boolean {
  return (
    relativeUrlPath === `/${SERVICE_WORKER_FILE}` ||
    relativeUrlPath === '/_headers' ||
    relativeUrlPath === '/_redirects' ||
    relativeUrlPath === '/robots.txt' ||
    relativeUrlPath === '/404.html' ||
    /^\/sitemap[^/]*\.xml$/.test(relativeUrlPath) ||
    relativeUrlPath.startsWith('/og/') ||
    relativeUrlPath.endsWith('.map') ||
    relativeUrlPath.endsWith('.DS_Store')
  );
}

/** The sentence files, which the worker keeps apart and refreshes in the background. */
export function isDataFile(urlPath: string): boolean {
  return /^\/data\/[^/]+\/sentences\.json$/.test(urlPath);
}

/** URL path of an output file: `id/index.html` -> `/id/`, `index.html` -> `/`, `_astro/a.js` -> `/_astro/a.js`. */
export function toUrlPath(relativeFilePath: string): string {
  const posix = relativeFilePath.split(sep).join('/').replace(/^\/+/, '');
  if (posix === 'index.html') return '/';
  if (posix.endsWith('/index.html')) return `/${posix.slice(0, -'index.html'.length)}`;
  return `/${posix}`;
}

export interface PrecachePlan {
  /** Pages and assets stored at install (sorted). */
  precache: string[];
  /** Sentence files (sorted). */
  data: string[];
}

/** Splits the URL paths of the output into what the worker precaches and what it treats as data. */
export function planPrecache(urlPaths: readonly string[]): PrecachePlan {
  const unique = [...new Set(urlPaths)].sort();
  return {
    precache: unique.filter((path) => !isExcludedFromPrecache(path) && !isDataFile(path)),
    data: unique.filter((path) => isDataFile(path)),
  };
}

/**
 * Identifies a build. It changes when any stored file changes (path or bytes) or when the worker
 * template changes, so every visible change gives a new cache name and a new `sw.js`, which is
 * what makes browsers install the update.
 */
export function computeRevision(
  files: ReadonlyArray<{ path: string; content: string | Uint8Array }>,
  template: string,
): string {
  const hash = createHash('sha256');
  hash.update(template);
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : 1))) {
    hash.update('\0');
    hash.update(file.path);
    hash.update('\0');
    hash.update(createHash('sha256').update(file.content).digest());
  }
  return hash.digest('hex').slice(0, 12);
}

/** Fills the template. Fails when a placeholder is missing, so a renamed one cannot ship silently. */
export function renderServiceWorker(
  template: string,
  plan: PrecachePlan,
  revision: string,
  fallbackUrl: string,
): string {
  let output = template;
  const replacements: Array<[string, string]> = [
    [PLACEHOLDERS.revision, JSON.stringify(revision)],
    [PLACEHOLDERS.precache, JSON.stringify(plan.precache)],
    [PLACEHOLDERS.data, JSON.stringify(plan.data)],
    [PLACEHOLDERS.fallback, JSON.stringify(fallbackUrl)],
  ];
  for (const [placeholder, value] of replacements) {
    if (!output.includes(placeholder)) {
      throw new Error(`Service worker template has no placeholder ${placeholder}`);
    }
    output = output.replace(placeholder, () => value);
  }
  return output;
}

/** Relative paths of every file under a folder. */
export function listFiles(root: string, folder = ''): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(join(root, folder), { withFileTypes: true })) {
    const relative = folder ? join(folder, entry.name) : entry.name;
    if (entry.isDirectory()) files.push(...listFiles(root, relative));
    else files.push(relative);
  }
  return files;
}

export interface BuiltServiceWorker {
  revision: string;
  plan: PrecachePlan;
  /** Size of the generated worker in bytes. */
  size: number;
}

/** Reads the build output, writes `<outDir>/sw.js`, and reports what it stores. */
export function writeServiceWorker(options: {
  outDir: string;
  template: string;
  fallbackUrl: string;
}): BuiltServiceWorker {
  const { outDir, template, fallbackUrl } = options;
  const byUrl = new Map(listFiles(outDir).map((file) => [toUrlPath(file), file]));
  const plan = planPrecache([...byUrl.keys()]);
  if (!plan.precache.includes(fallbackUrl)) {
    throw new Error(`The fallback page ${fallbackUrl} is not in the build output`);
  }
  const stored = [...plan.precache, ...plan.data].map((path) => ({
    path,
    content: readFileSync(join(outDir, byUrl.get(path) as string)),
  }));
  const revision = computeRevision(stored, template);
  const source = renderServiceWorker(template, plan, revision, fallbackUrl);
  writeFileSync(join(outDir, SERVICE_WORKER_FILE), source);
  return { revision, plan, size: Buffer.byteLength(source) };
}
