import { describe, expect, it } from 'vitest';
import { TIME_DURATIONS } from '@/features/test-modes';
import {
  formatClock,
  getElapsedSeconds,
  getRemainingSeconds,
  getTimeBarFraction,
} from './clock';

describe('formatClock', () => {
  it('pads minutes and seconds to two digits', () => {
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(5)).toBe('00:05');
    expect(formatClock(30)).toBe('00:30');
    expect(formatClock(59)).toBe('00:59');
    expect(formatClock(60)).toBe('01:00');
    expect(formatClock(75)).toBe('01:15');
  });

  it('formats the four durations of the Time mode', () => {
    expect(TIME_DURATIONS.map(formatClock)).toEqual(['00:15', '00:30', '01:00', '02:00']);
  });

  it('does not cap the minutes', () => {
    expect(formatClock(3600)).toBe('60:00');
    expect(formatClock(6005)).toBe('100:05');
  });

  it('cuts fractions and shows 00:00 for negative or invalid values', () => {
    expect(formatClock(12.9)).toBe('00:12');
    expect(formatClock(-3)).toBe('00:00');
    expect(formatClock(Number.NaN)).toBe('00:00');
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('00:00');
  });
});

describe('getRemainingSeconds', () => {
  it('starts at the full duration and counts down', () => {
    expect(getRemainingSeconds(30, 0)).toBe(30);
    expect(getRemainingSeconds(30, 18_000)).toBe(12);
    expect(getRemainingSeconds(120, 1_000)).toBe(119);
  });

  it('rounds up, so a started second still shows', () => {
    expect(getRemainingSeconds(30, 1)).toBe(30);
    expect(getRemainingSeconds(30, 999)).toBe(30);
    expect(getRemainingSeconds(30, 1_001)).toBe(29);
    expect(getRemainingSeconds(30, 29_999)).toBe(1);
  });

  it('never goes below zero and ignores invalid input', () => {
    expect(getRemainingSeconds(30, 30_000)).toBe(0);
    expect(getRemainingSeconds(30, 45_000)).toBe(0);
    expect(getRemainingSeconds(Number.NaN, 0)).toBe(0);
    expect(getRemainingSeconds(30, Number.NaN)).toBe(0);
  });

  it('formats with formatClock', () => {
    expect(formatClock(getRemainingSeconds(60, 3_000))).toBe('00:57');
    expect(formatClock(getRemainingSeconds(120, 0))).toBe('02:00');
  });
});

describe('getElapsedSeconds', () => {
  it('cuts fractions of a second', () => {
    expect(getElapsedSeconds(0)).toBe(0);
    expect(getElapsedSeconds(999)).toBe(0);
    expect(getElapsedSeconds(1_000)).toBe(1);
    expect(getElapsedSeconds(61_500)).toBe(61);
  });

  it('never goes below zero and ignores invalid input', () => {
    expect(getElapsedSeconds(-5)).toBe(0);
    expect(getElapsedSeconds(Number.NaN)).toBe(0);
  });
});

describe('getTimeBarFraction', () => {
  it('is the share of time left', () => {
    expect(getTimeBarFraction(30, 30)).toBe(1);
    expect(getTimeBarFraction(30, 15)).toBe(0.5);
    expect(getTimeBarFraction(60, 0)).toBe(0);
  });

  it('stays between 0 and 1', () => {
    expect(getTimeBarFraction(30, -1)).toBe(0);
    expect(getTimeBarFraction(30, 45)).toBe(1);
  });

  it('gives 0 for invalid input or a duration of 0 or less', () => {
    expect(getTimeBarFraction(0, 10)).toBe(0);
    expect(getTimeBarFraction(-5, 10)).toBe(0);
    expect(getTimeBarFraction(Number.NaN, 10)).toBe(0);
    expect(getTimeBarFraction(30, Number.POSITIVE_INFINITY)).toBe(0);
  });
});
