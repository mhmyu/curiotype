/*
 * Service worker of the site (T30). This file is a template: `src/lib/pwa-build.ts` fills in the
 * four `/*NAME*\/` placeholders after `astro build` and writes the result to `dist/sw.js`. It is
 * plain JavaScript on purpose (no build step touches it) and also valid as it is, so a test can
 * run it with the placeholders' default values.
 *
 * What it does:
 * - Install: stores every page, script, style, font and icon of the build in a cache named after
 *   the build revision (the precache), and the sentence files in a separate data cache.
 * - Pages and assets of the precache are served from it first (cache first), so the site opens
 *   offline. A page that is not in the precache goes to the network; if that fails, the home page
 *   of the same interface language is shown instead.
 * - The sentence files are served from the data cache at once and refreshed in the background
 *   (stale-while-revalidate), so new sentences arrive on the next visit.
 * - Updates: a new build installs a new precache next to the old one and WAITS. The page asks the
 *   user (toast "new version available"); only the message `SKIP_WAITING` activates it, so a
 *   running test is never interrupted. Old precaches are deleted when the new worker activates.
 */

const REVISION = /*REVISION*/'dev';
/** Paths of the pages and assets stored in the precache. */
const PRECACHE_URLS = /*PRECACHE_URLS*/[];
/** Paths of the sentence files (stale-while-revalidate). */
const DATA_URLS = /*DATA_URLS*/[];
/** Page shown for a navigation that is neither precached nor reachable (the default language). */
const FALLBACK_URL = /*FALLBACK_URL*/'/';

const PRECACHE_PREFIX = 'typing-precache-';
const PRECACHE_NAME = PRECACHE_PREFIX + REVISION;
const DATA_CACHE_NAME = 'typing-data-v1';

const PRECACHE_SET = new Set(PRECACHE_URLS);

/** Files under /_astro/ have a content hash in their name, so the HTTP cache may be reused for them. */
function fetchOptions(url) {
  return { cache: url.indexOf('/_astro/') === 0 ? 'default' : 'reload' };
}

async function fetchOk(url) {
  const response = await fetch(url, fetchOptions(url));
  if (!response.ok) throw new Error('Could not cache ' + url + ' (' + response.status + ')');
  return response;
}

/** Stores the whole build. One failed file rejects, so a broken install never replaces a good one. */
async function precache() {
  const cache = await caches.open(PRECACHE_NAME);
  await Promise.all(
    PRECACHE_URLS.map(async (url) => {
      await cache.put(url, await fetchOk(url));
    }),
  );
  const dataCache = await caches.open(DATA_CACHE_NAME);
  await Promise.all(
    DATA_URLS.map(async (url) => {
      await dataCache.put(url, await fetchOk(url));
    }),
  );
}

/** Deletes the precaches of older builds. The data cache is kept: it is refreshed in place. */
async function deleteOldCaches() {
  const names = await caches.keys();
  await Promise.all(
    names
      .filter((name) => name.indexOf(PRECACHE_PREFIX) === 0 && name !== PRECACHE_NAME)
      .map((name) => caches.delete(name)),
  );
}

/** The precache key of a path, or null: `/id` and `/id/index.html` both find `/id/`. */
function toPrecacheKey(pathname) {
  if (PRECACHE_SET.has(pathname)) return pathname;
  if (pathname.charAt(pathname.length - 1) !== '/' && PRECACHE_SET.has(pathname + '/')) {
    return pathname + '/';
  }
  const index = '/index.html';
  if (pathname.slice(-index.length) === index) {
    const directory = pathname.slice(0, pathname.length - index.length + 1);
    if (PRECACHE_SET.has(directory)) return directory;
  }
  return null;
}

/** The home page of the interface language in the path (`/en/stats/` -> `/en/`), else the default. */
function toFallbackKey(pathname) {
  const home = '/' + pathname.split('/')[1] + '/';
  return PRECACHE_SET.has(home) ? home : FALLBACK_URL;
}

function matchPrecache(key) {
  return caches.match(key, { cacheName: PRECACHE_NAME });
}

async function handleNavigation(request, url) {
  const key = toPrecacheKey(url.pathname);
  if (key) {
    const cached = await matchPrecache(key);
    if (cached) return cached;
  }
  try {
    return await fetch(request);
  } catch (error) {
    const fallback = await matchPrecache(toFallbackKey(url.pathname));
    if (fallback) return fallback;
    throw error;
  }
}

async function handleAsset(request, key) {
  const cached = await matchPrecache(key);
  return cached || fetch(request);
}

async function handleData(event, url) {
  const cache = await caches.open(DATA_CACHE_NAME);
  const cached = await cache.match(url.pathname);
  const refresh = fetch(event.request).then((response) => {
    if (response.ok) cache.put(url.pathname, response.clone());
    return response;
  });
  if (cached) {
    // Keep the worker alive until the background refresh ends; being offline is not an error.
    event.waitUntil(refresh.catch(() => undefined));
    return cached;
  }
  return refresh;
}

self.addEventListener('install', (event) => {
  // No skipWaiting() here: a new version waits until the user agrees (the page sends SKIP_WAITING).
  event.waitUntil(precache());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(deleteOldCaches().then(() => self.clients.claim()));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (DATA_URLS.indexOf(url.pathname) !== -1) {
    event.respondWith(handleData(event, url));
  } else if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request, url));
  } else if (PRECACHE_SET.has(url.pathname)) {
    event.respondWith(handleAsset(request, url.pathname));
  }
});
