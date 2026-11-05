import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { THEME_INIT_SCRIPT } from '@/features/settings/theme';
import { hashInlineScript } from './csp';

describe('hashInlineScript', () => {
  it('matches a known SHA-256 digest in base64', () => {
    // sha256("") in base64, a published constant.
    expect(hashInlineScript('')).toBe('sha256-47DEQpj8HBSa+/TImW+5JCeuQeRkm5NMpJWZG3hSuFU=');
  });

  it('hashes the exact text, so any change gives another hash', () => {
    expect(hashInlineScript('a')).not.toBe(hashInlineScript('a '));
  });

  it('covers non-ASCII text as UTF-8', () => {
    const expected = createHash('sha256').update(Buffer.from('é', 'utf8')).digest('base64');
    expect(hashInlineScript('é')).toBe(`sha256-${expected}`);
  });

  it('yields the entry allowed for the theme script', () => {
    expect(hashInlineScript(THEME_INIT_SCRIPT)).toMatch(/^sha256-[A-Za-z0-9+/]{43}=$/);
  });
});
