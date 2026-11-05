/**
 * Keyboard shortcuts of the result screens.
 *
 * Only the non-character keys Escape and Enter are used. Tab is never taken over (that would
 * be a keyboard trap, WCAG 2.1.2) and there are no single-character shortcuts (WCAG 2.1.4),
 * so no setting to switch them off is needed. Pure functions, no DOM access: the listeners
 * live in the components and pass the event data in.
 */

/** Enter is ignored this long after a result is shown, so the habitual Enter at the end of typing does not close it. */
export const RESULT_SHORTCUT_DELAY_MS = 600;

/** The parts of an event target the checks read; a DOM `Element` fits, so tests need no DOM. */
export interface ShortcutTarget {
  tagName?: string;
  isContentEditable?: boolean;
  getAttribute?: (name: string) => string | null;
}

/** Tags that handle Enter (or Escape) themselves when they have focus. */
const INTERACTIVE_TAGS: ReadonlySet<string> = new Set([
  'A',
  'BUTTON',
  'INPUT',
  'TEXTAREA',
  'SELECT',
  'SUMMARY',
]);

/** Fields where Escape means something to the browser (closing a list) or to the user (editing). */
const TEXT_ENTRY_TAGS: ReadonlySet<string> = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

function isEditable(target: ShortcutTarget): boolean {
  if (target.isContentEditable === true) return true;
  const attribute = target.getAttribute?.('contenteditable');
  return attribute === '' || attribute === 'true' || attribute === 'plaintext-only';
}

/**
 * True when the focused element does something with Enter itself (a button, a link such as the
 * source or report link, a form field, a disclosure, a custom button, an editable area). The
 * shortcut must leave it alone so that Enter keeps its normal action.
 */
export function isInteractiveTarget(target: ShortcutTarget | null | undefined): boolean {
  if (!target) return false;
  const tag = target.tagName?.toUpperCase();
  if (tag && INTERACTIVE_TAGS.has(tag)) return true;
  if (target.getAttribute?.('role') === 'button') return true;
  return isEditable(target);
}

/** The key facts of a keydown event that decide whether a shortcut applies. */
export interface ShortcutEvent {
  key: string;
  /** The key is held down and auto-repeating. */
  repeat: boolean;
  /** An input method (IME) composition is in progress. */
  isComposing?: boolean;
  /** Another handler already used the event. */
  defaultPrevented?: boolean;
  /** Ctrl, Meta, Alt, or Shift is held. */
  modifiers: boolean;
  target: ShortcutTarget | null | undefined;
  /** A `<dialog>` is open (the user is answering something else). */
  dialogOpen: boolean;
}

function isBlocked(event: ShortcutEvent): boolean {
  return (
    event.modifiers || event.repeat || event.isComposing === true || event.defaultPrevented === true || event.dialogOpen
  );
}

export interface ResultEnterEvent extends ShortcutEvent {
  /** Time since the result (or the session summary) was shown. */
  msSinceFinished: number;
}

/**
 * Enter on a result screen means "try again" (or "new session" on the relaxed summary).
 * Ignored with a modifier, on key repeat, while composing, when already handled, with a dialog
 * open, when the focus is on an interactive element, and during the first 600 ms.
 */
export function shouldHandleResultEnter(event: ResultEnterEvent): boolean {
  if (event.key !== 'Enter') return false;
  if (isBlocked(event)) return false;
  if (isInteractiveTarget(event.target)) return false;
  return event.msSinceFinished >= RESULT_SHORTCUT_DELAY_MS;
}

/**
 * Escape on a result screen does the same as the "Try again" button. It has no guard delay
 * (nobody presses it by habit at the end of typing). It is left alone when the focus is in a
 * form field, where the browser or the user uses it (closing a list, leaving an editor).
 */
export function shouldHandleResultEscape(event: ShortcutEvent): boolean {
  if (event.key !== 'Escape') return false;
  if (isBlocked(event)) return false;
  const tag = event.target?.tagName?.toUpperCase();
  if (tag && TEXT_ENTRY_TAGS.has(tag)) return false;
  if (event.target && isEditable(event.target)) return false;
  return true;
}

/** Reads the facts the checks need from a real keydown event (browser only). */
export function readShortcutEvent(event: KeyboardEvent): ShortcutEvent {
  return {
    key: event.key,
    repeat: event.repeat,
    isComposing: event.isComposing,
    defaultPrevented: event.defaultPrevented,
    modifiers: event.ctrlKey || event.metaKey || event.altKey || event.shiftKey,
    // An HTMLElement fits `ShortcutTarget`; anything else (document, window) counts as no target.
    target: event.target instanceof HTMLElement ? event.target : null,
    dialogOpen: document.querySelector('dialog[open]') !== null,
  };
}
