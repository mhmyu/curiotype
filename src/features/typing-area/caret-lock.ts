/**
 * Caret lock for the typing input. The engine compares the whole value of the input with the
 * target, so it only works while the caret stays at the end: a letter inserted anywhere else
 * shifts every character after it and turns the whole typed text red, and Backspace can only
 * delete what stands before the caret. The input therefore never lets the caret leave the end:
 * keys that move it or select text are blocked, and any other way of moving it (a click, a tap,
 * a drag, a script) is undone before the next edit.
 */

/** Keys that move the caret or change the selection. */
const NAVIGATION_KEYS = new Set([
  'Home',
  'End',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'ArrowDown',
  'PageUp',
  'PageDown',
  // Forward delete removes the character after the caret, which is never the typed text.
  'Delete',
]);

/**
 * True for a key press that must be ignored: a navigation key (with or without Shift, Ctrl or
 * Alt) or select all (Ctrl+A, Cmd+A). Typing keys, Backspace, Ctrl+Backspace (delete a word),
 * Escape and Tab are not on the list. A key that belongs to an input method is left alone, so
 * the arrow keys still choose a candidate in its popup.
 */
export function shouldBlockKey(event: {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  isComposing?: boolean;
  keyCode?: number;
}): boolean {
  if (event.isComposing === true || event.keyCode === 229) return false;
  if (NAVIGATION_KEYS.has(event.key)) return true;
  return (event.ctrlKey === true || event.metaKey === true) && event.key.toLowerCase() === 'a';
}

/** True when the caret is collapsed at the end of the value (nothing selected). */
export function isCaretAtEnd(field: {
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
}): boolean {
  const end = field.value.length;
  return field.selectionStart === end && field.selectionEnd === end;
}

/** Puts the caret at the end of the value. Returns true when it had to be moved. */
export function lockCaretToEnd(field: {
  value: string;
  selectionStart: number | null;
  selectionEnd: number | null;
  setSelectionRange(start: number, end: number): void;
}): boolean {
  if (isCaretAtEnd(field)) return false;
  const end = field.value.length;
  field.setSelectionRange(end, end);
  return true;
}
