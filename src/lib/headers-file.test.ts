import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/** Parses the Cloudflare Pages / Netlify `_headers` format: a path line, then indented headers. */
function parseHeadersFile(text: string): Map<string, Map<string, string>> {
  const rules = new Map<string, Map<string, string>>();
  let current: Map<string, string> | undefined;
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = new Map();
      rules.set(line.trim(), current);
      continue;
    }
    const colon = line.indexOf(':');
    if (!current || colon === -1) throw new Error(`Malformed line in _headers: "${line}"`);
    current.set(line.slice(0, colon).trim().toLowerCase(), line.slice(colon + 1).trim());
  }
  return rules;
}

const rules = parseHeadersFile(readFileSync('public/_headers', 'utf8'));

describe('public/_headers', () => {
  it('has a rule for every page and one for the hashed assets', () => {
    expect([...rules.keys()]).toEqual(['/*', '/sw.js', '/_astro/*']);
  });

  it('sets the security headers on every path', () => {
    const all = rules.get('/*');
    expect(all?.get('x-content-type-options')).toBe('nosniff');
    expect(all?.get('referrer-policy')).toBe('strict-origin-when-cross-origin');
    expect(all?.get('x-frame-options')).toBe('DENY');
    expect(all?.get('content-security-policy')).toBe("frame-ancestors 'none'");
  });

  it('keeps the Permissions-Policy minimal: powerful features off, none turned on', () => {
    const policy = rules.get('/*')?.get('permissions-policy') ?? '';
    for (const feature of ['camera', 'microphone', 'geolocation']) {
      expect(policy).toContain(`${feature}=()`);
    }
    // Every entry is an empty allowlist: the site uses none of these features.
    for (const entry of policy.split(',')) expect(entry.trim()).toMatch(/^[a-z-]+=\(\)$/);
  });

  it('always revalidates the service worker', () => {
    expect(rules.get('/sw.js')?.get('cache-control')).toBe('no-cache');
  });

  it('caches the hashed assets for a year as immutable', () => {
    expect(rules.get('/_astro/*')?.get('cache-control')).toBe('public, max-age=31536000, immutable');
  });

  it('does not repeat the script and style policy, which Astro writes per build', () => {
    // A hash list in a static file would go stale at the next build.
    const policy = rules.get('/*')?.get('content-security-policy') ?? '';
    expect(policy).not.toMatch(/script-src|style-src|default-src/);
  });
});
