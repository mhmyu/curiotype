import { isAccentMerge, normalizeInput } from './accents';

/**
 * Pure typing state. No DOM, no timers: the UI feeds it the input value and
 * reads the new state back, so it is easy to test and reuse in any mode.
 */
export interface TypingState {
  readonly target: string;
  readonly typed: string;
  /** Total characters entered, including ones later erased. */
  readonly keystrokes: number;
  /** Entered characters that did not match the target at that position. */
  readonly errorKeystrokes: number;
}

export function createState(target: string): TypingState {
  return { target, typed: '', keystrokes: 0, errorKeystrokes: 0 };
}

export interface InputOptions {
  /**
   * A wrong character stops the cursor: it is shown and counted as an error, but nothing typed
   * after it is accepted until it is deleted.
   */
  stopOnError?: boolean;
}

/** Index of the first typed character that differs from the target, or -1 when all match. */
export function findFirstError(typed: string, target: string): number {
  for (let i = 0; i < typed.length; i++) {
    if (typed[i] !== target[i]) return i;
  }
  return -1;
}

/**
 * Characters that count as progress when a test checks whether it is finished. Normally every
 * typed character; with stop-on-error a wrong character does not count, so a test can never end
 * on a mistake (the last character must be right).
 */
export function getProgressLength(state: TypingState, stopOnError: boolean): number {
  if (!stopOnError) return state.typed.length;
  const firstError = findFirstError(state.typed, state.target);
  return firstError === -1 ? state.typed.length : firstError;
}

/**
 * Applies the full current value of the input field. The value is compared in Unicode NFC, so an
 * accented letter typed as a base letter plus a combining mark equals the precomposed target
 * character (see `accents.ts`).
 */
export function applyInput(
  state: TypingState,
  nextTyped: string,
  options: InputOptions = {},
): TypingState {
  let typed = normalizeInput(nextTyped).slice(0, state.target.length);
  if (options.stopOnError) {
    // Keep the text up to and including the first mistake; the rest is not accepted.
    const firstError = findFirstError(typed, state.target);
    if (firstError !== -1) typed = typed.slice(0, firstError + 1);
  }
  let { keystrokes, errorKeystrokes } = state;

  // A combining mark added to the last letter (`e`, then `e` + U+0301) corrects that keystroke: it
  // adds no keystroke, and the error count follows whether the corrected letter is now right.
  if (isAccentMerge(state.typed, typed)) {
    const last = typed.length - 1;
    const wasError = state.typed[last] !== state.target[last];
    const isError = typed[last] !== state.target[last];
    errorKeystrokes += Number(isError) - Number(wasError);
    return { ...state, typed, keystrokes, errorKeystrokes };
  }

  // Only characters added beyond the previous length count as new keystrokes.
  for (let i = state.typed.length; i < typed.length; i++) {
    keystrokes += 1;
    if (typed[i] !== state.target[i]) errorKeystrokes += 1;
  }

  return { ...state, typed, keystrokes, errorKeystrokes };
}

/** Extends the target text (used by continuous modes such as time mode). */
export function appendTarget(state: TypingState, extra: string): TypingState {
  return { ...state, target: state.target + extra };
}
