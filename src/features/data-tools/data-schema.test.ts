import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/ui/en';
import { id } from '@/i18n/ui/id';
import { DEFAULT_SETTINGS } from '@/features/settings/settings';
import {
  DATA_KEY_LABELS,
  DATA_KINDS,
  getDataKind,
  mergeValue,
  validateValue,
} from './data-schema';

function entry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a1',
    finishedAt: 1000,
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

describe('getDataKind', () => {
  it('recognizes every key the app writes', () => {
    expect(getDataKind('history:v1')).toBe('history');
    expect(getDataKind('personal-bests:v1')).toBe('personalBests');
    expect(getDataKind('settings:v1')).toBe('settings');
    expect(getDataKind('seen:v1:id')).toBe('seen');
    expect(getDataKind('seen:v1:pt-br')).toBe('seen');
    expect(getDataKind('key-stats:v1:en')).toBe('keyStats');
    expect(getDataKind('favorites:v1:id')).toBe('favorites');
    expect(getDataKind('favorites:v1:pt-br')).toBe('favorites');
    expect(getDataKind('streak:v1')).toBe('streak');
    expect(getDataKind('custom-texts:v1')).toBe('customTexts');
  });

  it('rejects unknown keys and bad language codes', () => {
    for (const key of ['', 'history', 'history:v2', 'seen:v1:', 'seen:v1:EN', 'seen:v1:a b', 'favorites:v1', 'favorites:v1:', 'favorites:v1:EN', 'streak:v1:id', 'streak', 'custom-texts', 'custom-texts:v1:en', 'custom-texts:v2', 'other:v1', 'typing:history:v1']) {
      expect(getDataKind(key), key).toBeNull();
    }
  });
});

describe('privacy texts', () => {
  it('describe every kind of data in both languages', () => {
    for (const kind of DATA_KINDS) {
      expect(DATA_KEY_LABELS[kind].length, kind).toBeGreaterThan(0);
      expect(id.privacy.data[kind].length, `id ${kind}`).toBeGreaterThan(0);
      expect(en.privacy.data[kind].length, `en ${kind}`).toBeGreaterThan(0);
    }
  });
});

describe('validateValue: history', () => {
  it('accepts valid entries, keeps the optional fields and drops unknown ones', () => {
    const clean = entry({ sentenceIds: ['s1'], categoryChars: { science: 12 } });
    expect(validateValue('history', [{ ...clean, extra: 'x' }])).toEqual({ valid: true, value: [clean] });
  });

  it('accepts a well-formed category that is not in the category list (it may be added or removed later)', () => {
    const clean = entry({ category: 'sports', categoryChars: { sports: 3, science: 9 } });
    expect(validateValue('history', [clean])).toEqual({ valid: true, value: [clean] });
  });

  it('accepts null duration (quote mode) and the "all" filters', () => {
    expect(validateValue('history', [entry({ mode: 'quote', durationSec: null })]).valid).toBe(true);
  });

  it('rejects anything that is not an array, or has more than 200 entries', () => {
    expect(validateValue('history', {}).valid).toBe(false);
    expect(validateValue('history', 'x').valid).toBe(false);
    const many = Array.from({ length: 201 }, (_, i) => entry({ id: `e${i}` }));
    expect(validateValue('history', many).valid).toBe(false);
  });

  it.each([
    ['not an object', 5],
    ['missing id', entry({ id: undefined })],
    ['empty contentLang', entry({ contentLang: '' })],
    ['unknown mode', entry({ mode: 'zen' })],
    ['unknown difficulty', entry({ difficulty: 'insane' })],
    ['retired difficulty "medium" (no migration)', entry({ difficulty: 'medium' })],
    ['wpm as string', entry({ wpm: '40' })],
    ['negative errors', entry({ errors: -1 })],
    ['NaN accuracy', entry({ accuracy: Number.NaN })],
    ['zero duration', entry({ durationSec: 0 })],
    ['sentenceIds not strings', entry({ sentenceIds: [1] })],
    ['categoryChars with a malformed category id', entry({ categoryChars: { 'Bad Name': 3 } })],
    ['malformed category id', entry({ category: 'Sports' })],
    ['categoryChars negative', entry({ categoryChars: { science: -3 } })],
  ])('rejects one bad entry: %s', (_label, bad) => {
    expect(validateValue('history', [entry(), bad]).valid).toBe(false);
  });

  it('drops a repeated id instead of failing', () => {
    expect(validateValue('history', [entry(), entry()])).toEqual({ valid: true, value: [entry()] });
  });
});

