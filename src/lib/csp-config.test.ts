import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

// The CSP is configured in astro.config.mjs, which cannot be imported here (it loads the
// environment and the integrations). Read it as text and check the directives that matter.
const config = readFileSync('astro.config.mjs', 'utf8');

describe('security.csp in astro.config.mjs', () => {
  it('is enabled', () => {
    expect(config).toMatch(/security:\s*\{\s*csp:\s*\{/);
  });

  it.each([
    "default-src 'self'",
    "object-src 'none'",
    "frame-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "font-src 'self'",
  ])('declares %s', (directive) => {
    expect(config).toContain(`"${directive}"`);
  });

  it('turns Shiki off, whose inline styles clash with the policy (the site has no Markdown)', () => {
    expect(config).toMatch(/markdown:\s*\{\s*syntaxHighlight:\s*false/);
  });

  it('never allows unsafe-inline, unsafe-eval or a hard-coded origin', () => {
    const block = config.slice(config.indexOf('security:'), config.indexOf('fonts:'));
    expect(block).not.toMatch(/unsafe-inline|unsafe-eval|https?:\/\//);
  });

  it('takes the analytics hosts from analytics-config, only when a token is set', () => {
    expect(config).toContain('analyticsCspSources(analyticsToken)');
    expect(config).toContain('scriptDirective: { resources: analyticsCsp.script }');
    expect(config).toContain('connect-src ${analyticsCsp.connect.join');
  });
});
