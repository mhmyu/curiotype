import { describe, expect, it } from 'vitest';
import { isAccentMerge, normalizeInput } from './accents';
import { applyInput, createState, findFirstError } from './engine';
import { tallyKeystrokes } from './key-stats';

// Written as escapes so this file cannot be rewritten to a different Unicode form by an editor.
const E_ACUTE = 'é'; // precomposed e with acute
const E_DECOMPOSED = 'é'; // e + combining acute
const N_TILDE = 'ñ';
const N_DECOMPOSED = 'ñ';
const U_DIAERESIS = 'ü';
const U_DECOMPOSED = 'ü';

describe('normalizeInput', () => {
  it('turns a base letter plus a combining mark into the precomposed letter', () => {
    expect(normalizeInput(E_DECOMPOSED)).toBe(E_ACUTE);
    expect(normalizeInput(`ma${N_DECOMPOSED}ana`)).toBe(`ma${N_TILDE}ana`);
    expect(normalizeInput(`pingu${U_DECOMPOSED}ino`)).toBe(`pingu${U_DIAERESIS}ino`);
  });

  it('leaves precomposed and plain ASCII text unchanged', () => {
    expect(normalizeInput(E_ACUTE)).toBe(E_ACUTE);
    expect(normalizeInput('plain text.')).toBe('plain text.');
    expect(normalizeInput('')).toBe('');
  });

  it('is idempotent', () => {
    const once = normalizeInput(`caf${E_DECOMPOSED}`);
    expect(normalizeInput(once)).toBe(once);
  });
});

describe('isAccentMerge', () => {
  it('is true when a combining mark turns the last letter into an accented one', () => {
    expect(isAccentMerge('caf', 'caf')).toBe(false);
    expect(isAccentMerge('cafe', `caf${E_ACUTE}`)).toBe(true);
    expect(isAccentMerge('man', `ma${N_TILDE}`)).toBe(true);
    expect(isAccentMerge('u', U_DIAERESIS)).toBe(true);
    expect(isAccentMerge('E', 'É')).toBe(true);
  });

  it('is false for a normal new character, a deletion or an unrelated replacement', () => {
    expect(isAccentMerge('ca', 'caf')).toBe(false);
    expect(isAccentMerge('caf', 'ca')).toBe(false);
    expect(isAccentMerge('cafe', 'cafx')).toBe(false);
    expect(isAccentMerge('', E_ACUTE)).toBe(false);
    // The text before the last letter changed: not a correction of the last keystroke.
    expect(isAccentMerge('xe', `y${E_ACUTE}`)).toBe(false);
    // Another base letter gained the accent (e is not the base of the new last letter).
    expect(isAccentMerge('a', E_ACUTE)).toBe(false);
  });
});