describe('validateValue: other kinds', () => {
  it('personal bests: every key must be a bucket key with a non-negative number', () => {
    expect(validateValue('personalBests', { 'en:time:30': 55, 'id:quote:na': 40 }).valid).toBe(true);
    for (const bad of [[], 'x', { 'en:time:30': '55' }, { nope: 5 }, { 'en:zen:30': 5 }, { 'en:time:30': -1 }]) {
      expect(validateValue('personalBests', bad).valid).toBe(false);
    }
  });

  it('settings: an object is accepted and normalized; anything else is not', () => {
    expect(validateValue('settings', { theme: 'dark', junk: 1 })).toEqual({
      valid: true,
      value: { ...DEFAULT_SETTINGS, theme: 'dark' },
    });
    expect(validateValue('settings', []).valid).toBe(false);
    expect(validateValue('settings', null).valid).toBe(false);
  });

  it('seen: an array of non-empty strings (duplicates removed)', () => {
    expect(validateValue('seen', ['a', 'b', 'a'])).toEqual({ valid: true, value: ['a', 'b'] });
    for (const bad of [{}, ['a', 1], ['a', '']]) {
      expect(validateValue('seen', bad).valid).toBe(false);
    }
  });

  it('key stats: every entry must be a single character with valid counts', () => {
    expect(validateValue('keyStats', { a: { attempts: 10, errors: 2 } }).valid).toBe(true);
    for (const bad of [[], { ab: { attempts: 1, errors: 0 } }, { a: { attempts: 1, errors: 2 } }, { a: 'x' }]) {
      expect(validateValue('keyStats', bad).valid).toBe(false);
    }
  });
});

describe('validateValue: favorites', () => {
  it('accepts a list of { id, savedAt } and returns it newest first', () => {
    expect(
      validateValue('favorites', [
        { id: 'a', savedAt: 1 },
        { id: 'b', savedAt: 2, extra: 'x' },
      ]),
    ).toEqual({
      valid: true,
      value: [
        { id: 'b', savedAt: 2 },
        { id: 'a', savedAt: 1 },
      ],
    });
    expect(validateValue('favorites', []).valid).toBe(true);
  });

  it('rejects what is not a clean list: wrong type, bad entries, repeated ids, too many', () => {
    const tooMany = Array.from({ length: 501 }, (_, i) => ({ id: `s${i}`, savedAt: i }));
    for (const bad of [
      {},
      'x',
      [1],
      [{ id: '', savedAt: 1 }],
      [{ id: 'a' }],
      [{ id: 'a', savedAt: 'now' }],
      [{ id: 'a', savedAt: -5 }],
      [
        { id: 'a', savedAt: 1 },
        { id: 'a', savedAt: 2 },
      ],
      tooMany,
    ]) {
      expect(validateValue('favorites', bad).valid, JSON.stringify(bad).slice(0, 40)).toBe(false);
    }
  });
});

