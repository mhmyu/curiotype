/**
 * Caps Lock detection for the typing input. With Caps Lock on every letter is typed as a capital
 * and counts as a mistake, which is easy to miss; the page shows a short note while it is on.
 * Browsers only report the state on key events (`getModifierState('CapsLock')`), so it is read on
 * `keydown` and `keyup`; on some platforms only one of the two fires for the Caps Lock key itself.
 */

/** The part of a keyboard event this module needs. */
export interface CapsLockSource {
  getModifierState?: (key: string) => boolean;
}

/** True when the event says Caps Lock is on. False when the browser cannot tell. */
export function isCapsLockOn(event: CapsLockSource): boolean {
  if (typeof event.getModifierState !== 'function') return false;
  try {
    return event.getModifierState('CapsLock') === true;
  } catch {
    return false;
  }
}
