import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../i18n/config';
import { NOINDEX_PAGES, isSitemapPage } from './sitemap-filter';

describe('isSitemapPage', () => {
  it('keeps the home, guide and privacy pages of both languages', () => {
    for (const lang of LANGUAGES) {
      expect(isSitemapPage(`https://example.org/${lang}/`)).toBe(true);
      expect(isSitemapPage(`https://example.org/${lang}/guide/`)).toBe(true);
      expect(isSitemapPage(`https://example.org/${lang}/privacy/`)).toBe(true);
    }
  });

  it('drops the statistics, collection and settings pages of both languages', () => {
    for (const lang of LANGUAGES) {
      for (const page of NOINDEX_PAGES) {
        expect(isSitemapPage(`https://example.org/${lang}/${page}/`)).toBe(false);
      }
    }
  });

  it('leaves the root page out: it is only a way in', () => {
    expect(isSitemapPage('https://example.org/')).toBe(false);
  });

  it('does not drop a page that only starts with the same letters', () => {
    expect(isSitemapPage('https://example.org/id/statistics-guide/')).toBe(true);
  });
});

describe('noindex pages', () => {
  it.each(NOINDEX_PAGES)('%s.astro sets noindex and follow', (page) => {
    const source = readFileSync(`src/pages/[lang]/${page}.astro`, 'utf8');
    expect(source).toMatch(/<BaseLayout[^>]*\bnoindex\b[^>]*\bfollow\b/s);
  });

  it.each(['privacy', 'guide'])('%s.astro stays indexable', (page) => {
    expect(readFileSync(`src/pages/[lang]/${page}.astro`, 'utf8')).not.toMatch(/<BaseLayout[^>]*\bnoindex\b/s);
  });
});
