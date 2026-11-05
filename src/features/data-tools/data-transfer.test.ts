import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '@/lib/storage/memory-adapter';
import type { StorageAdapter } from '@/lib/storage/types';
import {
  EXPORT_APP,
  EXPORT_VERSION,
  MAX_IMPORT_BYTES,
  applyImport,
  buildExport,
  clearAllData,
  exportFileName,
  parseImport,
  summarizeImport,
} from './data-transfer';

function entry(id: string, finishedAt: number, overrides: Record<string, unknown> = {}) {
  return {
    id,
    finishedAt,
    contentLang: 'en',
    mode: 'time',
    durationSec: 30,
    category: 'all',
    difficulty: 'all',
    wpm: 40,
    rawWpm: 45,
    accuracy: 95,
    consistency: 80,
    errors: 3,
    ...overrides,
  };
}

async function seeded() {
  const storage = createMemoryStorage();
  await storage.set('history:v1', [entry('a', 100), entry('b', 200, { sentenceIds: ['en-science-001'] })]);
  await storage.set('personal-bests:v1', { 'en:time:30': 50 });
  await storage.set('settings:v1', { theme: 'dark', fontSize: 'lg' });
  await storage.set('seen:v1:en', ['en-science-001']);
  await storage.set('key-stats:v1:en', { a: { attempts: 20, errors: 1 } });
  await storage.set('favorites:v1:en', [{ id: 'en-science-001', savedAt: 500 }]);
  return storage;
}

function file(data: unknown, overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({ app: EXPORT_APP, version: EXPORT_VERSION, exportedAt: '2026-11-01T10:00:00.000Z', data, ...overrides });
}

describe('exportFileName', () => {
  it('uses the local date as typing-data-YYYY-MM-DD.json', () => {
    expect(exportFileName(new Date(2026, 0, 5, 23, 59))).toBe('typing-data-2026-01-05.json');
    expect(exportFileName(new Date(2026, 10, 1))).toBe('typing-data-2026-11-01.json');
  });
});

describe('buildExport', () => {
  it('writes the app marker, the version, the time and every stored key', async () => {
    const out = await buildExport(await seeded(), new Date('2026-11-01T10:00:00.000Z'));
    expect(out.app).toBe('typing');
    expect(out.version).toBe(1);
    expect(out.exportedAt).toBe('2026-11-01T10:00:00.000Z');
    expect(Object.keys(out.data).sort()).toEqual([
      'favorites:v1:en',
      'history:v1',
      'key-stats:v1:en',
      'personal-bests:v1',
      'seen:v1:en',
      'settings:v1',
    ]);
  });

  it('leaves out keys the app does not know and values that fail their check', async () => {
    const storage = await seeded();
    await storage.set('mystery:v1', { x: 1 });
    await storage.set('seen:v1:id', 'not an array');
    const out = await buildExport(storage);
    expect(out.data).not.toHaveProperty('mystery:v1');
    expect(out.data).not.toHaveProperty('seen:v1:id');
  });

  it('of an empty storage has no data', async () => {
    expect((await buildExport(createMemoryStorage())).data).toEqual({});
  });
});