describe('mergeValue', () => {
  it('history: union by id, newest first, trimmed to 200', () => {
    const existing = [entry({ id: 'a', finishedAt: 10 }), entry({ id: 'b', finishedAt: 30 })];
    const incoming = [entry({ id: 'b', finishedAt: 30 }), entry({ id: 'c', finishedAt: 20 })];
    const merged = mergeValue('history', existing, incoming) as { id: string }[];
    expect(merged.map((e) => e.id)).toEqual(['b', 'c', 'a']);

    const many = Array.from({ length: 150 }, (_, i) => entry({ id: `x${i}`, finishedAt: i }));
    const more = Array.from({ length: 150 }, (_, i) => entry({ id: `y${i}`, finishedAt: 1000 + i }));
    expect((mergeValue('history', many, more) as unknown[]).length).toBe(200);
  });

  it('history: works when nothing (or garbage) is stored', () => {
    const incoming = [entry({ id: 'a' })];
    expect(mergeValue('history', null, incoming)).toEqual(incoming);
    expect(mergeValue('history', 'oops', incoming)).toEqual(incoming);
  });

  it('personal bests: keeps the higher value of each bucket', () => {
    expect(
      mergeValue('personalBests', { 'en:time:30': 50, 'en:time:60': 40 }, { 'en:time:30': 45, 'en:time:60': 55, 'id:quote:na': 30 }),
    ).toEqual({ 'en:time:30': 50, 'en:time:60': 55, 'id:quote:na': 30 });
  });

  it('settings: current settings win; imported ones fill an empty store', () => {
    const incoming = { ...DEFAULT_SETTINGS, theme: 'dark' };
    expect(mergeValue('settings', { theme: 'light' }, incoming)).toEqual({ ...DEFAULT_SETTINGS, theme: 'light' });
    expect(mergeValue('settings', null, incoming)).toEqual(incoming);
  });

  it('seen: union, current ids first', () => {
    expect(mergeValue('seen', ['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
    expect(mergeValue('seen', null, ['c'])).toEqual(['c']);
  });

  it('key stats: adds the counts', () => {
    expect(mergeValue('keyStats', { a: { attempts: 10, errors: 1 } }, { a: { attempts: 5, errors: 2 }, b: { attempts: 1, errors: 0 } })).toEqual({
      a: { attempts: 15, errors: 3 },
      b: { attempts: 1, errors: 0 },
    });
  });

  it('favorites: union by id, later save time wins, newest first', () => {
    expect(
      mergeValue(
        'favorites',
        [
          { id: 'a', savedAt: 10 },
          { id: 'b', savedAt: 50 },
        ],
        [
          { id: 'a', savedAt: 40 },
          { id: 'c', savedAt: 20 },
        ],
      ),
    ).toEqual([
      { id: 'b', savedAt: 50 },
      { id: 'a', savedAt: 40 },
      { id: 'c', savedAt: 20 },
    ]);
    expect(mergeValue('favorites', null, [{ id: 'c', savedAt: 20 }])).toEqual([{ id: 'c', savedAt: 20 }]);
  });
});

describe('validateValue: streak', () => {
  const ok = { lastDay: '2026-11-01', current: 3, best: 5, todayCount: 2 };

  it('accepts a consistent streak and the empty state', () => {
    expect(validateValue('streak', ok)).toEqual({ valid: true, value: ok });
    const empty = { lastDay: null, current: 0, best: 0, todayCount: 0 };
    expect(validateValue('streak', empty)).toEqual({ valid: true, value: empty });
  });

  it('rejects damaged values', () => {
    for (const bad of [null, [], 'x', { ...ok, lastDay: '2026-02-30' }, { ...ok, best: 1 }, { ...ok, extra: 1 }, { lastDay: '2026-11-01' }]) {
      expect(validateValue('streak', bad).valid, JSON.stringify(bad)).toBe(false);
    }
  });
});

describe('mergeValue: streak', () => {
  it('uses the later day and the higher best', () => {
    expect(
      mergeValue(
        'streak',
        { lastDay: '2026-10-20', current: 9, best: 9, todayCount: 4 },
        { lastDay: '2026-11-01', current: 2, best: 3, todayCount: 1 },
      ),
    ).toEqual({ lastDay: '2026-11-01', current: 2, best: 9, todayCount: 1 });
  });

  it('takes the imported value when nothing (or something damaged) is stored', () => {
    const incoming = { lastDay: '2026-11-01', current: 1, best: 1, todayCount: 1 };
    expect(mergeValue('streak', null, incoming)).toEqual(incoming);
    expect(mergeValue('streak', 'broken', incoming)).toEqual(incoming);
  });
});

describe('custom texts', () => {
  const a = { id: 'a', text: 'First text.', savedAt: 30 };
  const b = { id: 'b', text: 'Second text.', savedAt: 20 };

  it('validates a list of normalized texts and keeps the newest first', () => {
    expect(validateValue('customTexts', [a, b])).toEqual({ valid: true, value: [a, b] });
    expect(validateValue('customTexts', [b, a])).toEqual({ valid: true, value: [a, b] });
    expect(validateValue('customTexts', [])).toEqual({ valid: true, value: [] });
  });

  it('rejects damaged values, texts that are not typeable and too many texts', () => {
    const many = Array.from({ length: 6 }, (_, i) => ({ id: `x${i}`, text: `Text ${i}.`, savedAt: i }));
    for (const bad of [
      null,
      {},
      'x',
      [{ ...a, text: 'Caf\u00E9.' }],
      [{ ...a, text: ' padded ' }],
      [{ ...a, text: 'double  space' }],
      [{ ...a, text: '' }],
      [{ ...a, savedAt: 'now' }],
      [{ ...a, id: '' }],
      [a, a],
      [a, { ...b, text: a.text }],
      many,
    ]) {
      expect(validateValue('customTexts', bad).valid, JSON.stringify(bad)).toBe(false);
    }
  });

  it('merges by text (the later save wins), newest first, at most five', () => {
    expect(mergeValue('customTexts', [a], [b])).toEqual([a, b]);
    expect(mergeValue('customTexts', [a], [{ id: 'z', text: a.text, savedAt: 99 }])).toEqual([
      { id: 'z', text: a.text, savedAt: 99 },
    ]);
    const six = Array.from({ length: 5 }, (_, i) => ({ id: `n${i}`, text: `Text ${i}.`, savedAt: 100 + i }));
    expect(mergeValue('customTexts', six, [a, b])).toEqual([...six].reverse());
    expect(mergeValue('customTexts', null, [a])).toEqual([a]);
    expect(mergeValue('customTexts', 'broken', [a])).toEqual([a]);
  });
});
