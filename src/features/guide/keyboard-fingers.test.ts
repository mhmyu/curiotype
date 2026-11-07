import { describe, expect, it } from 'vitest';
import {
  BUMP_KEYS,
  FINGER_NUMBERS,
  HANDS,
  HOME_ROW_KEYS,
  KEYBOARD_KEYS,
  KEYBOARD_ROWS,
  KEYBOARD_WIDTH,
  fingerForChar,
  getHandExtent,
  getZoneShade,
  keysForFinger,
  keysForHand,
} from './keyboard-fingers';

describe('keyboard keys', () => {
  it('has every letter and digit exactly once', () => {
    for (const char of 'abcdefghijklmnopqrstuvwxyz0123456789') {
      const matches = KEYBOARD_KEYS.filter((key) => key.id === `key-${char}`);
      expect(matches, char).toHaveLength(1);
    }
  });

  it('has unique ids', () => {
    const ids = KEYBOARD_KEYS.map((key) => key.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fills the first four rows exactly to the keyboard width', () => {
    for (let row = 0; row < KEYBOARD_ROWS - 1; row++) {
      const keys = KEYBOARD_KEYS.filter((key) => key.row === row);
      const end = Math.max(...keys.map((key) => key.x + key.width));
      expect(end, `row ${row}`).toBe(KEYBOARD_WIDTH);
    }
  });

  it('has no gap or overlap inside a row', () => {
    for (let row = 0; row < KEYBOARD_ROWS - 1; row++) {
      const keys = KEYBOARD_KEYS.filter((key) => key.row === row).sort((a, b) => a.x - b.x);
      expect(keys[0]!.x, `row ${row} starts at the left edge`).toBe(0);
      for (let index = 1; index < keys.length; index++) {
        const previous = keys[index - 1]!;
        expect(keys[index]!.x, `row ${row}, key ${keys[index]!.id}`).toBe(previous.x + previous.width);
      }
    }
  });

  it('keeps the space bar between the two thumbs', () => {
    const left = KEYBOARD_KEYS.find((key) => key.id === 'space-left')!;
    const right = KEYBOARD_KEYS.find((key) => key.id === 'space-right')!;
    expect(left).toMatchObject({ hand: 'left', finger: 5, row: 4 });
    expect(right).toMatchObject({ hand: 'right', finger: 5, row: 4 });
    expect(left.x + left.width).toBe(right.x);
  });
});

describe('fingers', () => {
  it('uses the standard home row: A S D F on the left, J K L ; on the right', () => {
    const home = (hand: 'left' | 'right') =>
      KEYBOARD_KEYS.filter((key) => key.home && key.hand === hand)
        .map((key) => ({ label: key.label, finger: key.finger }))
        .sort((a, b) => a.finger - b.finger);
    expect(home('left')).toEqual([
      { label: 'A', finger: 1 },
      { label: 'S', finger: 2 },
      { label: 'D', finger: 3 },
      { label: 'F', finger: 4 },
    ]);
    expect(home('right')).toEqual([
      { label: ';', finger: 1 },
      { label: 'L', finger: 2 },
      { label: 'K', finger: 3 },
      { label: 'J', finger: 4 },
    ]);
    expect(HOME_ROW_KEYS).toHaveLength(8);
  });

  it('puts the bumps on F and J, the two index fingers', () => {
    const bumps = KEYBOARD_KEYS.filter((key) => key.bump).map((key) => key.label);
    expect(bumps.sort()).toEqual(['F', 'J']);
    expect(BUMP_KEYS).toHaveLength(2);
    expect(fingerForChar('f')).toEqual({ hand: 'left', finger: 4 });
    expect(fingerForChar('j')).toEqual({ hand: 'right', finger: 4 });
  });

  it('gives each hand the right side of the keyboard', () => {
    // The index fingers reach two columns each: T and G and B, Y and H and N.
    expect(fingerForChar('t')).toEqual({ hand: 'left', finger: 4 });
    expect(fingerForChar('b')).toEqual({ hand: 'left', finger: 4 });
    expect(fingerForChar('y')).toEqual({ hand: 'right', finger: 4 });
    expect(fingerForChar('n')).toEqual({ hand: 'right', finger: 4 });
    expect(fingerForChar('5')).toEqual({ hand: 'left', finger: 4 });
    expect(fingerForChar('6')).toEqual({ hand: 'right', finger: 4 });
  });

  it('sends the pinkies to the edges: punctuation, Shift, Enter, Backspace', () => {
    for (const char of ";'/[]-=0p") expect(fingerForChar(char), char).toEqual({ hand: 'right', finger: 1 });
    for (const char of '`1qaz') expect(fingerForChar(char), char).toEqual({ hand: 'left', finger: 1 });
    for (const id of ['backspace', 'enter', 'shift-right']) {
      expect(KEYBOARD_KEYS.find((key) => key.id === id)).toMatchObject({ hand: 'right', finger: 1 });
    }
    for (const id of ['tab', 'caps', 'shift-left']) {
      expect(KEYBOARD_KEYS.find((key) => key.id === id)).toMatchObject({ hand: 'left', finger: 1 });
    }
  });

  it('keeps a column on one finger: the key above or below is on the same finger', () => {
    for (const column of ['qaz', 'wsx', 'edc', 'ik,', 'ol.']) {
      const fingers = [...column].map((char) => JSON.stringify(fingerForChar(char)));
      expect(new Set(fingers).size, column).toBe(1);
    }
  });

  it('does not know keys that are not on the diagram', () => {
    expect(fingerForChar('é')).toBeUndefined();
    expect(fingerForChar('')).toBeUndefined();
  });

  it('is case-insensitive for letters', () => {
    expect(fingerForChar('A')).toEqual(fingerForChar('a'));
  });

  it('lists the keys of a finger in keyboard order', () => {
    expect(keysForFinger('left', 4).map((key) => key.label)).toEqual(['4', '5', 'R', 'T', 'F', 'G', 'V', 'B']);
    expect(keysForFinger('right', 3).map((key) => key.label)).toEqual(['8', 'I', 'K', ',']);
    expect(keysForFinger('left', 5).map((key) => key.label)).toEqual(['Space']);
  });

  it('gives every finger of both hands at least one key', () => {
    for (const hand of HANDS) {
      for (const finger of FINGER_NUMBERS) {
        expect(keysForFinger(hand, finger).length, `${hand} ${finger}`).toBeGreaterThan(0);
      }
    }
  });

  it('splits the keyboard between the hands without leaving a key out', () => {
    expect(keysForHand('left').length + keysForHand('right').length).toBe(KEYBOARD_KEYS.length);
  });
});

describe('hand extent and zone shades', () => {
  it('covers each hand and starts the right hand where the left hand ends, roughly', () => {
    const left = getHandExtent('left');
    const right = getHandExtent('right');
    expect(left.min).toBe(0);
    expect(right.max).toBe(KEYBOARD_WIDTH);
    // The rows are staggered, so the ranges overlap a little but never swap sides.
    expect(left.max).toBeLessThan(right.max);
    expect(right.min).toBeGreaterThan(left.min);
    expect(left.max - right.min).toBeLessThan(2);
  });

  it('gives neighbouring fingers different shades', () => {
    expect(getZoneShade(1)).not.toBe(getZoneShade(2));
    expect(getZoneShade(2)).not.toBe(getZoneShade(3));
    expect(getZoneShade(3)).not.toBe(getZoneShade(4));
  });
});

describe('the backslash key', () => {
  it('is one character wide in the label and 1.5 units wide on the keyboard', () => {
    const key = KEYBOARD_KEYS.find((candidate) => candidate.id === 'key-\\')!;
    expect(key.label).toBe('\\');
    expect(key.width).toBe(1.5);
    expect(key.special).toBe(false);
    expect(fingerForChar('\\')).toEqual({ hand: 'right', finger: 1 });
  });
});
