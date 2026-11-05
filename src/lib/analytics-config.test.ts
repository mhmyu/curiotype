import { describe, expect, it } from 'vitest';
import {
  BEACON_CONNECT_ORIGIN,
  BEACON_SCRIPT_URL,
  analyticsCspSources,
  buildBeaconSrc,
} from './analytics-config';

describe('buildBeaconSrc', () => {
  it('puts the token in the query string of the beacon script', () => {
    expect(buildBeaconSrc('abc123')).toBe(`${BEACON_SCRIPT_URL}?token=abc123`);
  });

  it('encodes characters that are not URL-safe', () => {
    expect(buildBeaconSrc('a b&c')).toBe(`${BEACON_SCRIPT_URL}?token=a%20b%26c`);
  });
});

describe('analyticsCspSources', () => {
  it("keeps 'self' as the only source without a token", () => {
    expect(analyticsCspSources(undefined)).toEqual({ script: ["'self'"], connect: ["'self'"] });
    expect(analyticsCspSources('')).toEqual({ script: ["'self'"], connect: ["'self'"] });
  });

  it('adds exactly the two Cloudflare sources with a token', () => {
    expect(analyticsCspSources('abc123')).toEqual({
      script: ["'self'", BEACON_SCRIPT_URL],
      connect: ["'self'", BEACON_CONNECT_ORIGIN],
    });
  });

  it('uses https sources without wildcards', () => {
    const { script, connect } = analyticsCspSources('abc123');
    for (const source of [...script, ...connect]) expect(source).not.toContain('*');
    expect(BEACON_SCRIPT_URL.startsWith('https://')).toBe(true);
    expect(BEACON_CONNECT_ORIGIN.startsWith('https://')).toBe(true);
  });
});
