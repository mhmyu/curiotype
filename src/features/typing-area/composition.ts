/**
 * Composition handling for the typing input (T37c). A dead key (the acute accent key, then `a`) or
 * an input method sends the text in steps: `compositionstart`, `input` events with
 * `isComposing: true` holding a provisional value, then `compositionend` with the final text. The
 * provisional values must not reach the engine (they would count as wrong keystrokes) and the
 * input field must not be rewritten while they last (that cancels the composition).
 */

/** True while input events are provisional and must be ignored. */
export function shouldDeferInput(composing: boolean, event: { isComposing?: boolean }): boolean {
  return composing || event.isComposing === true;
}

/**
 * True for a key press that belongs to an input method (keyCode 229 is how browsers report it).
 * Such a key must never trigger a shortcut: Escape then cancels the composition, not the test.
 */
export function isComposingKey(event: { isComposing?: boolean; keyCode?: number }): boolean {
  return event.isComposing === true || event.keyCode === 229;
}
