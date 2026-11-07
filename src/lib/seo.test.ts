import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/ui/en';
import { id } from '@/i18n/ui/id';
import {
  robotsMetaContent,
  buildAlternates,
  buildRobotsTxt,
  buildWebApplicationJsonLd,
  buildWebSiteJsonLd,
  localeUrl,
  ogImageUrl,
  serializeJsonLd,
} from './seo';

const SITE = 'https://typing.example.com';

describe('localeUrl and ogImageUrl', () => {
  it('builds absolute localized URLs with a trailing slash', () => {
    expect(localeUrl(SITE, 'id')).toBe('https://typing.example.com/id/');
    expect(localeUrl(new URL(SITE), 'en', 'settings')).toBe('https://typing.example.com/en/settings/');
  });

  it('builds the Open Graph image URL of a language', () => {
    expect(ogImageUrl(SITE, 'en')).toBe('https://typing.example.com/og/en.png');
  });
});

describe('buildAlternates', () => {
  it('lists every language with its locale tag, then x-default for the default language', () => {
    expect(buildAlternates(SITE)).toEqual([
      { hreflang: 'id-ID', href: 'https://typing.example.com/id/' },
      { hreflang: 'en-US', href: 'https://typing.example.com/en/' },
      { hreflang: 'x-default', href: 'https://typing.example.com/id/' },
    ]);
  });

  it('keeps the page path in every alternate', () => {
    const hrefs = buildAlternates(SITE, 'stats').map((link) => link.href);
    expect(hrefs).toEqual([
      'https://typing.example.com/id/stats/',
      'https://typing.example.com/en/stats/',
      'https://typing.example.com/id/stats/',
    ]);
  });
});

describe('buildWebApplicationJsonLd', () => {
  it('describes the home page of one language', () => {
    const data = buildWebApplicationJsonLd({
      site: SITE,
      lang: 'en',
      name: 'curiotype',
      description: 'A typing test.',
    });
    expect(data).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'WebApplication',
      name: 'curiotype',
      url: 'https://typing.example.com/en/',
      inLanguage: 'en-US',
      isAccessibleForFree: true,
    });
  });

  it('is free and has the Open Graph image of its language', () => {
    const data = buildWebApplicationJsonLd({ site: SITE, lang: 'id', name: 'curiotype', description: 'x' });
    expect(data.offers).toEqual({ '@type': 'Offer', price: '0', priceCurrency: 'USD' });
    expect(data.image).toBe('https://typing.example.com/og/id.png');
  });
});

describe('buildWebSiteJsonLd', () => {
  it('describes one language version of the site', () => {
    expect(buildWebSiteJsonLd({ site: SITE, lang: 'en', name: 'curiotype', alternateName: 'Typing Test' })).toEqual({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      name: 'curiotype',
      url: 'https://typing.example.com/en/',
      inLanguage: 'en-US',
      alternateName: 'Typing Test',
    });
  });

  it('leaves out an alternate name that is missing or equal to the name', () => {
    expect(buildWebSiteJsonLd({ site: SITE, lang: 'en', name: 'curiotype' })).not.toHaveProperty('alternateName');
    expect(buildWebSiteJsonLd({ site: SITE, lang: 'en', name: 'a', alternateName: 'a' })).not.toHaveProperty(
      'alternateName',
    );
  });
});

describe('home page metadata texts', () => {
  for (const [code, ui] of [['id', id], ['en', en]] as const) {
    it(`${code}: the description is 140 to 155 characters`, () => {
      expect(ui.meta.description.length).toBeGreaterThanOrEqual(140);
      expect(ui.meta.description.length).toBeLessThanOrEqual(155);
    });

    it(`${code}: the h1 phrase is part of the home title, and the image alt describes the picture`, () => {
      expect(ui.meta.homeTitle).toContain(ui.meta.homeHeading);
      expect(ui.meta.ogImageAlt).not.toBe(ui.meta.siteName);
      expect(ui.meta.ogImageAlt.length).toBeGreaterThan(40);
      expect(ui.meta.ogImageAlt.length).toBeLessThanOrEqual(420);
    });
  }
});

describe('serializeJsonLd', () => {
  it('round-trips through JSON.parse', () => {
    const data = { name: 'A & B', note: '<b>"quoted"</b>' };
    expect(JSON.parse(serializeJsonLd(data))).toEqual(data);
  });

  it('never emits characters that could end the script element', () => {
    const out = serializeJsonLd({ value: '</script><script>alert(1)</script> \u2028 \u2029' });
    expect(out).not.toContain('<');
    expect(out).not.toContain('>');
    expect(out).not.toContain('\u2028');
    expect(out).not.toContain('\u2029');
  });
});

describe('robotsMetaContent', () => {
  it('is plain noindex by default and adds follow on request', () => {
    expect(robotsMetaContent(false)).toBe('noindex');
    expect(robotsMetaContent(true)).toBe('noindex, follow');
  });
});

describe('buildRobotsTxt', () => {
  it('allows everything and points to the sitemap when the site is known', () => {
    expect(buildRobotsTxt(SITE)).toBe(
      'User-agent: *\nAllow: /\n\nSitemap: https://typing.example.com/sitemap-index.xml\n',
    );
  });

  it('omits the sitemap line without a site', () => {
    expect(buildRobotsTxt(undefined)).toBe('User-agent: *\nAllow: /\n');
  });
});
