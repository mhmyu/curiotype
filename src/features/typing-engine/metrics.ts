import type { TypingState } from './engine';

/** Standard typing-test convention: one "word" is five characters. */
const CHARS_PER_WORD = 5;
const MS_PER_MINUTE = 60_000;

export interface TestResult {
  /** Net WPM: correct characters only. */
  wpm: number;
  /** Raw WPM: every typed character, correct or not. */
  rawWpm: number;
  /** Percentage of keystrokes that were correct (erased mistakes still count). */
  accuracy: number;
  /** 0-100, higher means steadier speed across the test. */
  consistency: number;
  correctChars: number;
  incorrectChars: number;
  errors: number;
  elapsedMs: number;
  /** Instantaneous WPM sampled once per second. */
  samples: number[];
}

const round1 = (value: number): number => Math.round(value * 10) / 10;

export function countCorrectChars(state: TypingState): number {
  let correct = 0;
  for (let i = 0; i < state.typed.length; i++) {
    if (state.typed[i] === state.target[i]) correct += 1;
  }
  return correct;
}

/** Instantaneous WPM for a window in which `charsDelta` characters net were typed. */
export function instantWpm(charsDelta: number, windowMs: number): number {
  if (windowMs <= 0) return 0;
  return Math.max(0, (charsDelta / CHARS_PER_WORD) / (windowMs / MS_PER_MINUTE));
}

/** Consistency as 100 minus the coefficient of variation (stdev / mean) in percent. */
export function computeConsistency(samples: readonly number[]): number {
  if (samples.length < 2) return 0;
  const mean = samples.reduce((sum, value) => sum + value, 0) / samples.length;
  if (mean === 0) return 0;
  const variance = samples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / samples.length;
  const coefficient = Math.sqrt(variance) / mean;
  return round1(Math.min(100, Math.max(0, 100 * (1 - coefficient))));
}

export function computeResult(
  state: TypingState,
  elapsedMs: number,
  samples: readonly number[],
): TestResult {
  const correctChars = countCorrectChars(state);
  const incorrectChars = state.typed.length - correctChars;
  const minutes = Math.max(elapsedMs, 1) / MS_PER_MINUTE;
  const accuracy =
    state.keystrokes === 0
      ? 100
      : ((state.keystrokes - state.errorKeystrokes) / state.keystrokes) * 100;

  return {
    wpm: round1(correctChars / CHARS_PER_WORD / minutes),
    rawWpm: round1(state.typed.length / CHARS_PER_WORD / minutes),
    accuracy: round1(accuracy),
    consistency: computeConsistency(samples),
    correctChars,
    incorrectChars,
    errors: state.errorKeystrokes,
    elapsedMs,
    samples: [...samples],
  };
}
