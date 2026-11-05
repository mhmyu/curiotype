import { describe, expect, it } from 'vitest';
import { applyInput, createState } from './engine';
import type { TypingState } from './engine';
import {
  computeConsistency,
  computeResult,
  countCorrectChars,
  instantWpm,
} from './metrics';

/** Builds a state as if `typed` had been entered in one go against `target`. */
function typedState(target: string, typed: string): TypingState {
  return applyInput(createState(target), typed);
}

describe('countCorrectChars', () => {
  it('counts only characters that match the target at the same position', () => {
    expect(countCorrectChars(typedState('hello', 'hxllo'))).toBe(4);
  });

  it('is zero when nothing is typed', () => {
    expect(countCorrectChars(createState('hello'))).toBe(0);
  });
});

describe('instantWpm', () => {
  it('converts characters in a window to words per minute', () => {
    // 5 characters = 1 word in 1 second = 60 WPM.
    expect(instantWpm(5, 1000)).toBe(60);
  });

  it('returns 0 for an empty or negative window', () => {
    expect(instantWpm(5, 0)).toBe(0);
    expect(instantWpm(5, -100)).toBe(0);
  });

  it('never goes below 0 when the net character count dropped', () => {
    expect(instantWpm(-3, 1000)).toBe(0);
  });
});

describe('computeConsistency', () => {
  it('is 0 with no samples', () => {
    expect(computeConsistency([])).toBe(0);
  });

  it('is 0 with a single sample', () => {
    expect(computeConsistency([50])).toBe(0);
  });

  it('is 100 when every sample is the same', () => {
    expect(computeConsistency([40, 40, 40])).toBe(100);
  });

  it('is 0 when the mean is 0', () => {
    expect(computeConsistency([0, 0, 0])).toBe(0);
  });

  it('is 100 minus the coefficient of variation in percent', () => {
    // mean 20, stdev 10 -> coefficient 0.5 -> 50.
    expect(computeConsistency([10, 30])).toBe(50);
  });

  it('is clamped to 0 when variation exceeds the mean', () => {
    expect(computeConsistency([0, 0, 0, 100])).toBe(0);
  });
});

describe('computeResult', () => {
  const FIFTY_CHARS = 'a'.repeat(50);

  it('gives 10 WPM for 50 correct characters in 60 seconds', () => {
    const result = computeResult(typedState(FIFTY_CHARS, FIFTY_CHARS), 60_000, []);
    expect(result.wpm).toBe(10);
    expect(result.rawWpm).toBe(10);
    expect(result.correctChars).toBe(50);
    expect(result.incorrectChars).toBe(0);
  });

  it('counts only correct characters in WPM but all typed characters in raw WPM', () => {
    // 50 typed, 25 wrong -> net 25 chars (5 WPM) vs raw 50 chars (10 WPM).
    const typed = 'a'.repeat(25) + 'b'.repeat(25);
    const result = computeResult(typedState(FIFTY_CHARS, typed), 60_000, []);
    expect(result.wpm).toBe(5);
    expect(result.rawWpm).toBe(10);
    expect(result.incorrectChars).toBe(25);
    expect(result.errors).toBe(25);
  });

  it('is 100% accurate when nothing was typed', () => {
    const result = computeResult(createState('abc'), 1000, []);
    expect(result.accuracy).toBe(100);
    expect(result.wpm).toBe(0);
  });

  it('still counts an erased mistake against accuracy', () => {
    let state = createState('ab');
    state = applyInput(state, 'x'); // wrong
    state = applyInput(state, ''); // erased
    state = applyInput(state, 'a'); // correct
    // 2 keystrokes, 1 error -> 50%.
    expect(computeResult(state, 1000, []).accuracy).toBe(50);
  });

  it('rounds WPM and accuracy to one decimal', () => {
    // 7 correct chars in 1.5 s -> 7 / 5 / 0.025 min = 56 WPM.
    const result = computeResult(typedState('abcdefg', 'abcdefg'), 1500, []);
    expect(result.wpm).toBe(56);
    const withError = computeResult(typedState('abc', 'abx'), 1000, []);
    expect(withError.accuracy).toBe(66.7);
  });

  it('does not divide by zero when no time has elapsed', () => {
    const result = computeResult(typedState('abcde', 'abcde'), 0, []);
    expect(Number.isFinite(result.wpm)).toBe(true);
    expect(result.elapsedMs).toBe(0);
  });

  it('computes consistency from the samples and returns a copy of them', () => {
    const samples = [10, 30];
    const result = computeResult(createState('abc'), 2000, samples);
    expect(result.consistency).toBe(50);
    expect(result.samples).toEqual([10, 30]);
    expect(result.samples).not.toBe(samples);
  });
});
