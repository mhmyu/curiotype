/**
 * Accent-safe input (T37c). Target texts are Unicode NFC (the build rejects anything else), but an
 * accented letter reaches the input in two shapes: one precomposed character (e with acute,
 * U+00E9) or a base letter followed by a combining mark (e + U+0301; common on macOS, Android and
 * input methods). Everything the engine compares is normalised to NFC first, so both shapes give
 * the same text, the same length, and the same keystroke count.
 */

const COMBINING_MARK = /\p{M}/u;

/** The form the engine works in. The input field is re-synced to it after every change. */
export function normalizeInput(value: string): string {
  return value.normalize('NFC');
}

/**
 * True when `next` is `previous` with a combining mark added to its last character, after both are
 * NFC: the same length, the same text before the last character, and a last character that is the
 * old base letter plus an accent (`e` then `e` + U+0301 = `é`). That is a correction of the last
 * keystroke, not a new keystroke, so the engine must not count it as one.
 */
export function isAccentMerge(previous: string, next: string): boolean {
  if (previous.length === 0 || previous.length !== next.length) return false;
  const last = previous.length - 1;
  if (previous.slice(0, last) !== next.slice(0, last)) return false;
  const before = previous[last];
  const after = next[last];
  if (before === after) return false;
  const decomposed = after.normalize('NFD');
  return decomposed.startsWith(before) && COMBINING_MARK.test(decomposed.slice(before.length));
}
