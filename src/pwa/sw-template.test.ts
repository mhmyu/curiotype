import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { beforeEach, describe, expect, it } from 'vitest';
import { renderServiceWorker } from '@/lib/pwa-build';

/**
 * Runs the real service worker (the template with test values filled in) inside a `vm` context
 * with a fake cache storage, network and events, and checks what it answers.
 */

const ORIGIN = 'https://typing.test';
const REVISION = 'rev2';
const PRECACHE = ['/', '/id/', '/en/', '/en/stats/', '/_astro/app.1.js', '/favicon.svg'];
const DATA = ['/data/id/sentences.json', '/data/en/sentences.json'];

const template = readFileSync('src/pwa/sw-template.js', 'utf8');
const source = renderServiceWorker(template, { precache: PRECACHE, data: DATA }, REVISION, '/id/');

type Handler = (event: unknown) => void;

class FakeCaches {
  stores = new Map<string, Map<string, Response>>();

  private key(url: string): string {
    return new URL(url, ORIGIN).pathname;
  }

  async open(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new Map());
    const store = this.stores.get(name) as Map<string, Response>;
    return {
      put: async (url: string, response: Response) => {
        store.set(this.key(url), response);
      },
      match: async (url: string) => store.get(this.key(url))?.clone(),
    };
  }

  async match(url: string, options?: { cacheName?: string }) {
    const names = options?.cacheName ? [options.cacheName] : [...this.stores.keys()];
    for (const name of names) {
      const hit = this.stores.get(name)?.get(this.key(url));
      if (hit) return hit.clone();
    }
    return undefined;
  }

  async keys() {
    return [...this.stores.keys()];
  }

  async delete(name: string) {
    return this.stores.delete(name);
  }
}

interface FetchCall {
  url: string;
  cache?: string;
}

function setup() {
  const handlers = new Map<string, Handler>();
  const caches = new FakeCaches();
  const network = new Map<string, { status: number; body: string }>();
  const calls: FetchCall[] = [];
  const state = { online: true, skipped: 0, claimed: 0 };

  // Every file of the plan exists on the "server" by default.
  for (const path of [...PRECACHE, ...DATA]) network.set(path, { status: 200, body: `network:${path}` });

  const fakeFetch = async (input: string | { url: string }, init?: { cache?: string }) => {
    const url = typeof input === 'string' ? input : input.url;
    calls.push({ url: new URL(url, ORIGIN).pathname, cache: init?.cache });
    if (!state.online) throw new TypeError('Failed to fetch');
    const entry = network.get(new URL(url, ORIGIN).pathname);
    if (!entry) return new Response('not found', { status: 404 });
    return new Response(entry.body, { status: entry.status });
  };

  const context = vm.createContext({
    self: {
      location: { origin: ORIGIN },
      addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
      skipWaiting: () => void (state.skipped += 1),
      clients: { claim: async () => void (state.claimed += 1) },
    },
    caches,
    fetch: fakeFetch,
    URL,
    Response,
    Set,
    Promise,
    Error,
    TypeError,
    console,
  });
  vm.runInContext(source, context);

  function dispatch(type: string, data?: unknown) {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<Response> | undefined;
    const event = {
      data,
      request: data,
      waitUntil: (promise: Promise<unknown>) => waits.push(Promise.resolve(promise)),
      respondWith: (promise: Promise<Response>) => {
        responded = Promise.resolve(promise);
      },
    };
    (handlers.get(type) as Handler)(event);
    return {
      waits: () => Promise.all(waits),
      responded: () => responded,
    };
  }

  function request(path: string, init: { method?: string; mode?: string; origin?: string } = {}) {
    return { url: `${init.origin ?? ORIGIN}${path}`, method: init.method ?? 'GET', mode: init.mode ?? 'cors' };
  }

  async function install() {
    const result = dispatch('install');
    await result.waits();
  }

  return { caches, network, calls, state, dispatch, request, install };
}

