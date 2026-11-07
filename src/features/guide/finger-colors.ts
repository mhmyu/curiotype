import type { FingerNumber, Hand } from './keyboard-fingers';

/** The five color slots: `--finger-1` to `--finger-5` in `tokens.css`. */
export type ColorSlot = 1 | 2 | 3 | 4 | 5;

/**
 * Which color slot each finger uses, per hand. The left hand uses the slots in order (1 pinky ...
 * 5 thumb). The right hand uses the same five colors in a different order, shifted by two, so no
 * finger has the same color on both hands. That matters most in the middle of the keyboard, where
 * the two index fingers (G and H, T and Y) and the two thumbs (the two halves of the space bar)
 * meet: they must not have the same color.
 */
export const FINGER_COLOR_SLOT: Record<Hand, Record<FingerNumber, ColorSlot>> = {
  left: { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5 },
  right: { 1: 3, 2: 4, 3: 5, 4: 1, 5: 2 },
};

export function getColorSlot(hand: Hand, finger: FingerNumber): ColorSlot {
  return FINGER_COLOR_SLOT[hand][finger];
}

/**
 * Tailwind classes for each color slot, written out in full so Tailwind can see them. The same
 * color is used for the keys of the keyboard picture, the fingers of the hands and the swatches
 * in the table.
 */
export const SLOT_FILL_CLASS: Record<ColorSlot, string> = {
  1: 'fill-finger-1',
  2: 'fill-finger-2',
  3: 'fill-finger-3',
  4: 'fill-finger-4',
  5: 'fill-finger-5',
};

export const SLOT_BG_CLASS: Record<ColorSlot, string> = {
  1: 'bg-finger-1',
  2: 'bg-finger-2',
  3: 'bg-finger-3',
  4: 'bg-finger-4',
  5: 'bg-finger-5',
};

export function getFingerFillClass(hand: Hand, finger: FingerNumber): string {
  return SLOT_FILL_CLASS[getColorSlot(hand, finger)];
}

export function getFingerBgClass(hand: Hand, finger: FingerNumber): string {
  return SLOT_BG_CLASS[getColorSlot(hand, finger)];
}
