/**
 * Pages that hold per-user data (statistics, collection, settings) are kept out of search results
 * (`noindex, follow` in BaseLayout) and out of the sitemap. This is the one list: the sitemap
 * filter below reads it, and a test checks that each of these pages really sets `noindex`.
 * `astro.config.mjs` imports this file, so it must not use the `@/` alias.
 */
export const NOINDEX_PAGES = ['stats', 'collection', 'settings'] as const;

/**
 * `sitemap({ filter })`: true keeps the page in the sitemap. Receives the absolute page URL.
 * The root page (`/`, the language chooser that `x-default` points to) is not listed: the sitemap
 * lists the pages of each language, and the root is only a way in.
 */
export function isSitemapPage(pageUrl: string): boolean {
  const { pathname } = new URL(pageUrl);
  if (pathname === '/') return false;
  const [, , page] = pathname.split('/');
  return !(NOINDEX_PAGES as readonly string[]).includes(page ?? '');
}
