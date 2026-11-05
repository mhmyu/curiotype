import { describe, expect, it } from 'vitest';
import type { KeyStats } from '@/features/typing-engine/key-stats';
import {
  AZERTY_ROWS,
  HEAT_THRESHOLDS,
  KEYBOARD_ROWS,
  MIN_KEY_ATTEMPTS,
  QWERTY_ROWS,
  QWERTZ_ROWS,
  WEAK_KEYS_LIMIT,
  buildHeatmap,
  formatKey,
  getErrorRate,
  getKeyboardRows,
  getHeatLevel,
  hasKeyData,
  listWeakKeys,
} from './weak-keys';

describe('getErrorRate', () => {
  it('is null below the minimum number of attempts and for a missing key', () => {
    expect(getErrorRate(undefined)).toBeNull();
    expect(getErrorRate({ attempts: MIN_KEY_ATTEMPTS - 1, errors: 5 })).toBeNull();
  });

  it('is errors / attempts from the minimum on', () => {
    expect(getErrorRate({ attempts: MIN_KEY_ATTEMPTS, errors: 0 })).toBe(0);
    expect(getErrorRate({ attempts: 40, errors: 10 })).toBe(0.25);
  });
});

describe('getHeatLevel', () => {
  it('moves up exactly at each threshold', () => {
    const [low, mid, high] = HEAT_THRESHOLDS;
    expect(getHeatLevel(0)).toBe(0);
    expect(getHeatLevel(low - 0.001)).toBe(0);
    expect(getHeatLevel(low)).toBe(1);
    expect(getHeatLevel(mid - 0.001)).toBe(1);
    expect(getHeatLevel(mid)).toBe(2);
    expect(getHeatLevel(high - 0.001)).toBe(2);
    expect(getHeatLevel(high)).toBe(3);
    expect(getHeatLevel(1)).toBe(3);
  });
});

describe('buildHeatmap', () => {
  it('has the three QWERTY rows, one cell per letter, in order', () => {
    const rows = buildHeatmap({});
    expect(rows.map((row) => row.map((cell) => cell.key).join(''))).toEqual([...QWERTY_ROWS]);
  });

  it('gives untyped and under-sampled keys no level and no percentage', () => {
    const stats: KeyStats = { a: { attempts: 29, errors: 29 } };
    const cells = buildHeatmap(stats).flat();
    const a = cells.find((cell) => cell.key === 'a');
    const q = cells.find((cell) => cell.key === 'q');
    expect(a).toEqual({ key: 'a', attempts: 29, errors: 29, percent: null, level: null });
    expect(q).toEqual({ key: 'q', attempts: 0, errors: 0, percent: null, level: null });
  });

  it('rounds the percentage and picks the level from the exact rate', () => {
    const stats: KeyStats = {
      s: { attempts: 100, errors: 0 },
      d: { attempts: 100, errors: 2 },
      f: { attempts: 40, errors: 2 }, // 5%
      g: { attempts: 30, errors: 3 }, // 10%
    };
    const cells = buildHeatmap(stats).flat();
    const level = (key: string) => cells.find((cell) => cell.key === key);
    expect(level('s')).toMatchObject({ percent: 0, level: 0 });
    expect(level('d')).toMatchObject({ percent: 2, level: 1 });
    expect(level('f')).toMatchObject({ percent: 5, level: 2 });
    expect(level('g')).toMatchObject({ percent: 10, level: 3 });
  });

  it('accepts other rows', () => {
    expect(buildHeatmap({}, ['ab'])).toHaveLength(1);
  });
});

