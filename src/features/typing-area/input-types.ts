/**
 * Allow-list of edit kinds for the typing input. The field is only a way to collect typed
 * characters: the engine compares its whole value with the target, so any other kind of edit
 * (undo, redo, cut, drop, a replaced word from autocorrect or dictation, a line break, deleting
 * forward or to the start of a line) would change the text in a way the typing never produced.
 * Those edits are cancelled in `beforeinput`. The check is an allow-list, not a block-list, so a
 * kind that browsers add later is cancelled until it is added here on purpose.
 *
 * Values are the `inputType` strings of the Input Events specification.
 */

/** Edits that come from pressing keys: a character, Backspace, Ctrl+Backspace. */
const KEY_INPUT_TYPES: ReadonlySet<string> = new Set([
  'insertText',
  'deleteContentBackward',
  'deleteWordBackward',
]);

/**
 * Edits made by a dead key or an input method. Browsers do not let a page cancel them, and they
 * must keep working (accents, IME), so they are always allowed.
 */
const COMPOSITION_INPUT_TYPES: ReadonlySet<string> = new Set([
  'insertCompositionText',
  'deleteCompositionText',
  'insertFromComposition',
  'deleteByComposition',
]);

/** True for the steps of a composition (dead key, input method). */
export function isCompositionInputType(inputType: string): boolean {
  return COMPOSITION_INPUT_TYPES.has(inputType);
}

/**
 * True when an edit of this kind may reach the engine. While a composition is running everything
 * is allowed: its steps are provisional, cannot be cancelled anyway, and cancelling a neighbour
 * could break the composition.
 */
export function isAllowedInputType(inputType: string, composing: boolean): boolean {
  if (composing) return true;
  return KEY_INPUT_TYPES.has(inputType) || COMPOSITION_INPUT_TYPES.has(inputType);
}

/**
 * True when the edit must be cancelled: not allowed, and the browser lets the page cancel it
 * (`cancelable`; calling `preventDefault` on a composition step does nothing).
 */
export function shouldCancelInput(
  event: { inputType: string; cancelable: boolean; isComposing?: boolean },
  composing: boolean,
): boolean {
  return event.cancelable && !isAllowedInputType(event.inputType, composing || event.isComposing === true);
}
