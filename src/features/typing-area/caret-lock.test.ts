import { describe, expect, it } from 'vitest';
import { isCaretAtEnd, lockCaretToEnd, shouldBlockKey } from './caret-lock';

function field(value: string, start: number | null, end: number | null = start) {
  const state = { value, selectionStart: start, selectionEnd: end };
  return Object.assign(state, {
    setSelectionRange(s: number, e: number) {
      state.selectionStart = s;
      state.selectionEnd = e;
    },
  });
}

describe('shouldBlockKey', () => {
  it.each(['Home', 'End', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Delete'])(
    'blocks %s',
    (key) => {
      expect(shouldBlockKey({ key })).toBe(true);
      expect(shouldBlockKey({ key, ctrlKey: true })).toBe(true);
    },
  );

  it('blocks select all with Ctrl or Cmd', () => {
    expect(shouldBlockKey({ key: 'a', ctrlKey: true })).toBe(true);
    expect(shouldBlockKey({ key: 'A', metaKey: true })).toBe(true);
  });

  it('lets typing, Backspace, Ctrl+Backspace, Escape and Tab through', () => {
    expect(shouldBlockKey({ key: 'a' })).toBe(false);
    expect(shouldBlockKey({ key: ' ' })).toBe(false);
    expect(shouldBlockKey({ key: 'Backspace' })).toBe(false);
    expect(shouldBlockKey({ key: 'Backspace', ctrlKey: true })).toBe(false);
    expect(shouldBlockKey({ key: 'Escape' })).toBe(false);
    expect(shouldBlockKey({ key: 'Tab' })).toBe(false);
  });

  it('leaves the keys of an input method alone', () => {
    expect(shouldBlockKey({ key: 'ArrowDown', isComposing: true })).toBe(false);
    expect(shouldBlockKey({ key: 'ArrowDown', keyCode: 229 })).toBe(false);
  });
});

describe('isCaretAtEnd', () => {
  it('is true only for a collapsed caret at the end', () => {
    expect(isCaretAtEnd(field('abc', 3))).toBe(true);
    expect(isCaretAtEnd(field('', 0))).toBe(true);
    expect(isCaretAtEnd(field('abc', 0))).toBe(false);
    expect(isCaretAtEnd(field('abc', 1, 3))).toBe(false);
    expect(isCaretAtEnd(field('abc', 0, 3))).toBe(false);
    expect(isCaretAtEnd(field('abc', null, null))).toBe(false);
  });
});

describe('lockCaretToEnd', () => {
  it('moves a caret in the middle, or a selection, to the end', () => {
    const middle = field('abcdef', 2);
    expect(lockCaretToEnd(middle)).toBe(true);
    expect([middle.selectionStart, middle.selectionEnd]).toEqual([6, 6]);

    const selected = field('abcdef', 0, 6);
    expect(lockCaretToEnd(selected)).toBe(true);
    expect([selected.selectionStart, selected.selectionEnd]).toEqual([6, 6]);
  });

  it('does nothing when the caret is already at the end', () => {
    const ok = field('abc', 3);
    expect(lockCaretToEnd(ok)).toBe(false);
  });
});
