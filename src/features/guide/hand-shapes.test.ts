import { describe, expect, it } from 'vitest';
import { HAND_HEIGHT, HAND_SHAPES, HAND_WIDTH } from './hand-shapes';
import { FINGER_NUMBERS, HANDS } from './keyboard-fingers';

const finger = (hand: 'left' | 'right', n: 1 | 2 | 3 | 4 | 5) => HAND_SHAPES[hand].fingers.find((f) => f.finger === n)!;
const centerX = (f: { x: number; width: number }) => f.x + f.width / 2;

describe.each(HANDS)('%s hand', (hand) => {
  it('has the five fingers, numbered 1 to 5, each once', () => {
    expect(HAND_SHAPES[hand].fingers.map((f) => f.finger)).toEqual([...FINGER_NUMBERS]);
  });

  it('has the middle finger longest and the pinky shortest of the four fingers', () => {
    const top = (n: 1 | 2 | 3 | 4) => finger(hand, n).y;
    expect(top(3)).toBeLessThan(top(2));
    expect(top(3)).toBeLessThan(top(4));
    expect(top(1)).toBeGreaterThan(top(2));
    expect(top(1)).toBeGreaterThan(top(4));
  });

  it('keeps every label inside the box of the hand', () => {
    for (const f of HAND_SHAPES[hand].fingers) {
      expect(f.labelX).toBeGreaterThan(0);
      expect(f.labelX).toBeLessThan(HAND_WIDTH);
      expect(f.labelY).toBeGreaterThan(0);
      expect(f.labelY).toBeLessThan(HAND_HEIGHT);
    }
  });
});

describe('the two hands', () => {
  it('put the pinky on the outside: left of the ring finger on the left hand, right of it on the right hand', () => {
    expect(centerX(finger('left', 1))).toBeLessThan(centerX(finger('left', 4)));
    expect(centerX(finger('right', 1))).toBeGreaterThan(centerX(finger('right', 4)));
  });

  it('put the thumbs on the inner side, leaning toward each other', () => {
    expect(centerX(finger('left', 5))).toBeGreaterThan(centerX(finger('left', 4)));
    expect(centerX(finger('right', 5))).toBeLessThan(centerX(finger('right', 4)));
    expect(finger('left', 5).rotate).toBeGreaterThan(0);
    expect(finger('right', 5).rotate).toBe(-finger('left', 5).rotate);
  });

  it('are mirror images: label positions add up to the width of the box', () => {
    for (const n of FINGER_NUMBERS) {
      expect(finger('left', n).labelX + finger('right', n).labelX).toBeCloseTo(HAND_WIDTH, 1);
      expect(finger('left', n).labelY).toBe(finger('right', n).labelY);
    }
  });
});