describe('parseImport', () => {
  it('accepts what buildExport wrote (export then import returns the same data)', async () => {
    const source = await seeded();
    const text = JSON.stringify(await buildExport(source));
    const parsed = parseImport(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const target = createMemoryStorage();
    await applyImport(target, parsed.data, 'overwrite');
    expect(await buildExport(target, new Date(0))).toEqual({
      ...(await buildExport(source, new Date(0))),
    });
    expect(parsed.exportedAt).not.toBeNull();
  });

  it('summarizes the number of tests', async () => {
    const parsed = parseImport(JSON.stringify(await buildExport(await seeded())));
    expect(parsed.ok && summarizeImport(parsed.data)).toEqual({ tests: 2 });
    expect(summarizeImport({})).toEqual({ tests: 0 });
  });

  it('rejects a file that is too large', () => {
    const big = file({ 'seen:v1:en': ['x'.repeat(MAX_IMPORT_BYTES)] });
    expect(parseImport(big)).toEqual({ ok: false, error: 'too-large' });
  });

  it('rejects broken JSON', () => {
    expect(parseImport('{oops')).toEqual({ ok: false, error: 'not-json' });
    expect(parseImport('')).toEqual({ ok: false, error: 'not-json' });
  });

  it.each([
    ['an array', '[]'],
    ['a string', '"x"'],
    ['null', 'null'],
    ['data missing', JSON.stringify({ app: 'typing', version: 1 })],
    ['data is an array', JSON.stringify({ app: 'typing', version: 1, data: [] })],
  ])('rejects the wrong shape: %s', (_label, text) => {
    expect(parseImport(text)).toEqual({ ok: false, error: 'wrong-shape' });
  });

  it('rejects another app and another version', () => {
    expect(parseImport(file({ 'seen:v1:en': ['a'] }, { app: 'other' }))).toEqual({ ok: false, error: 'wrong-app' });
    expect(parseImport(file({ 'seen:v1:en': ['a'] }, { app: undefined }))).toEqual({ ok: false, error: 'wrong-app' });
    expect(parseImport(file({ 'seen:v1:en': ['a'] }, { version: 2 }))).toEqual({ ok: false, error: 'unsupported-version' });
    expect(parseImport(file({ 'seen:v1:en': ['a'] }, { version: '1' }))).toEqual({ ok: false, error: 'unsupported-version' });
  });

  it('rejects a file without data', () => {
    expect(parseImport(file({}))).toEqual({ ok: false, error: 'empty' });
  });

  it('rejects an unknown key and names it', () => {
    expect(parseImport(file({ 'seen:v1:en': ['a'], 'mystery:v1': 1 }))).toEqual({
      ok: false,
      error: 'unknown-key',
      key: 'mystery:v1',
    });
  });

  it('rejects one damaged value and names its key, even when the other values are fine', () => {
    expect(
      parseImport(file({ 'seen:v1:en': ['a'], 'history:v1': [entry('a', 1, { wpm: 'fast' })] })),
    ).toEqual({ ok: false, error: 'invalid-value', key: 'history:v1' });
  });
});

describe('applyImport', () => {
  async function incoming() {
    const parsed = parseImport(
      file({
        'history:v1': [entry('b', 200), entry('c', 300)],
        'personal-bests:v1': { 'en:time:30': 60, 'id:quote:na': 35 },
        'settings:v1': { theme: 'light' },
        'seen:v1:en': ['en-science-002'],
        'key-stats:v1:en': { a: { attempts: 10, errors: 2 } },
        'favorites:v1:en': [{ id: 'en-history-001', savedAt: 900 }],
      }),
    );
    if (!parsed.ok) throw new Error('fixture must be valid');
    return parsed.data;
  }

  it('merge combines each value with what is stored', async () => {
    const storage = await seeded();
    await applyImport(storage, await incoming(), 'merge');

    const history = (await storage.get<{ id: string }[]>('history:v1')) ?? [];
    expect(history.map((e) => e.id)).toEqual(['c', 'b', 'a']);
    expect(await storage.get('personal-bests:v1')).toEqual({ 'en:time:30': 60, 'id:quote:na': 35 });
    expect(await storage.get<{ theme: string }>('settings:v1')).toMatchObject({ theme: 'dark', fontSize: 'lg' });
    expect(await storage.get('seen:v1:en')).toEqual(['en-science-001', 'en-science-002']);
    expect(await storage.get('key-stats:v1:en')).toEqual({ a: { attempts: 30, errors: 3 } });
    expect(await storage.get('favorites:v1:en')).toEqual([
      { id: 'en-history-001', savedAt: 900 },
      { id: 'en-science-001', savedAt: 500 },
    ]);
  });

  it('overwrite replaces everything the app stores, including keys the file lacks', async () => {
    const storage = await seeded();
    await storage.set('seen:v1:id', ['id-science-001']);
    await applyImport(storage, await incoming(), 'overwrite');

    expect(await storage.get('seen:v1:id')).toBeNull();
    expect(await storage.get('seen:v1:en')).toEqual(['en-science-002']);
    expect(await storage.get('favorites:v1:en')).toEqual([{ id: 'en-history-001', savedAt: 900 }]);
    const history = (await storage.get<{ id: string }[]>('history:v1')) ?? [];
    expect(history.map((e) => e.id)).toEqual(['b', 'c']);
    expect(await storage.get<{ theme: string }>('settings:v1')).toMatchObject({ theme: 'light' });
  });

  it('puts the previous data back when a write fails halfway', async () => {
    const storage = await seeded();
    const before = new Map(storage.data);
    let writes = 0;
    const failing: StorageAdapter = {
      ...storage,
      async set<T>(key: string, value: T) {
        writes += 1;
        // Fail on the 3rd write of the import; the 5 restoring writes afterwards succeed.
        if (writes === 3) throw new Error('quota exceeded');
        return storage.set(key, value);
      },
    };

    await expect(applyImport(failing, await incoming(), 'overwrite')).rejects.toThrow('quota exceeded');
    expect(new Map(storage.data)).toEqual(before);
  });

  it('merge also rolls back on failure', async () => {
    const storage = await seeded();
    const before = new Map(storage.data);
    let writes = 0;
    const failing: StorageAdapter = {
      ...storage,
      async set<T>(key: string, value: T) {
        writes += 1;
        if (writes === 2) throw new Error('boom');
        return storage.set(key, value);
      },
    };
    await expect(applyImport(failing, await incoming(), 'merge')).rejects.toThrow('boom');
    expect(new Map(storage.data)).toEqual(before);
  });
});

describe('clearAllData', () => {
  it('removes everything the adapter holds', async () => {
    const storage = await seeded();
    await clearAllData(storage);
    expect(await storage.keys()).toEqual([]);
  });
});
