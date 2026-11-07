import { describe, expect, it } from 'vitest';
import { DEFAULT_LANGUAGE, LANGUAGES } from '@/i18n/config';
import { FALLBACK_LANGUAGE, LANGUAGE_ALIASES, ROOT_REDIRECT_SCRIPT } from './language-redirect';

interface FakeBrowser {
  languages?: unknown;
  language?: unknown;
  search?: string;
  hash?: string;
}

/** Runs the inline script against a stand-in `navigator` and `location`; returns the address it went to. */
function visit(browser: FakeBrowser): string | null {
  let target: string | null = null;
  const navigator = { languages: browser.languages, language: browser.language };
  const location = {
    search: browser.search ?? '',
    hash: browser.hash ?? '',
    replace: (url: string) => {
      target = url;
    },
  };
  new Function('navigator', 'location', ROOT_REDIRECT_SCRIPT)(navigator, location);
  return target;
}

describe('ROOT_REDIRECT_SCRIPT', () => {
  it('sends an Indonesian browser to /id/ and an English one to /en/', () => {
    expect(visit({ languages: ['id-ID', 'id'] })).toBe('/id/');
    expect(visit({ languages: ['en-US', 'en'] })).toBe('/en/');
    expect(visit({ languages: ['EN-gb'] })).toBe('/en/');
  });

  it('takes the first language of the list that the site has', () => {
    expect(visit({ languages: ['es-ES', 'id', 'en'] })).toBe('/id/');
    expect(visit({ languages: ['fr', 'en-GB', 'id'] })).toBe('/en/');
    expect(visit({ languages: ['id', 'en'] })).toBe('/id/');
  });

  it('opens the fallback language when no language of the list is one of ours', () => {
    expect(FALLBACK_LANGUAGE).toBe('en');
    expect(visit({ languages: ['es-ES', 'de'] })).toBe('/en/');
    expect(visit({ languages: ['zh-Hans-CN'] })).toBe('/en/');
  });

  it('reads the old code "in" as Indonesian', () => {
    expect(LANGUAGE_ALIASES.in).toBe('id');
    expect(visit({ languages: ['in-ID'] })).toBe('/id/');
    expect(visit({ languages: ['in'] })).toBe('/id/');
  });

  it('accepts an underscore in the tag', () => {
    expect(visit({ languages: ['en_US'] })).toBe('/en/');
  });

  it('falls back to `navigator.language` when there is no list', () => {
    expect(visit({ languages: undefined, language: 'en-US' })).toBe('/en/');
    expect(visit({ languages: [], language: 'id' })).toBe('/id/');
  });

  it('opens the default language when the browser reports no language at all', () => {
    expect(visit({ languages: undefined, language: undefined })).toBe(`/${DEFAULT_LANGUAGE}/`);
    expect(visit({ languages: [], language: '' })).toBe(`/${DEFAULT_LANGUAGE}/`);
    expect(visit({ languages: ['', 5, null] })).toBe(`/${DEFAULT_LANGUAGE}/`);
  });

  it('keeps the query string and the hash', () => {
    expect(visit({ languages: ['en'], search: '?utm_source=x&a=1', hash: '#top' })).toBe(
      '/en/?utm_source=x&a=1#top',
    );
  });

  it('does nothing when the browser objects are broken', () => {
    let target: string | null = null;
    const location = { search: '', hash: '', replace: (url: string) => (target = url) };
    expect(() => new Function('navigator', 'location', ROOT_REDIRECT_SCRIPT)(undefined, location)).not.toThrow();
    expect(target).toBeNull();
  });

  it('only ever points to a language the site has', () => {
    expect(LANGUAGES).toContain(FALLBACK_LANGUAGE);
    expect(Object.values(LANGUAGE_ALIASES).every((code) => LANGUAGES.includes(code))).toBe(true);
  });

  it('cannot close its own <script> tag, and has no placeholder left', () => {
    expect(ROOT_REDIRECT_SCRIPT.toLowerCase()).not.toContain('</script');
    expect(ROOT_REDIRECT_SCRIPT).not.toMatch(/undefined|\$\{/);
  });
});
