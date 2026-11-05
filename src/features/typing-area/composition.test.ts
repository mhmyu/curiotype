import { describe, expect, it } from 'vitest';
import { isComposingKey, shouldDeferInput } from './composition';

describe('shouldDeferInput', () => {
  it('defers while a composition is open, whatever the event says', () => {
    expect(shouldDeferInput(true, { isComposing: false })).toBe(true);
    expect(shouldDeferInput(true, {})).toBe(true);
  });

  it('defers an input event that is flagged as composing', () => {
    expect(shouldDeferInput(false, { isComposing: true })).toBe(true);
  });

  it('lets an ordinary input event through', () => {
    expect(shouldDeferInput(false, { isComposing: false })).toBe(false);
    expect(shouldDeferInput(false, {})).toBe(false);
  });
});

describe('isComposingKey', () => {
  it('is true for a key that belongs to an input method', () => {
    expect(isComposingKey({ isComposing: true, keyCode: 27 })).toBe(true);
    expect(isComposingKey({ isComposing: false, keyCode: 229 })).toBe(true);
  });

  it('is false for an ordinary Escape or letter', () => {
    expect(isComposingKey({ isComposing: false, keyCode: 27 })).toBe(false);
    expect(isComposingKey({})).toBe(false);
  });
});
