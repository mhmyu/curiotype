import { describe, expect, it } from 'vitest';
import {
  BACK_TO_TOP_SHOW_AFTER,
  RING_CIRCUMFERENCE,
  getRingDashOffset,
  getScrollProgress,
  isBackToTopVisible,
} from './scroll-progress';

describe('getScrollProgress', () => {
  it('is 0 at the top, 0.5 in the middle and 1 at the bottom', () => {
    expect(getScrollProgress(0, 2000, 1000)).toBe(0);
    expect(getScrollProgress(500, 2000, 1000)).toBe(0.5);
    expect(getScrollProgress(1000, 2000, 1000)).toBe(1);
  });

  it('stays within 0 and 1 (overscroll on iOS can go past both ends)', () => {
    expect(getScrollProgress(-40, 2000, 1000)).toBe(0);
    expect(getScrollProgress(1200, 2000, 1000)).toBe(1);
  });

  it('is 0 for a page that does not scroll and for bad numbers', () => {
    expect(getScrollProgress(0, 800, 1000)).toBe(0);
    expect(getScrollProgress(0, 1000, 1000)).toBe(0);
    expect(getScrollProgress(Number.NaN, 2000, 1000)).toBe(0);
  });
});

describe('isBackToTopVisible', () => {
  it('is hidden at the top and until the threshold, visible after it', () => {
    expect(isBackToTopVisible(0)).toBe(false);
    expect(isBackToTopVisible(BACK_TO_TOP_SHOW_AFTER)).toBe(false);
    expect(isBackToTopVisible(BACK_TO_TOP_SHOW_AFTER + 1)).toBe(true);
  });
});

describe('getRingDashOffset', () => {
  it('draws nothing at 0, everything at 1 and half at 0.5', () => {
    expect(getRingDashOffset(0)).toBeCloseTo(RING_CIRCUMFERENCE);
    expect(getRingDashOffset(0.5)).toBeCloseTo(RING_CIRCUMFERENCE / 2);
    expect(getRingDashOffset(1)).toBe(0);
  });

  it('clamps out-of-range and invalid progress', () => {
    expect(getRingDashOffset(2)).toBe(0);
    expect(getRingDashOffset(-1)).toBeCloseTo(RING_CIRCUMFERENCE);
    expect(getRingDashOffset(Number.NaN)).toBeCloseTo(RING_CIRCUMFERENCE);
  });
});