let sw: ReturnType<typeof setup>;
beforeEach(() => {
  sw = setup();
});

async function text(promise: Promise<Response> | undefined): Promise<string> {
  expect(promise).toBeDefined();
  return (await (promise as Promise<Response>)).text();
}

describe('install', () => {
  it('stores every page and asset in the cache named after the revision', async () => {
    await sw.install();
    const precache = sw.caches.stores.get(`typing-precache-${REVISION}`);
    expect([...(precache?.keys() ?? [])].sort()).toEqual([...PRECACHE].sort());
  });

  it('stores the sentence files in the data cache', async () => {
    await sw.install();
    expect([...(sw.caches.stores.get('typing-data-v1')?.keys() ?? [])].sort()).toEqual([...DATA].sort());
  });

  it('reuses the HTTP cache for hashed assets only', async () => {
    await sw.install();
    expect(sw.calls.find((call) => call.url === '/_astro/app.1.js')?.cache).toBe('default');
    expect(sw.calls.find((call) => call.url === '/id/')?.cache).toBe('reload');
    expect(sw.calls.find((call) => call.url === '/data/id/sentences.json')?.cache).toBe('reload');
  });

  it('fails when one file cannot be fetched, so a broken build never replaces a good one', async () => {
    sw.network.set('/en/stats/', { status: 500, body: 'oops' });
    await expect(sw.install()).rejects.toThrow(/en\/stats/);
  });

  it('waits instead of taking over: no skipWaiting on its own', async () => {
    await sw.install();
    expect(sw.state.skipped).toBe(0);
  });
});

describe('activate', () => {
  it('deletes the precaches of older builds, keeps the current one and the data cache, and claims the page', async () => {
    await sw.install();
    await sw.caches.open('typing-precache-old1');
    await sw.caches.open('typing-precache-old2');
    await sw.caches.open('someone-elses-cache');
    await sw.dispatch('activate').waits();
    expect([...sw.caches.stores.keys()].sort()).toEqual([
      'someone-elses-cache',
      'typing-data-v1',
      `typing-precache-${REVISION}`,
    ]);
    expect(sw.state.claimed).toBe(1);
  });
});

describe('message', () => {
  it('SKIP_WAITING activates the waiting worker', () => {
    sw.dispatch('message', { type: 'SKIP_WAITING' });
    expect(sw.state.skipped).toBe(1);
  });

  it('ignores any other message', () => {
    sw.dispatch('message', { type: 'HELLO' });
    sw.dispatch('message', undefined);
    sw.dispatch('message', 'SKIP_WAITING');
    expect(sw.state.skipped).toBe(0);
  });
});

describe('navigation', () => {
  beforeEach(async () => {
    await sw.install();
    sw.calls.length = 0;
    // The network now answers differently, to tell the cache from the network.
    for (const [path] of sw.network) sw.network.set(path, { status: 200, body: `fresh:${path}` });
  });

  it('serves a stored page from the cache without the network', async () => {
    const event = sw.dispatch('fetch', sw.request('/id/', { mode: 'navigate' }));
    expect(await text(event.responded())).toBe('network:/id/');
    expect(sw.calls).toEqual([]);
  });

  it('finds the stored page when the address lacks the slash, has a query, or ends in index.html', async () => {
    for (const path of ['/en', '/en/?utm=x', '/en/index.html']) {
      const event = sw.dispatch('fetch', sw.request(path, { mode: 'navigate' }));
      expect(await text(event.responded())).toBe('network:/en/');
    }
    expect(sw.calls).toEqual([]);
  });

  it('asks the network for a page it does not store', async () => {
    const event = sw.dispatch('fetch', sw.request('/id/unknown/', { mode: 'navigate' }));
    await event.responded();
    expect(sw.calls.map((call) => call.url)).toEqual(['/id/unknown/']);
  });

  it('offline, shows the home page of the same interface language for a page it does not store', async () => {
    sw.state.online = false;
    const english = sw.dispatch('fetch', sw.request('/en/unknown/', { mode: 'navigate' }));
    expect(await text(english.responded())).toBe('network:/en/');
    const indonesian = sw.dispatch('fetch', sw.request('/id/other/', { mode: 'navigate' }));
    expect(await text(indonesian.responded())).toBe('network:/id/');
  });

  it('offline, shows the default language for an address without a known language', async () => {
    sw.state.online = false;
    for (const path of ['/zz/', '/something']) {
      const event = sw.dispatch('fetch', sw.request(path, { mode: 'navigate' }));
      expect(await text(event.responded())).toBe('network:/id/');
    }
  });

  it('still opens every stored page offline', async () => {
    sw.state.online = false;
    for (const path of ['/', '/id/', '/en/', '/en/stats/']) {
      const event = sw.dispatch('fetch', sw.request(path, { mode: 'navigate' }));
      expect(await text(event.responded())).toBe(`network:${path}`);
    }
  });
});

