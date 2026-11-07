import type { FingerNumber, Hand } from './keyboard-fingers';

/**
 * Geometry of the two hands of the guide picture, seen from above (the back of the hand, fingers
 * pointing up, as you see your own hands on a keyboard). Pure numbers, no DOM: the component only
 * draws them, and the tests check the shape (middle finger longest, thumbs on the inner side,
 * the right hand a mirror of the left).
 *
 * Each hand is drawn in its own box of HAND_WIDTH x HAND_HEIGHT units.
 */
export const HAND_WIDTH = 250;
export const HAND_HEIGHT = 276;
/** Space between the two hands when they are drawn side by side. */
export const HANDS_GAP = 20;

export interface FingerShape {
  hand: Hand;
  finger: FingerNumber;
  /** Rounded rectangle of the finger; the thumb is rotated by `rotate` around (`pivotX`, `pivotY`). */
  x: number;
  y: number;
  width: number;
  height: number;
  rotate: number;
  pivotX: number;
  pivotY: number;
  /** Where the finger number is printed. */
  labelX: number;
  labelY: number;
}

export interface HandShape {
  hand: Hand;
  fingers: FingerShape[];
  /** Outline of the palm. */
  palmPath: string;
  /** Where the hand letter (for example "L") is printed, on the palm. */
  letterX: number;
  letterY: number;
}

const FINGER_WIDTH = 28;
/** Fingers reach down to here; the palm is drawn over their lower part. */
const FINGER_BASE = 168;

/** Left hand: x of the finger centers and the top of each finger (pinky, ring, middle, index). */
const LEFT_FINGERS: readonly { finger: FingerNumber; cx: number; top: number }[] = [
  { finger: 1, cx: 56, top: 86 },
  { finger: 2, cx: 90, top: 54 },
  { finger: 3, cx: 124, top: 38 },
  { finger: 4, cx: 158, top: 56 },
];

const PALM_LEFT = 44;
const PALM_RIGHT = 172;
const THUMB_PIVOT = { x: 172, y: 228 };
const THUMB_LENGTH = 92;
const THUMB_ANGLE = 32;

function mirrorX(x: number): number {
  return HAND_WIDTH - x;
}

function buildHand(hand: Hand): HandShape {
  const right = hand === 'right';
  const fingers: FingerShape[] = LEFT_FINGERS.map(({ finger, cx, top }) => {
    const centerX = right ? mirrorX(cx) : cx;
    return {
      hand,
      finger,
      x: centerX - FINGER_WIDTH / 2,
      y: top,
      width: FINGER_WIDTH,
      height: FINGER_BASE - top,
      rotate: 0,
      pivotX: centerX,
      pivotY: top,
      labelX: centerX,
      labelY: top + 30,
    };
  });

  // The thumb leans outward from the lower side of the palm, on the side of the index finger.
  const pivotX = right ? mirrorX(THUMB_PIVOT.x) : THUMB_PIVOT.x;
  const angle = right ? -THUMB_ANGLE : THUMB_ANGLE;
  const radians = (angle * Math.PI) / 180;
  const labelDistance = 60;
  fingers.push({
    hand,
    finger: 5,
    x: pivotX - FINGER_WIDTH / 2,
    y: THUMB_PIVOT.y - THUMB_LENGTH,
    width: FINGER_WIDTH,
    height: THUMB_LENGTH + 12,
    rotate: angle,
    pivotX,
    pivotY: THUMB_PIVOT.y,
    labelX: Math.round((pivotX + labelDistance * Math.sin(radians)) * 10) / 10,
    labelY: Math.round((THUMB_PIVOT.y - labelDistance * Math.cos(radians) + 8) * 10) / 10,
  });

  const left = right ? mirrorX(PALM_RIGHT) : PALM_LEFT;
  const rightEdge = right ? mirrorX(PALM_LEFT) : PALM_RIGHT;
  const palmPath =
    `M${left} 152H${rightEdge}V222Q${rightEdge} 266 ${rightEdge - 42} 268H${left + 42}Q${left} 266 ${left} 222Z`;

  return {
    hand,
    fingers: fingers.sort((a, b) => a.finger - b.finger),
    palmPath,
    letterX: (left + rightEdge) / 2,
    letterY: 232,
  };
}

export const HAND_SHAPES: Record<Hand, HandShape> = {
  left: buildHand('left'),
  right: buildHand('right'),
};

/** Total width of the picture with both hands side by side. */
export const HANDS_TOTAL_WIDTH = HAND_WIDTH * 2 + HANDS_GAP;
