import { describe, expect, it } from 'vitest';
import { loadAnalytics, shouldLoadAnalytics } from './analytics';
import type { AnalyticsEnvironment } from './analytics';

const base: AnalyticsEnvironment = { token: 'abcdef0123456789', isDev: false, doNotTrack: null };

describe('shouldLoadAnalytics', () => {
  it('loads in production with a token and no opt-out', () => {
    expect(shouldLoadAnalytics(base)).toBe(true);
    expect(shouldLoadAnalytics({ ...base, doNotTrack: '0' })).toBe(true);
    expect(shouldLoadAnalytics({ ...base, doNotTrack: 'unspecified' })).toBe(true);
  });

  it('does nothing without a token', () => {
    expect(shouldLoadAnalytics({ ...base, token: undefined })).toBe(false);
    expect(shouldLoadAnalytics({ ...base, token: '' })).toBe(false);
  });

  it('does nothing in dev mode', () => {
    expect(shouldLoadAnalytics({ ...base, isDev: true })).toBe(false);
  });

  it('respects Do Not Track', () => {
    expect(shouldLoadAnalytics({ ...base, doNotTrack: '1' })).toBe(false);
    expect(shouldLoadAnalytics({ ...base, doNotTrack: 'yes' })).toBe(false);
  });

  it('respects Global Privacy Control', () => {
    expect(shouldLoadAnalytics({ ...base, globalPrivacyControl: true })).toBe(false);
    expect(shouldLoadAnalytics({ ...base, globalPrivacyControl: false })).toBe(true);
  });
});

/** Minimal stand-in for `document`: only what `loadAnalytics` touches. */
function fakeDocument() {
  const added: { type: string; src: string; async: boolean }[] = [];
  const doc = {
    head: { appendChild: (node: (typeof added)[number]) => added.push(node) },
    createElement: () => ({ type: '', src: '', async: false }),
    querySelector: (selector: string) => {
      const match = /script\[src="(.*)"\]/.exec(selector);
      return match && added.some((node) => node.src === match[1]) ? {} : null;
    },
  };
  return { doc: doc as unknown as Document, added };
}

describe('loadAnalytics', () => {
  it('adds one module script with the token and does not add it twice', () => {
    const { doc, added } = fakeDocument();
    expect(loadAnalytics(base, doc)).toBe(true);
    expect(loadAnalytics(base, doc)).toBe(false);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      type: 'module',
      src: 'https://static.cloudflareinsights.com/beacon.min.js?token=abcdef0123456789',
    });
  });

  it('adds nothing when the visitor opted out, without a token, or in dev', () => {
    for (const env of [
      { ...base, doNotTrack: '1' },
      { ...base, globalPrivacyControl: true },
      { ...base, token: undefined },
      { ...base, isDev: true },
    ]) {
      const { doc, added } = fakeDocument();
      expect(loadAnalytics(env, doc)).toBe(false);
      expect(added).toHaveLength(0);
    }
  });
});
