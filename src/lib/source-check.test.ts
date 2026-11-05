import { describe, expect, it } from 'vitest';
import {
  checkAll,
  checkUrl,
  classifyHttpStatus,
  classifyNetworkError,
  collectSources,
  formatReport,
  summarize,
} from './source-check.ts';
import type { CheckOptions, FetchLike, LinkResult } from './source-check.ts';

const ref = { url: 'https://example.org/a', ids: ['en-science-001'] };

/** Fetch that answers from a script of [method, outcome] steps and records the calls. */
function scripted(steps: Array<number | Error>): { fetch: FetchLike; calls: string[] } {
  const calls: string[] = [];
  let index = 0;
  const fetch: FetchLike = async (_url, init) => {
    calls.push(init.method);
    const step = steps[Math.min(index, steps.length - 1)];
    index += 1;
    if (step instanceof Error) throw step;
    return { status: step };
  };
  return { fetch, calls };
}

function options(fetch: FetchLike, overrides: Partial<CheckOptions> = {}): CheckOptions {
  return { fetch, timeoutMs: 1000, retries: 2, retryDelayMs: 10, sleep: async () => undefined, ...overrides };
}

const dnsError = () => Object.assign(new TypeError('fetch failed'), { cause: { code: 'ENOTFOUND' } });
const timeoutError = () => Object.assign(new Error('timed out'), { name: 'TimeoutError' });

describe('collectSources', () => {
  it('lists each URL once with every sentence that cites it', () => {
    const refs = collectSources([
      { items: [{ id: 'a', source: { url: 'https://x.org/1' } }, { id: 'b', source: { url: 'https://x.org/2' } }] },
      { items: [{ id: 'c', source: { url: 'https://x.org/1' } }] },
    ]);
    expect(refs).toEqual([
      { url: 'https://x.org/1', ids: ['a', 'c'] },
      { url: 'https://x.org/2', ids: ['b'] },
    ]);
  });
});

describe('classifyHttpStatus', () => {
  it.each([
    [200, 'ok'],
    [301, 'ok'],
    [404, 'broken'],
    [410, 'broken'],
    [403, 'uncertain'],
    [429, 'uncertain'],
    [500, 'uncertain'],
    [503, 'uncertain'],
  ])('%i is %s', (code, status) => {
    expect(classifyHttpStatus(code)).toBe(status);
  });
});

describe('classifyNetworkError', () => {
  it('treats an unknown host as broken', () => {
    expect(classifyNetworkError(dnsError()).status).toBe('broken');
  });
  it('treats a temporary DNS failure, a timeout, and other errors as uncertain', () => {
    const temporary = Object.assign(new TypeError('x'), { cause: { code: 'EAI_AGAIN' } });
    expect(classifyNetworkError(temporary).status).toBe('uncertain');
    expect(classifyNetworkError(timeoutError())).toEqual({ status: 'uncertain', detail: 'timed out' });
    expect(classifyNetworkError(new Error('boom')).status).toBe('uncertain');
  });
});

