import { describe, expect, it } from 'vitest';
import {
  appendTarget,
  applyInput,
  createState,
  findFirstError,
  getProgressLength,
} from './engine';

describe('createState', () => {
  it('starts empty with zero keystrokes', () => {
    expect(createState('abc')).toEqual({
      target: 'abc',
      typed: '',
      keystrokes: 0,
      errorKeystrokes: 0,
    });
  });
});

describe('applyInput', () => {
  it('counts each added correct character as a keystroke without errors', () => {
    let state = createState('hello');
    state = applyInput(state, 'h');
    state = applyInput(state, 'he');
    expect(state.typed).toBe('he');
    expect(state.keystrokes).toBe(2);
    expect(state.errorKeystrokes).toBe(0);
  });

  it('counts a wrong character as an error keystroke', () => {
    const state = applyInput(createState('hello'), 'hx');
    expect(state.keystrokes).toBe(2);
    expect(state.errorKeystrokes).toBe(1);
  });

  it('counts only characters added beyond the previous length', () => {
    let state = createState('hello');
    state = applyInput(state, 'he');
    // Same value again (e.g. a re-fired input event) adds nothing.
    state = applyInput(state, 'he');
    expect(state.keystrokes).toBe(2);
  });

  it('does not count deleting characters as keystrokes', () => {
    let state = createState('hello');
    state = applyInput(state, 'hel');
    state = applyInput(state, 'h');
    expect(state.typed).toBe('h');
    expect(state.keystrokes).toBe(3);
  });

  it('keeps an erased mistake in the error count', () => {
    let state = createState('cat');
    state = applyInput(state, 'cx'); // 2 keystrokes, 1 error
    state = applyInput(state, 'c'); // erase the mistake
    state = applyInput(state, 'ca'); // 3rd keystroke, correct
    expect(state.typed).toBe('ca');
    expect(state.keystrokes).toBe(3);
    expect(state.errorKeystrokes).toBe(1);
  });

  it('counts every character of a multi-character change (e.g. autocorrect)', () => {
    const state = applyInput(createState('hello'), 'hexxo');
    expect(state.keystrokes).toBe(5);
    expect(state.errorKeystrokes).toBe(2);
  });

  it('truncates typed text to the target length and ignores the overflow', () => {
    const state = applyInput(createState('hi'), 'hiya!');
    expect(state.typed).toBe('hi');
    expect(state.keystrokes).toBe(2);
    expect(state.errorKeystrokes).toBe(0);
  });

  it('does not mutate the previous state', () => {
    const before = createState('abc');
    applyInput(before, 'a');
    expect(before.typed).toBe('');
    expect(before.keystrokes).toBe(0);
  });
});

describe('appendTarget', () => {
  it('extends the target and keeps typed text and counters', () => {
    let state = applyInput(createState('ab'), 'ax');
    state = appendTarget(state, ' cd');
    expect(state.target).toBe('ab cd');
    expect(state.typed).toBe('ax');
    expect(state.keystrokes).toBe(2);
    expect(state.errorKeystrokes).toBe(1);
  });

  it('allows typing into the appended text', () => {
    let state = appendTarget(createState('ab'), 'cd');
    state = applyInput(state, 'abcd');
    expect(state.typed).toBe('abcd');
    expect(state.errorKeystrokes).toBe(0);
  });
});

describe('findFirstError', () => {
  it('returns the index of the first mismatch, or -1 when everything matches', () => {
    expect(findFirstError('', 'abc')).toBe(-1);
    expect(findFirstError('ab', 'abc')).toBe(-1);
    expect(findFirstError('axc', 'abc')).toBe(1);
    expect(findFirstError('xbx', 'abc')).toBe(0);
  });
});

describe('applyInput with stopOnError', () => {
  const stop = { stopOnError: true };

  it('behaves like normal typing while every character is right', () => {
    const state = applyInput(createState('hello'), 'hell', stop);
    expect(state.typed).toBe('hell');
    expect(state.keystrokes).toBe(4);
    expect(state.errorKeystrokes).toBe(0);
  });

  it('shows the wrong character and counts it as an error', () => {
    const state = applyInput(createState('hello'), 'hx', stop);
    expect(state.typed).toBe('hx');
    expect(state.keystrokes).toBe(2);
    expect(state.errorKeystrokes).toBe(1);
  });

  it('refuses everything typed after a wrong character, without counting it', () => {
    let state = applyInput(createState('hello'), 'hx', stop);
    state = applyInput(state, 'hxl', stop);
    state = applyInput(state, 'hxll', stop);
    expect(state.typed).toBe('hx');
    expect(state.keystrokes).toBe(2);
    expect(state.errorKeystrokes).toBe(1);
  });

  it('keeps only up to the first mistake when several characters arrive at once', () => {
    const state = applyInput(createState('hello'), 'hexlo', stop);
    expect(state.typed).toBe('hex');
    expect(state.keystrokes).toBe(3);
    expect(state.errorKeystrokes).toBe(1);
  });

  it('lets typing go on after the wrong character is deleted', () => {
    let state = applyInput(createState('hello'), 'hx', stop);
    state = applyInput(state, 'h', stop);
    state = applyInput(state, 'he', stop);
    expect(state.typed).toBe('he');
    // h, x, then the new e; the erased mistake stays in the count.
    expect(state.keystrokes).toBe(3);
    expect(state.errorKeystrokes).toBe(1);
  });

  it('does not change normal typing when the option is off', () => {
    let state = applyInput(createState('hello'), 'hx');
    state = applyInput(state, 'hxl');
    expect(state.typed).toBe('hxl');
    expect(applyInput(createState('hello'), 'hxl', { stopOnError: false }).typed).toBe('hxl');
  });
});

describe('getProgressLength', () => {
  it('is the typed length when stop-on-error is off', () => {
    const state = applyInput(createState('hello'), 'hello');
    expect(getProgressLength(state, false)).toBe(5);
    expect(getProgressLength(applyInput(createState('hello'), 'hellx'), false)).toBe(5);
  });

  it('does not count a wrong last character when stop-on-error is on', () => {
    const wrongEnd = applyInput(createState('hello'), 'hellx', { stopOnError: true });
    expect(wrongEnd.typed).toBe('hellx');
    expect(getProgressLength(wrongEnd, true)).toBe(4);
    const right = applyInput(createState('hello'), 'hello', { stopOnError: true });
    expect(getProgressLength(right, true)).toBe(5);
  });
});