describe('applyInput with accented letters', () => {
  const target = `El agua está aquí.`; // El agua está aquí.

  it('treats the precomposed letter and the decomposed sequence as the same keystroke', () => {
    const composed = applyInput(createState(target), 'El agua está');
    const decomposed = applyInput(createState(target), 'El agua está');
    expect(decomposed.typed).toBe(composed.typed);
    expect(decomposed.keystrokes).toBe(composed.keystrokes);
    expect(decomposed.errorKeystrokes).toBe(0);
    expect(findFirstError(decomposed.typed, target)).toBe(-1);
  });

  it('keeps typed.length equal to the NFC length (no drift)', () => {
    const state = applyInput(createState(target), 'El agua está aquí');
    expect(state.typed).toBe('El agua está aquí');
    expect(state.typed.length).toBe(state.typed.normalize('NFC').length);
    expect(state.keystrokes).toBe(state.typed.length);
  });

  it('counts a missing accent as one error', () => {
    const state = applyInput(createState(target), 'El agua esta');
    expect(state.errorKeystrokes).toBe(1);
  });

  it('counts a wrong accent as one error', () => {
    const state = applyInput(createState(target), 'El agua està');
    expect(state.errorKeystrokes).toBe(1);
  });

  it('does not count a decomposed sequence that matches as an error', () => {
    // 6 characters + e, then the combining mark that completes the target letter.
    let state = applyInput(createState('café.'), 'cafe');
    state = applyInput(state, 'café');
    expect(state.typed).toBe('café');
    expect(state.keystrokes).toBe(4); // the mark is a correction, not a keystroke
    expect(state.errorKeystrokes).toBe(0);
  });

  it('counts the merge once however many times the same value arrives', () => {
    let state = applyInput(createState('café.'), 'cafe');
    state = applyInput(state, 'café');
    state = applyInput(state, 'café');
    state = applyInput(state, 'café');
    expect(state.keystrokes).toBe(4);
    expect(state.errorKeystrokes).toBe(0);
  });

  it('counts an unwanted accent on a letter that was right as an error', () => {
    let state = applyInput(createState('cafe.'), 'cafe');
    expect(state.errorKeystrokes).toBe(0);
    state = applyInput(state, 'café');
    expect(state.typed).toBe('café');
    expect(state.keystrokes).toBe(4);
    expect(state.errorKeystrokes).toBe(1);
  });

  it('keeps an erased accent mistake in the count, like any erased mistake', () => {
    let state = applyInput(createState('café.'), 'cafe'); // error counted
    state = applyInput(state, 'caf'); // erased
    state = applyInput(state, 'café'); // typed again, right
    expect(state.keystrokes).toBe(5);
    expect(state.errorKeystrokes).toBe(1);
  });

  it('works with stop-on-error: the bare letter stops, the mark completes it', () => {
    const stop = { stopOnError: true };
    let state = applyInput(createState('café.'), 'cafe', stop);
    expect(state.typed).toBe('cafe');
    expect(state.errorKeystrokes).toBe(1);
    state = applyInput(state, 'café', stop);
    expect(state.typed).toBe('café');
    expect(state.errorKeystrokes).toBe(0);
    state = applyInput(state, 'café.', stop);
    expect(state.typed).toBe('café.');
    expect(state.keystrokes).toBe(5);
  });

  it('truncates by NFC length, so a decomposed overflow is cut at the target length', () => {
    const state = applyInput(createState('sí'), 'sí y mas');
    expect(state.typed).toBe('sí');
    expect(state.keystrokes).toBe(2);
  });

  it('types a whole Spanish sentence in either form with identical results', () => {
    const sentence = 'La miel es naturalmente ácida y el niño la probó.';
    const decomposedValue = sentence.normalize('NFD');
    const a = applyInput(createState(sentence), sentence);
    const b = applyInput(createState(sentence), decomposedValue);
    expect(b.typed).toBe(a.typed);
    expect(b.keystrokes).toBe(a.keystrokes);
    expect(b.errorKeystrokes).toBe(0);
  });
});

describe('tallyKeystrokes with an accent merge', () => {
  const target = 'café.';

  it('moves the error away from the key when the mark makes the letter right', () => {
    let tally = tallyKeystrokes({}, target, 0, 'cafe', '');
    expect(tally[E_ACUTE]).toEqual({ attempts: 1, errors: 1 });
    tally = tallyKeystrokes(tally, target, 4, 'café', 'cafe');
    expect(tally[E_ACUTE]).toEqual({ attempts: 1, errors: 0 });
  });

  it('adds an error when the mark makes a right letter wrong', () => {
    let tally = tallyKeystrokes({}, 'cafe.', 0, 'cafe', '');
    tally = tallyKeystrokes(tally, 'cafe.', 4, 'café', 'cafe');
    expect(tally['e']).toEqual({ attempts: 1, errors: 1 });
  });

  it('is unchanged for normal typing and when previousTyped is not given', () => {
    const base = tallyKeystrokes({}, target, 0, 'caf');
    expect(tallyKeystrokes(base, target, 3, 'caf', 'caf')).toBe(base);
    expect(tallyKeystrokes(base, target, 3, 'café').caf).toBeUndefined();
    expect(tallyKeystrokes(base, target, 3, 'café')[E_ACUTE]).toEqual({
      attempts: 1,
      errors: 0,
    });
  });
});
