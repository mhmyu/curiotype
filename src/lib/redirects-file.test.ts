import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DEFAULT_LANGUAGE } from '../i18n/config';

/** Rules of the Cloudflare Pages / Netlify `_redirects` format: `from to [status]`. */
function parseRedirects(text: string) {
  return text
    .split('\n')
    .filter((line) => line.trim() && !line.trimStart().startsWith('#'))
    .map((line) => {
      const [from, to, status] = line.trim().split(/\s+/);
      return { from, to, status };
    });
}

describe('public/_redirects', () => {
  const rules = parseRedirects(readFileSync('public/_redirects', 'utf8'));

  it('has only the root redirect', () => {
    expect(rules).toHaveLength(1);
    expect(rules[0].from).toBe('/');
  });

  it('sends the root to the default language with a permanent redirect', () => {
    expect(rules[0].to).toBe(`/${DEFAULT_LANGUAGE}/`);
    expect(rules[0].status).toBe('301');
  });
});
