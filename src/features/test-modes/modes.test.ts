import { describe, expect, it } from 'vitest';
import type { Sentence, TestSettings } from '@/lib/types';
import { countMode } from './count-mode';
import { customMode } from './custom-mode';
import {
  COUNT_OPTIONS,
  MODE_IDS,
  MODES,
  RECORD_MODE_IDS,
  SCORED_MODE_IDS,
  TIME_DURATIONS,
} from './index';
import { quoteMode } from './quote-mode';
import { relaxedMode } from './relaxed-mode';
import { timeMode } from './time-mode';

const SETTINGS: TestSettings = {
  mode: 'time',
  durationSec: 30,
  sentenceCount: 3,
  focus: 'none',
  category: 'all',
  difficulty: 'all',
};

/** Returns a `next` function that hands out numbered sentences and counts the calls. */
function sentenceSource() {
  let calls = 0;
  const next = (): Sentence => {
    calls += 1;
    return {
      id: `en-science-${String(calls).padStart(3, '0')}`,
      lang: 'en',
      category: 'science',
      difficulty: 'easy',
      text: `Sentence ${calls}.`,
      explanation: 'Explanation.',
      source: { title: 'Publisher: Title', url: 'https://example.org' },
    };
  };
  return { next, calls: () => calls };
}

describe('mode registry', () => {
  it('registers every mode under its own id', () => {
    for (const id of MODE_IDS) {
      expect(MODES[id].id).toBe(id);
    }
  });

  it('offers the agreed time durations', () => {
    expect([...TIME_DURATIONS]).toEqual([15, 30, 60, 120]);
  });
});

describe('time mode', () => {
  it('starts with three sentences', () => {
    const source = sentenceSource();
    expect(timeMode.initialSentences(source.next, SETTINGS)).toHaveLength(3);
    expect(source.calls()).toBe(3);
  });

  it('appends when fewer than 80 characters remain', () => {
    expect(timeMode.shouldAppend({ typedLength: 0, targetLength: 79, elapsedMs: 0 })).toBe(true);
    expect(timeMode.shouldAppend({ typedLength: 0, targetLength: 80, elapsedMs: 0 })).toBe(false);
    expect(timeMode.shouldAppend({ typedLength: 120, targetLength: 200, elapsedMs: 0 })).toBe(false);
    expect(timeMode.shouldAppend({ typedLength: 121, targetLength: 200, elapsedMs: 0 })).toBe(true);
  });

  it('finishes exactly when the duration is reached, not before', () => {
    const snapshot = { typedLength: 10, targetLength: 300 };
    expect(timeMode.isFinished({ ...snapshot, elapsedMs: 29_999 }, SETTINGS)).toBe(false);
    expect(timeMode.isFinished({ ...snapshot, elapsedMs: 30_000 }, SETTINGS)).toBe(true);
    expect(timeMode.isFinished({ ...snapshot, elapsedMs: 31_000 }, SETTINGS)).toBe(true);
  });

  it('does not finish just because all text was typed', () => {
    expect(
      timeMode.isFinished({ typedLength: 300, targetLength: 300, elapsedMs: 5_000 }, SETTINGS),
    ).toBe(false);
  });

  it('caps the scored time at the duration', () => {
    expect(timeMode.effectiveElapsedMs(12_000, SETTINGS)).toBe(12_000);
    expect(timeMode.effectiveElapsedMs(30_450, SETTINGS)).toBe(30_000);
  });
});

describe('quote mode', () => {
  it('starts with exactly one sentence', () => {
    const source = sentenceSource();
    expect(quoteMode.initialSentences(source.next, { ...SETTINGS, mode: 'quote' })).toHaveLength(1);
    expect(source.calls()).toBe(1);
  });

  it('never appends text', () => {
    expect(quoteMode.shouldAppend({ typedLength: 99, targetLength: 100, elapsedMs: 0 })).toBe(false);
  });

  it('finishes when the last character is typed', () => {
    const settings: TestSettings = { ...SETTINGS, mode: 'quote' };
    expect(quoteMode.isFinished({ typedLength: 99, targetLength: 100, elapsedMs: 0 }, settings)).toBe(false);
    expect(quoteMode.isFinished({ typedLength: 100, targetLength: 100, elapsedMs: 0 }, settings)).toBe(true);
  });

  it('scores the real elapsed time', () => {
    expect(quoteMode.effectiveElapsedMs(45_000, { ...SETTINGS, mode: 'quote' })).toBe(45_000);
  });
});