describe('checkUrl', () => {
  it('accepts a page that answers HEAD with 200 using one request', async () => {
    const { fetch, calls } = scripted([200]);
    const result = await checkUrl(ref, options(fetch));
    expect(result).toMatchObject({ status: 'ok', detail: 'HTTP 200' });
    expect(calls).toEqual(['HEAD']);
  });

  it('confirms a failed HEAD with GET, which decides', async () => {
    const { fetch, calls } = scripted([405, 200]);
    expect((await checkUrl(ref, options(fetch))).status).toBe('ok');
    expect(calls).toEqual(['HEAD', 'GET']);
  });

  it('reports 404 as broken without retrying', async () => {
    const { fetch, calls } = scripted([404]);
    const result = await checkUrl(ref, options(fetch));
    expect(result).toMatchObject({ status: 'broken', detail: 'HTTP 404' });
    expect(calls).toEqual(['HEAD', 'GET']);
  });

  it('reports 403 and 429 as uncertain without retrying', async () => {
    for (const code of [403, 429]) {
      const { fetch, calls } = scripted([code]);
      expect((await checkUrl(ref, options(fetch))).status).toBe('uncertain');
      expect(calls).toHaveLength(2);
    }
  });

  it('retries a server error and succeeds', async () => {
    const { fetch } = scripted([503, 503, 200]);
    expect((await checkUrl(ref, options(fetch))).status).toBe('ok');
  });

  it('stays uncertain after the retries run out', async () => {
    const { fetch, calls } = scripted([503]);
    const result = await checkUrl(ref, options(fetch, { retries: 2 }));
    expect(result).toMatchObject({ status: 'uncertain', detail: 'HTTP 503' });
    expect(calls).toHaveLength(2 * 3); // HEAD + GET per attempt, 3 attempts
  });

  it('waits longer before each retry', async () => {
    const waits: number[] = [];
    const { fetch } = scripted([503]);
    await checkUrl(ref, options(fetch, { retries: 2, retryDelayMs: 100, sleep: async (ms) => void waits.push(ms) }));
    expect(waits).toEqual([100, 200]);
  });

  it('reports an unknown host as broken without retrying', async () => {
    const { fetch, calls } = scripted([dnsError()]);
    const result = await checkUrl(ref, options(fetch));
    expect(result).toMatchObject({ status: 'broken', detail: 'DNS lookup failed' });
    expect(calls).toEqual(['HEAD']);
  });

  it('retries a timeout and reports uncertain when it keeps timing out', async () => {
    const { fetch, calls } = scripted([timeoutError()]);
    const result = await checkUrl(ref, options(fetch, { retries: 1 }));
    expect(result).toMatchObject({ status: 'uncertain', detail: 'timed out' });
    expect(calls).toEqual(['HEAD', 'HEAD']);
  });

  it('reports an invalid URL as broken without a request', async () => {
    const { fetch, calls } = scripted([200]);
    const result = await checkUrl({ url: 'not a url', ids: ['x'] }, options(fetch));
    expect(result).toMatchObject({ status: 'broken', detail: 'invalid URL' });
    expect(calls).toEqual([]);
  });

  it('cancels the response body', async () => {
    let cancelled = false;
    const fetch: FetchLike = async () => ({ status: 200, body: { cancel: async () => void (cancelled = true) } });
    await checkUrl(ref, options(fetch));
    expect(cancelled).toBe(true);
  });
});

describe('checkAll', () => {
  const refs = Array.from({ length: 9 }, (_, i) => ({ url: `https://example.org/${i}`, ids: [`id-${i}`] }));

  it('keeps the input order and never exceeds the concurrency', async () => {
    let inFlight = 0;
    let peak = 0;
    const fetch: FetchLike = async (url) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((done) => setTimeout(done, 5 + Number(url.slice(-1)) * 2 * (Number(url.slice(-1)) % 2)));
      inFlight -= 1;
      return { status: url.endsWith('/4') ? 404 : 200 };
    };
    const results = await checkAll(refs, options(fetch), 3);
    expect(results.map((r) => r.url)).toEqual(refs.map((r) => r.url));
    expect(results[4].status).toBe('broken');
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it('handles an empty list', async () => {
    expect(await checkAll([], options(scripted([200]).fetch), 4)).toEqual([]);
  });
});

describe('summarize and formatReport', () => {
  const results: LinkResult[] = [
    { url: 'https://a.org', ids: ['en-science-001'], status: 'ok', detail: 'HTTP 200' },
    { url: 'https://b.org/gone', ids: ['en-science-002', 'id-science-002'], status: 'broken', detail: 'HTTP 404' },
    { url: 'https://c.org', ids: ['en-health-001'], status: 'uncertain', detail: 'HTTP 403' },
  ];

  it('counts each status', () => {
    expect(summarize(results)).toEqual({ total: 3, ok: 1, broken: 1, uncertain: 1 });
  });

  it('lists broken and uncertain links with their sentence ids', () => {
    const report = formatReport(results);
    expect(report).toContain('3 unique source URLs: 1 ok, 1 broken, 1 uncertain.');
    expect(report).toContain('| https://b.org/gone | HTTP 404 | en-science-002, id-science-002 |');
    expect(report).toContain('### Broken (1)');
    expect(report).toContain('| https://c.org | HTTP 403 | en-health-001 |');
    expect(report).not.toContain('https://a.org');
    expect(report).not.toContain('No broken links.');
  });

  it('says so when nothing is broken', () => {
    expect(formatReport([results[0]])).toContain('No broken links.');
  });
});