describe('keyboard layouts', () => {
  const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';
  const sorted = (rows: readonly string[]) => [...rows.join('')].sort().join('');

  it('uses QWERTY for the default languages and for a language without a layout', () => {
    for (const code of ['id', 'en', 'es', 'pt-br', 'it', 'xx']) {
      expect(getKeyboardRows(code)).toBe(QWERTY_ROWS);
    }
  });

  it('uses AZERTY for French and QWERTZ for German', () => {
    expect(getKeyboardRows('fr')).toBe(AZERTY_ROWS);
    expect(getKeyboardRows('de')).toBe(QWERTZ_ROWS);
    expect([...AZERTY_ROWS]).toEqual(['azertyuiop', 'qsdfghjklm', 'wxcvbn']);
    expect([...QWERTZ_ROWS]).toEqual(['qwertzuiop', 'asdfghjkl', 'yxcvbnm']);
  });

  it('draws every layout with the 26 letters exactly once', () => {
    for (const rows of [QWERTY_ROWS, AZERTY_ROWS, QWERTZ_ROWS, ...Object.values(KEYBOARD_ROWS)]) {
      expect(sorted(rows)).toBe(ALPHABET);
    }
  });

  it('does not mistake names on the object prototype for a language', () => {
    expect(getKeyboardRows('constructor')).toBe(QWERTY_ROWS);
    expect(getKeyboardRows('toString')).toBe(QWERTY_ROWS);
  });

  it('builds the AZERTY heat map in layout order, M on the second row', () => {
    const rows = buildHeatmap({}, getKeyboardRows('fr'));
    expect(rows.map((row) => row.map((cell) => cell.key).join(''))).toEqual([...AZERTY_ROWS]);
    expect(rows[1]).toHaveLength(10);
    expect(rows[2]).toHaveLength(6);
  });

  it('reads the counts of the swapped keys of QWERTZ', () => {
    const stats: KeyStats = { z: { attempts: 40, errors: 4 }, y: { attempts: 40, errors: 0 } };
    const cells = buildHeatmap(stats, getKeyboardRows('de')).flat();
    expect(cells.find((cell) => cell.key === 'z')).toMatchObject({ percent: 10, level: 3 });
    expect(cells.find((cell) => cell.key === 'y')).toMatchObject({ percent: 0, level: 0 });
  });

  it('leaves accented letters off the map but still lists them as weak keys', () => {
    const stats: KeyStats = { 'é': { attempts: 60, errors: 12 }, a: { attempts: 60, errors: 1 } };
    const cells = buildHeatmap(stats, getKeyboardRows('fr')).flat();
    expect(cells.some((cell) => cell.key === 'é')).toBe(false);
    expect(listWeakKeys(stats)[0]).toMatchObject({ key: 'é', rate: 0.2 });
  });
});

describe('listWeakKeys', () => {
  it('lists keys with enough attempts and at least one mistake, worst first', () => {
    const stats: KeyStats = {
      a: { attempts: 100, errors: 5 }, // 5%
      b: { attempts: 50, errors: 10 }, // 20%
      c: { attempts: 30, errors: 3 }, // 10%
      d: { attempts: 200, errors: 0 }, // never wrong
      e: { attempts: 10, errors: 10 }, // too few attempts
    };
    expect(listWeakKeys(stats).map((weak) => weak.key)).toEqual(['b', 'c', 'a']);
  });

  it('includes a key that has exactly the minimum attempts', () => {
    const stats: KeyStats = { x: { attempts: MIN_KEY_ATTEMPTS, errors: 1 } };
    expect(listWeakKeys(stats)).toEqual([
      { key: 'x', attempts: MIN_KEY_ATTEMPTS, errors: 1, rate: 1 / MIN_KEY_ATTEMPTS },
    ]);
  });

  it('keeps the top five by default and the order stable on ties', () => {
    const stats: KeyStats = {};
    for (const key of 'abcdefg') stats[key] = { attempts: 50, errors: 5 };
    stats.z = { attempts: 100, errors: 10 }; // same rate, more errors: first
    const keys = listWeakKeys(stats).map((weak) => weak.key);
    expect(keys).toHaveLength(WEAK_KEYS_LIMIT);
    expect(keys).toEqual(['z', 'a', 'b', 'c', 'd']);
    expect(listWeakKeys(stats, 2)).toHaveLength(2);
    expect(listWeakKeys(stats, 0)).toEqual([]);
  });

  it('leaves out the space bar but keeps punctuation and other letters', () => {
    const stats: KeyStats = {
      ' ': { attempts: 500, errors: 250 },
      '.': { attempts: 60, errors: 6 },
      é: { attempts: 40, errors: 8 },
    };
    expect(listWeakKeys(stats).map((weak) => weak.key)).toEqual(['é', '.']);
  });

  it('is empty without data and does not change its input', () => {
    expect(listWeakKeys({})).toEqual([]);
    const stats: KeyStats = { a: { attempts: 40, errors: 4 } };
    const copy = structuredClone(stats);
    listWeakKeys(stats);
    expect(stats).toEqual(copy);
  });
});

describe('hasKeyData', () => {
  it('is true once any key was attempted', () => {
    expect(hasKeyData({})).toBe(false);
    expect(hasKeyData({ a: { attempts: 0, errors: 0 } })).toBe(false);
    expect(hasKeyData({ a: { attempts: 1, errors: 0 } })).toBe(true);
  });
});

describe('formatKey', () => {
  it('uppercases a letter and leaves anything that would grow as it is', () => {
    expect(formatKey('a')).toBe('A');
    expect(formatKey('.')).toBe('.');
    expect(formatKey('ß')).toBe('ß');
  });
});
