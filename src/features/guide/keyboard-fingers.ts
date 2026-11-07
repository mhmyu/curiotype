/**
 * Which finger presses which key on a standard (ANSI, QWERTY) keyboard, with the geometry the
 * guide diagram needs. Pure data and small functions, no DOM: the diagram component and the
 * text table both read from here, so they can never disagree.
 *
 * Positions are in key units: 1 = the width of a letter key. Rows are staggered like a real
 * keyboard. Every row except the space row is exactly `KEYBOARD_WIDTH` units wide.
 */

export type Hand = 'left' | 'right';
/** 1 = pinky, 2 = ring finger, 3 = middle finger, 4 = index finger, 5 = thumb. */
export type FingerNumber = 1 | 2 | 3 | 4 | 5;

export interface Finger {
  hand: Hand;
  finger: FingerNumber;
}

export interface KeyboardKey extends Finger {
  /** Stable id, used as the SVG key. */
  id: string;
  /** What is printed on the key (letters in upper case). */
  label: string;
  /** Row from the top: 0 = numbers, 1 = QWERTY row, 2 = home row, 3 = bottom row, 4 = space row. */
  row: number;
  /** Left edge and width, in key units. */
  x: number;
  width: number;
  /** True for the eight keys where the fingers rest (A S D F, J K L ;). */
  home: boolean;
  /** True for the two keys with a bump you can feel (F and J). */
  bump: boolean;
  /** True for keys printed as a word or a symbol instead of a single character. */
  special: boolean;
}

export const KEYBOARD_WIDTH = 15;
export const KEYBOARD_ROWS = 5;
export const FINGER_NUMBERS: readonly FingerNumber[] = [1, 2, 3, 4, 5];
export const HANDS: readonly Hand[] = ['left', 'right'];

/** The keys of the home row, left to right. */
export const HOME_ROW_KEYS = ['a', 's', 'd', 'f', 'j', 'k', 'l', ';'] as const;
/** The keys that carry a bump. */
export const BUMP_KEYS = ['f', 'j'] as const;

/** Space bar: starts at 3.75 and is 6.25 units wide; each thumb owns one half. */
const SPACE_X = 3.75;
const SPACE_WIDTH = 6.25;

/** Finger of each single-character key. */
const FINGER_OF: Record<string, Finger> = {};
function assign(hand: Hand, finger: FingerNumber, keys: string): void {
  for (const key of keys) FINGER_OF[key] = { hand, finger };
}
assign('left', 1, '`1qaz');
assign('left', 2, '2wsx');
assign('left', 3, '3edc');
assign('left', 4, '45rtfgvb');
assign('right', 4, '67yuhjnm');
assign('right', 3, '8ik,');
assign('right', 2, '9ol.');
assign('right', 1, "0-=p[]\\;'/");

interface RowSpec {
  /** Keys before the first single-character key: a wide key and its finger. */
  start?: { label: string; width: number; id: string; hand: Hand };
  /** Left edge of the first single-character key. */
  x: number;
  chars: string;
  end?: { label: string; width: number; id: string; hand: Hand; special?: boolean };
}

const ROWS: readonly RowSpec[] = [
  {
    start: undefined,
    x: 0,
    chars: '`1234567890-=',
    end: { label: 'Backspace', width: 2, id: 'backspace', hand: 'right' },
  },
  {
    start: { label: 'Tab', width: 1.5, id: 'tab', hand: 'left' },
    x: 1.5,
    chars: 'qwertyuiop[]',
    // The backslash key is wider than a letter key but still a single character.
    end: { label: '\\', width: 1.5, id: 'key-\\', hand: 'right', special: false },
  },
  {
    start: { label: 'Caps', width: 1.75, id: 'caps', hand: 'left' },
    x: 1.75,
    chars: "asdfghjkl;'",
    end: { label: 'Enter', width: 2.25, id: 'enter', hand: 'right' },
  },
  {
    start: { label: 'Shift', width: 2.25, id: 'shift-left', hand: 'left' },
    x: 2.25,
    chars: 'zxcvbnm,./',
    end: { label: 'Shift', width: 2.75, id: 'shift-right', hand: 'right' },
  },
];

function buildKeys(): KeyboardKey[] {
  const keys: KeyboardKey[] = [];
  ROWS.forEach((spec, row) => {
    if (spec.start) {
      keys.push({
        id: spec.start.id,
        label: spec.start.label,
        row,
        x: 0,
        width: spec.start.width,
        hand: spec.start.hand,
        finger: 1,
        home: false,
        bump: false,
        special: true,
      });
    }
    let x = spec.x;
    for (const char of spec.chars) {
      const owner = FINGER_OF[char];
      if (!owner) throw new Error(`No finger for key "${char}"`);
      keys.push({
        id: `key-${char}`,
        label: char.toUpperCase(),
        row,
        x,
        width: 1,
        hand: owner.hand,
        finger: owner.finger,
        home: (HOME_ROW_KEYS as readonly string[]).includes(char),
        bump: (BUMP_KEYS as readonly string[]).includes(char),
        special: false,
      });
      x += 1;
    }
    // The last single-character key ends at x; the wide key on the right starts there.
    if (spec.end) {
      keys.push({
        id: spec.end.id,
        label: spec.end.label,
        row,
        x,
        width: spec.end.width,
        hand: spec.end.hand,
        finger: 1,
        home: false,
        bump: false,
        special: spec.end.special ?? true,
      });
    }
  });

  // The space row: one half per thumb.
  const half = SPACE_WIDTH / 2;
  keys.push(
    {
      id: 'space-left',
      label: 'Space',
      row: 4,
      x: SPACE_X,
      width: half,
      hand: 'left',
      finger: 5,
      home: false,
      bump: false,
      special: true,
    },
    {
      id: 'space-right',
      label: 'Space',
      row: 4,
      x: SPACE_X + half,
      width: half,
      hand: 'right',
      finger: 5,
      home: false,
      bump: false,
      special: true,
    },
  );
  return keys;
}

/** Every key of the diagram, row by row, left to right. */
export const KEYBOARD_KEYS: readonly KeyboardKey[] = buildKeys();

/** The keys one finger presses, in keyboard order (top row first, left to right). */
export function keysForFinger(hand: Hand, finger: FingerNumber): KeyboardKey[] {
  return KEYBOARD_KEYS.filter((key) => key.hand === hand && key.finger === finger);
}

/** The keys one hand presses. */
export function keysForHand(hand: Hand): KeyboardKey[] {
  return KEYBOARD_KEYS.filter((key) => key.hand === hand);
}

/** The finger for a character, or `undefined` if the diagram does not have that key. */
export function fingerForChar(char: string): Finger | undefined {
  return FINGER_OF[char.toLowerCase()];
}

/**
 * Horizontal extent of the keys of one hand, in key units. The narrow view of the diagram shows one
 * hand at a time and crops to this range.
 */
export function getHandExtent(hand: Hand): { min: number; max: number } {
  const keys = keysForHand(hand);
  return {
    min: Math.min(...keys.map((key) => key.x)),
    max: Math.max(...keys.map((key) => key.x + key.width)),
  };
}

/** The zone shade of a key: fingers alternate between two shades so neighbouring zones differ. */
export function getZoneShade(finger: FingerNumber): 'a' | 'b' {
  return finger === 1 || finger === 3 || finger === 5 ? 'a' : 'b';
}
