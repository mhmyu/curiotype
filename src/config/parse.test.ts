import { describe, expect, it } from 'vitest';
import { parseAnalyticsToken, parseRepoUrl, parseSiteUrl } from './parse';

describe('parseSiteUrl', () => {
  it('returns undefined for empty, blank or missing values', () => {
    expect(parseSiteUrl(undefined)).toBeUndefined();
    expect(parseSiteUrl('')).toBeUndefined();
    expect(parseSiteUrl('   ')).toBeUndefined();
  });

  it('accepts an http(s) origin and removes the trailing slash', () => {
    expect(parseSiteUrl('https://typing.example.com')).toBe('https://typing.example.com');
    expect(parseSiteUrl('https://typing.example.com/')).toBe('https://typing.example.com');
    expect(parseSiteUrl(' http://localhost:4321 ')).toBe('http://localhost:4321');
  });

  it('drops path, query and hash', () => {
    expect(parseSiteUrl('https://example.com/some/path?x=1#top')).toBe('https://example.com');
  });

  it('rejects invalid URLs and other protocols', () => {
    expect(parseSiteUrl('typing.example.com')).toBeUndefined();
    expect(parseSiteUrl('ftp://example.com')).toBeUndefined();
    expect(parseSiteUrl('javascript:alert(1)')).toBeUndefined();
  });
});

describe('parseRepoUrl', () => {
  it('returns undefined for empty or missing values', () => {
    expect(parseRepoUrl(undefined)).toBeUndefined();
    expect(parseRepoUrl('')).toBeUndefined();
  });

  it('accepts a GitHub repository root', () => {
    expect(parseRepoUrl('https://github.com/owner/repo')).toBe('https://github.com/owner/repo');
  });

  it('removes a trailing slash, a .git suffix, query and hash', () => {
    expect(parseRepoUrl('https://github.com/owner/repo/')).toBe('https://github.com/owner/repo');
    expect(parseRepoUrl('https://github.com/owner/repo.git')).toBe('https://github.com/owner/repo');
    expect(parseRepoUrl('https://github.com/owner/repo?tab=readme#top')).toBe(
      'https://github.com/owner/repo',
    );
  });

  it('rejects other hosts, http, and anything that is not a repository root', () => {
    expect(parseRepoUrl('https://gitlab.com/owner/repo')).toBeUndefined();
    expect(parseRepoUrl('http://github.com/owner/repo')).toBeUndefined();
    expect(parseRepoUrl('https://github.com/owner')).toBeUndefined();
    expect(parseRepoUrl('https://github.com/owner/repo/tree/main')).toBeUndefined();
    expect(parseRepoUrl('github.com/owner/repo')).toBeUndefined();
  });
});

describe('parseAnalyticsToken', () => {
  it('treats empty and missing values as not configured', () => {
    expect(parseAnalyticsToken(undefined)).toBeUndefined();
    expect(parseAnalyticsToken('')).toBeUndefined();
    expect(parseAnalyticsToken('   ')).toBeUndefined();
  });

  it('accepts a 32-character hex token and trims it', () => {
    expect(parseAnalyticsToken('  0123456789abcdef0123456789abcdef ')).toBe(
      '0123456789abcdef0123456789abcdef',
    );
  });

  it('rejects values that are too short, too long or could break out of a URL or attribute', () => {
    expect(parseAnalyticsToken('abc')).toBeUndefined();
    expect(parseAnalyticsToken('a'.repeat(65))).toBeUndefined();
    expect(parseAnalyticsToken('0123456789abcdef"><script>')).toBeUndefined();
    expect(parseAnalyticsToken('0123456789abcdef&x=1')).toBeUndefined();
    expect(parseAnalyticsToken('0123456789 abcdef')).toBeUndefined();
  });
});