describe('assets', () => {
  beforeEach(async () => {
    await sw.install();
    sw.calls.length = 0;
  });

  it('serves a stored asset from the cache', async () => {
    const event = sw.dispatch('fetch', sw.request('/_astro/app.1.js'));
    expect(await text(event.responded())).toBe('network:/_astro/app.1.js');
    expect(sw.calls).toEqual([]);
  });

  it('leaves everything it does not store to the browser', () => {
    const event = sw.dispatch('fetch', sw.request('/some/other.png'));
    expect(event.responded()).toBeUndefined();
  });

  it('ignores requests that are not GET', () => {
    expect(sw.dispatch('fetch', sw.request('/id/', { method: 'POST', mode: 'navigate' })).responded()).toBeUndefined();
  });

  it('ignores requests to other origins', () => {
    const event = sw.dispatch('fetch', sw.request('/_astro/app.1.js', { origin: 'https://other.test' }));
    expect(event.responded()).toBeUndefined();
  });
});

describe('sentence files (stale while revalidate)', () => {
  beforeEach(async () => {
    await sw.install();
    sw.calls.length = 0;
  });

  it('answers from the cache at once and refreshes it in the background', async () => {
    sw.network.set('/data/id/sentences.json', { status: 200, body: 'new sentences' });
    const first = sw.dispatch('fetch', sw.request('/data/id/sentences.json'));
    expect(await text(first.responded())).toBe('network:/data/id/sentences.json');
    await first.waits();
    expect(sw.calls.map((call) => call.url)).toEqual(['/data/id/sentences.json']);

    const second = sw.dispatch('fetch', sw.request('/data/id/sentences.json'));
    expect(await text(second.responded())).toBe('new sentences');
    await second.waits();
  });

  it('works offline from the cache and does not fail the background refresh', async () => {
    sw.state.online = false;
    const event = sw.dispatch('fetch', sw.request('/data/en/sentences.json'));
    expect(await text(event.responded())).toBe('network:/data/en/sentences.json');
    await expect(event.waits()).resolves.toBeDefined();
  });

  it('does not keep an error response', async () => {
    sw.network.set('/data/id/sentences.json', { status: 500, body: 'broken' });
    const first = sw.dispatch('fetch', sw.request('/data/id/sentences.json'));
    await first.responded();
    await first.waits();
    const second = sw.dispatch('fetch', sw.request('/data/id/sentences.json'));
    expect(await text(second.responded())).toBe('network:/data/id/sentences.json');
    await second.waits();
  });

  it('fails the request when offline with nothing stored', async () => {
    sw.state.online = false;
    sw.caches.stores.get('typing-data-v1')?.clear();
    const event = sw.dispatch('fetch', sw.request('/data/id/sentences.json'));
    await expect(event.responded()).rejects.toThrow();
  });
});
