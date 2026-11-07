import { describe, expect, it } from 'vitest';
import {
  FINGER_COLOR_SLOT,
  SLOT_BG_CLASS,
  SLOT_FILL_CLASS,
  getColorSlot,
  getFingerBgClass,
  getFingerFillClass,
} from './finger-colors';
import { FINGER_NUMBERS, HANDS, KEYBOARD_KEYS } from './keyboard-fingers';

describe('color slots', () => {
  it('each hand uses all five colors, once each', () => {
    for (const hand of HANDS) {
      const slots = FINGER_NUMBERS.map((finger) => getColorSlot(hand, finger));
      expect([...slots].sort()).toEqual([1, 2, 3, 4, 5]);
    }
  });

  it('gives no finger the same color on both hands', () => {
    for (const finger of FINGER_NUMBERS) {
      expect(FINGER_COLOR_SLOT.left[finger], `finger ${finger}`).not.toBe(FINGER_COLOR_SLOT.right[finger]);
    }
  });

  it('keeps the left hand in order (1 pinky ... 5 thumb), so the first color is the left pinky', () => {
    expect(FINGER_NUMBERS.map((finger) => FINGER_COLOR_SLOT.left[finger])).toEqual([1, 2, 3, 4, 5]);
  });

  it('has a fill class and a background class per slot, all different, with the token number in the name', () => {
    expect(new Set(Object.values(SLOT_FILL_CLASS)).size).toBe(5);
    expect(new Set(Object.values(SLOT_BG_CLASS)).size).toBe(5);
    for (const finger of FINGER_NUMBERS) {
      for (const hand of HANDS) {
        const slot = getColorSlot(hand, finger);
        expect(getFingerFillClass(hand, finger)).toBe(`fill-finger-${slot}`);
        expect(getFingerBgClass(hand, finger)).toBe(`bg-finger-${slot}`);
      }
    }
  });
});

describe('colors on the keyboard', () => {
  const rows = [...new Set(KEYBOARD_KEYS.map((key) => key.row))];

  it('never gives two neighbouring keys of different fingers the same color', () => {
    for (const row of rows) {
      const keys = KEYBOARD_KEYS.filter((key) => key.row === row).sort((a, b) => a.x - b.x);
      for (let i = 1; i < keys.length; i += 1) {
        const [before, after] = [keys[i - 1]!, keys[i]!];
        if (before.hand === after.hand && before.finger === after.finger) continue;
        expect(
          getColorSlot(before.hand, before.finger),
          `${before.label} and ${after.label} in row ${row}`,
        ).not.toBe(getColorSlot(after.hand, after.finger));
      }
    }
  });

  it('gives the keys that meet in the middle of every row different colors (the point of the shift)', () => {
    for (const row of rows) {
      const left = KEYBOARD_KEYS.filter((key) => key.row === row && key.hand === 'left');
      const right = KEYBOARD_KEYS.filter((key) => key.row === row && key.hand === 'right');
      const lastLeft = left.reduce((a, b) => (b.x > a.x ? b : a));
      const firstRight = right.reduce((a, b) => (b.x < a.x ? b : a));
      expect(getColorSlot(lastLeft.hand, lastLeft.finger), `row ${row}`).not.toBe(
        getColorSlot(firstRight.hand, firstRight.finger),
      );
    }
  });
});
