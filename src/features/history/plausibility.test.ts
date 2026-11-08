import { describe, expect, it } from 'vitest';
import {
  getPlausibilityLimit,
  isAutomatedBrowser,
  isPlausibleResult,
  MAX_PLAUSIBLE_WPM,
} from './plausibility';

describe('isPlausibleResult', () => {
  it('accepts an ordinary and a very fast human result', () => {
    expect(isPlausibleResult({ wpm: 0 })).toBe(true);
    expect(isPlausibleResult({ wpm: 45.5 })).toBe(true);
    expect(isPlausibleResult({ wpm: 212 })).toBe(true);
  });

  it('accepts exactly the limit and rejects anything above it', () => {
    expect(isPlausibleResult({ wpm: MAX_PLAUSIBLE_WPM })).toBe(true);
    expect(isPlausibleResult({ wpm: MAX_PLAUSIBLE_WPM + 0.1 })).toBe(false);
    expect(isPlausibleResult({ wpm: 6000 })).toBe(false);
  });

  it('rejects a number that is not a usable WPM', () => {
    expect(isPlausibleResult({ wpm: Number.NaN })).toBe(false);
    expect(isPlausibleResult({ wpm: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isPlausibleResult({ wpm: -1 })).toBe(false);
  });

  it('uses a limit given by the caller', () => {
    expect(isPlausibleResult({ wpm: 500 }, 1000)).toBe(true);
    expect(isPlausibleResult({ wpm: 500 }, 100)).toBe(false);
    expect(isPlausibleResult({ wpm: Number.NaN }, Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe('automation', () => {
  it('detects a browser driven by automation', () => {
    expect(isAutomatedBrowser({ webdriver: true })).toBe(true);
    expect(isAutomatedBrowser({ webdriver: false })).toBe(false);
    expect(isAutomatedBrowser({})).toBe(false);
    expect(isAutomatedBrowser(undefined)).toBe(false);
  });

  it('lifts the limit only in an automated browser', () => {
    expect(getPlausibilityLimit({ webdriver: true })).toBe(Number.POSITIVE_INFINITY);
    expect(getPlausibilityLimit({ webdriver: false })).toBe(MAX_PLAUSIBLE_WPM);
    expect(getPlausibilityLimit(undefined)).toBe(MAX_PLAUSIBLE_WPM);
  });
});
