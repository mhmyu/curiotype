import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The root URL is a page of its own that picks the language from the browser. A `/` rule in a
 * Cloudflare Pages / Netlify `_redirects` file would answer first and bypass that page, and a
 * permanent redirect is cached by browsers for a long time. This guard keeps the root out of it.
 */
describe('public/_redirects', () => {
  const rules = existsSync('public/_redirects')
    ? readFileSync('public/_redirects', 'utf8')
        .split('\n')
        .filter((line) => line.trim() && !line.trimStart().startsWith('#'))
        .map((line) => line.trim().split(/\s+/)[0])
    : [];

  it('has no rule for the root URL', () => {
    expect(rules).not.toContain('/');
  });

  it('is replaced by the root page, which exists', () => {
    expect(existsSync('src/pages/index.astro')).toBe(true);
  });

  it('astro.config.mjs does not redirect the root either', () => {
    expect(readFileSync('astro.config.mjs', 'utf8')).not.toMatch(/^\s*redirects\s*:/m);
  });
});
