/**
 * Recovery for the typing input. The engine trusts the whole value of the input, so a change the
 * typing itself did not produce (text inserted or rewritten by a browser extension, a script, a
 * keyboard that replaces earlier text) would corrupt the test. Every edit is checked against the
 * text before it; an edit that does not fit its kind is undone by putting the previous text back.
 *
 * What fits (all compared in NFC, like the engine):
 * - `insertText`: the old text plus exactly the inserted `data` (one character, or several when a
 *   keyboard sends two at once, or a combining mark that merges into the last letter).
 * - `deleteContentBackward`: the old text without its last one or two UTF-16 units (a character or
 *   a surrogate pair).
 * - `deleteWordBackward`: any shorter start of the old text.
 * - Any other or unknown kind (a synthetic `input` event has none): only a change of one character
 *   at the end, or an accent merge into the last letter.
 * A composition (dead key, input method) is never judged here: its final text arrives once, at
 * `compositionend`, and must always be taken.
 */
import { isAccentMerge, normalizeInput } from '../typing-engine/accents';
import { isAllowedInputType, isCompositionInputType } from './input-types';

/** `deleteContentBackward` removes one character; a surrogate pair is two UTF-16 units. */
const MAX_BACKWARD_DELETE_UNITS = 2;

/**
 * True when the new value of the input must be thrown away and the previous typed text put back.
 * `data` is the `data` of the input event (the inserted text), when there is one.
 */
export function shouldRejectJump(
  previousTyped: string,
  nextValue: string,
  inputType: string | null | undefined,
  composing: boolean,
  data: string | null = null,
): boolean {
  if (composing) return false;
  const previous = normalizeInput(previousTyped);
  const next = normalizeInput(nextValue);
  if (next === previous) return false;

  const type = inputType ?? '';
  // The last step of a composition can arrive after the flag is off (Safari): never judged either.
  if (isCompositionInputType(type)) return false;
  if (type !== '' && !isAllowedInputType(type, false)) return true;

  if (type === 'insertText' && data !== null) {
    return next !== normalizeInput(previous + data);
  }
  if (type === 'deleteContentBackward') {
    const removed = previous.length - next.length;
    return !(previous.startsWith(next) && removed >= 1 && removed <= MAX_BACKWARD_DELETE_UNITS);
  }
  if (type === 'deleteWordBackward') {
    return !(previous.startsWith(next) && next.length < previous.length);
  }

  // Unknown kind, or `insertText` without data: one character at the end, or an accent merge.
  const appendedOne = next.length === previous.length + 1 && next.startsWith(previous);
  const removedOne = previous.length === next.length + 1 && previous.startsWith(next);
  return !(appendedOne || removedOne || isAccentMerge(previous, next));
}