describe('count mode', () => {
  const settings = (sentenceCount: number): TestSettings => ({ ...SETTINGS, mode: 'count', sentenceCount });

  it('offers 1, 3, 5 and 10 sentences', () => {
    expect([...COUNT_OPTIONS]).toEqual([1, 3, 5, 10]);
  });

  it('is registered under its own id', () => {
    expect(MODES.count).toBe(countMode);
  });

  it('starts with exactly the chosen number of sentences', () => {
    for (const count of COUNT_OPTIONS) {
      const source = sentenceSource();
      expect(countMode.initialSentences(source.next, settings(count))).toHaveLength(count);
      expect(source.calls()).toBe(count);
    }
  });

  it('never appends text', () => {
    expect(countMode.shouldAppend({ typedLength: 10, targetLength: 20, elapsedMs: 0 })).toBe(false);
  });

  it('finishes when the whole target is typed, not before', () => {
    expect(countMode.isFinished({ typedLength: 199, targetLength: 200, elapsedMs: 0 }, settings(5))).toBe(false);
    expect(countMode.isFinished({ typedLength: 200, targetLength: 200, elapsedMs: 0 }, settings(5))).toBe(true);
  });

  it('scores the real elapsed time', () => {
    expect(countMode.effectiveElapsedMs(90_000, settings(10))).toBe(90_000);
  });
});

describe('relaxed mode', () => {
  const settings: TestSettings = { ...SETTINGS, mode: 'relaxed' };

  it('is registered under its own id and is not scored', () => {
    expect(MODES.relaxed).toBe(relaxedMode);
    expect(relaxedMode.scored).toBe(false);
    expect(relaxedMode.showsClock).toBe(false);
  });

  it('starts with exactly one sentence', () => {
    const source = sentenceSource();
    expect(relaxedMode.initialSentences(source.next, settings)).toHaveLength(1);
    expect(source.calls()).toBe(1);
  });

  it('never appends text and finishes when the last character is typed', () => {
    expect(relaxedMode.shouldAppend({ typedLength: 5, targetLength: 50, elapsedMs: 0 })).toBe(false);
    expect(relaxedMode.isFinished({ typedLength: 49, targetLength: 50, elapsedMs: 0 }, settings)).toBe(false);
    expect(relaxedMode.isFinished({ typedLength: 50, targetLength: 50, elapsedMs: 0 }, settings)).toBe(true);
  });
});

describe('scored modes', () => {
  it('lists every mode except the unscored ones, in registry order', () => {
    expect([...SCORED_MODE_IDS]).toEqual(['time', 'quote', 'count', 'custom']);
    expect(MODE_IDS).toContain('relaxed');
  });

  it('keeps records only for the modes without hasRecords: false (custom text has none)', () => {
    expect([...RECORD_MODE_IDS]).toEqual(['time', 'quote', 'count']);
    expect(SCORED_MODE_IDS).toContain('custom');
  });

  it('treats the markers as true when a mode leaves them out', () => {
    for (const id of SCORED_MODE_IDS) {
      expect(MODES[id].scored).not.toBe(false);
      expect(MODES[id].showsClock).not.toBe(false);
    }
    for (const id of RECORD_MODE_IDS) expect(MODES[id].hasRecords).not.toBe(false);
  });
});

describe('custom mode', () => {
  const settings: TestSettings = { ...SETTINGS, mode: 'custom' };

  it('is registered, scored and draws nothing from the corpus', () => {
    const { next, calls } = sentenceSource();
    expect(MODES.custom).toBe(customMode);
    expect(customMode.initialSentences(next, settings)).toEqual([]);
    expect(calls()).toBe(0);
    expect(customMode.scored).not.toBe(false);
    expect(customMode.showsClock).not.toBe(false);
    expect(customMode.hasRecords).toBe(false);
  });

  it('never appends text and finishes when the last character is typed', () => {
    expect(customMode.shouldAppend({ typedLength: 5, targetLength: 50, elapsedMs: 0 })).toBe(false);
    expect(customMode.isFinished({ typedLength: 49, targetLength: 50, elapsedMs: 0 }, settings)).toBe(false);
    expect(customMode.isFinished({ typedLength: 50, targetLength: 50, elapsedMs: 0 }, settings)).toBe(true);
  });

  it('scores the running time as is', () => {
    expect(customMode.effectiveElapsedMs(12_345, settings)).toBe(12_345);
  });
});
