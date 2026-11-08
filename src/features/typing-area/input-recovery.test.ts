import { describe, expect, it } from 'vitest';
import { shouldRejectJump } from './input-recovery';

const reject = shouldRejectJump;

describe('shouldRejectJump: typing that is accepted', () => {
  it('accepts one typed character at the end', () => {
    expect(reject('hello', 'hello ', 'insertText', false, ' ')).toBe(false);
  });

  it('accepts a first character after an empty text', () => {
    expect(reject('', 'a', 'insertText', false, 'a')).toBe(false);
  });

  it('accepts two characters sent in one event (data says so)', () => {
    expect(reject('hello', 'hello w', 'insertText', false, ' w')).toBe(false);
  });

  it('accepts a combining mark that merges into the last letter', () => {
    expect(reject('cafe', 'cafe\u0301', 'insertText', false, '\u0301')).toBe(false);
  });

  it('accepts an accented letter typed as one character', () => {
    expect(reject('caf', 'caf\u00e9', 'insertText', false, '\u00e9')).toBe(false);
  });

  it('accepts typing past the end of the text (the parent cuts it)', () => {
    expect(reject('done.', 'done.x', 'insertText', false, 'x')).toBe(false);
  });

  it('accepts Backspace removing one character', () => {
    expect(reject('hello', 'hell', 'deleteContentBackward', false)).toBe(false);
  });

  it('accepts Backspace removing a surrogate pair', () => {
    expect(reject('a\u{1F600}', 'a', 'deleteContentBackward', false)).toBe(false);
  });

  it('accepts Ctrl+Backspace removing a word, or everything', () => {
    expect(reject('ab cd ef', 'ab cd ', 'deleteWordBackward', false)).toBe(false);
    expect(reject('ab cd ef', '', 'deleteWordBackward', false)).toBe(false);
  });

  it('accepts an unchanged value (nothing to judge)', () => {
    expect(reject('abc', 'abc', 'insertText', false, 'c')).toBe(false);
    expect(reject('abc', 'abc', 'historyUndo', false)).toBe(false);
  });

  it('compares in NFC: a decomposed previous text equals its precomposed form', () => {
    expect(reject('cafe\u0301', 'caf\u00e9x', 'insertText', false, 'x')).toBe(false);
  });
});

describe('shouldRejectJump: a composition is never judged', () => {
  it('accepts any jump while composing', () => {
    expect(reject('abc', 'abcdefgh', 'insertCompositionText', true)).toBe(false);
    expect(reject('abc', 'zzz', 'insertText', true, 'z')).toBe(false);
  });

  it('accepts the composition kinds even when the flag is off (Safari fires one more event)', () => {
    expect(reject('abc', 'abc\u00e9', 'insertFromComposition', false)).toBe(false);
    expect(reject('abc', 'abc\u00e9', 'insertCompositionText', false)).toBe(false);
    expect(reject('abc', 'abcdefgh', 'insertFromComposition', false)).toBe(false);
  });
});

describe('shouldRejectJump: changes the typing did not make', () => {
  it('rejects text inserted in the middle', () => {
    expect(reject('hello', 'heXllo', 'insertText', false, 'X')).toBe(true);
  });

  it('rejects text appended by a script (more than the event data)', () => {
    expect(reject('hello', 'hello inserted text', 'insertText', false, ' ')).toBe(true);
  });

  it('rejects a rewritten text of the same length', () => {
    expect(reject('teh', 'the', 'insertText', false, 'h')).toBe(true);
    expect(reject('teh', 'the', undefined, false)).toBe(true);
  });

  it('rejects a whole text replaced', () => {
    expect(reject('hello', 'goodbye', 'insertText', false, 'goodbye')).toBe(true);
  });

  it('rejects Backspace that removed many characters, or not from the end', () => {
    expect(reject('hello world', 'hello', 'deleteContentBackward', false)).toBe(true);
    expect(reject('hello', 'ello', 'deleteContentBackward', false)).toBe(true);
  });

  it('rejects Ctrl+Backspace that is not a start of the old text', () => {
    expect(reject('ab cd', 'xb', 'deleteWordBackward', false)).toBe(true);
  });

  it('rejects a kind that is not allowed when the text changed', () => {
    expect(reject('abc', 'abcdef', 'insertFromPaste', false)).toBe(true);
    expect(reject('abc', 'xyz', 'insertReplacementText', false)).toBe(true);
    expect(reject('abc', 'ab', 'historyUndo', false)).toBe(true);
  });
});

describe('shouldRejectJump: events without a kind (synthetic)', () => {
  it('accepts one character appended or removed, and an accent merge', () => {
    expect(reject('abc', 'abcd', undefined, false)).toBe(false);
    expect(reject('abc', 'abcd', '', false)).toBe(false);
    expect(reject('abc', 'ab', null, false)).toBe(false);
    expect(reject('cafe', 'cafe\u0301', undefined, false)).toBe(false);
  });

  it('rejects anything bigger', () => {
    expect(reject('abc', 'abcdef', undefined, false)).toBe(true);
    expect(reject('abc', '', undefined, false)).toBe(true);
    expect(reject('abc', 'xbc', undefined, false)).toBe(true);
  });

  it('judges insertText without data like an unknown kind', () => {
    expect(reject('abc', 'abcd', 'insertText', false, null)).toBe(false);
    expect(reject('abc', 'abcdef', 'insertText', false, null)).toBe(true);
  });
});
