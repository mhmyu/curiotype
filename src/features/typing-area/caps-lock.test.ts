import { describe, expect, it } from 'vitest';
import { isCapsLockOn } from './caps-lock';

describe('isCapsLockOn', () => {
  it('is true when the event reports Caps Lock', () => {
    expect(isCapsLockOn({ getModifierState: (key) => key === 'CapsLock' })).toBe(true);
  });

  it('is false when Caps Lock is off', () => {
    expect(isCapsLockOn({ getModifierState: () => false })).toBe(false);
  });

  it('asks only about CapsLock, not about other modifiers', () => {
    expect(isCapsLockOn({ getModifierState: (key) => key === 'Shift' })).toBe(false);
  });

  it('is false when the browser has no getModifierState', () => {
    expect(isCapsLockOn({})).toBe(false);
  });

  it('is false when getModifierState throws', () => {
    expect(
      isCapsLockOn({
        getModifierState: () => {
          throw new Error('unsupported');
        },
      }),
    ).toBe(false);
  });
});
