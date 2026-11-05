import { describe, expect, it } from 'vitest';
import { createMemoryStorage } from '@/lib/storage/memory-adapter';
import {
  EMPTY_STREAK,
  MAX_STREAK_COUNT,
  STREAK_KEY,
  advanceStreak,
  daysBetween,
  getGoalProgress,
  getStreakView,
  loadStreak,
  mergeStreaks,
  parseStreak,
  recordActivity,
  toDayKey,
  type Streak,
} from './streak';

function streak(overrides: Partial<Streak> = {}): Streak {
  return { lastDay: '2026-11-01', current: 3, best: 5, todayCount: 2, ...overrides };
}

describe('toDayKey', () => {
  it('uses the local calendar day with zero padding', () => {
    expect(toDayKey(new Date(2026, 0, 5, 23, 59, 59))).toBe('2026-01-05');
    expect(toDayKey(new Date(2026, 10, 1, 0, 0, 0))).toBe('2026-11-01');
    expect(toDayKey(new Date(2026, 11, 31, 12))).toBe('2026-12-31');
  });
});

describe('daysBetween', () => {
  it('counts whole days across months, years and leap days', () => {
    expect(daysBetween('2026-11-01', '2026-11-02')).toBe(1);
    expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1);
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1);
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2);
    expect(daysBetween('2027-02-28', '2027-03-01')).toBe(1);
    expect(daysBetween('2026-11-05', '2026-11-01')).toBe(-4);
    expect(daysBetween('2026-11-01', '2026-11-01')).toBe(0);
  });

  it('is not shifted by daylight saving changes', () => {
    expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
    expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
  });

  it('returns null for text that is not a real day', () => {
    for (const bad of ['', '2026-13-01', '2026-02-30', '2026-1-1', 'yesterday']) {
      expect(daysBetween(bad, '2026-11-01'), bad).toBeNull();
      expect(daysBetween('2026-11-01', bad), bad).toBeNull();
    }
  });
});

describe('advanceStreak', () => {
  it('starts a streak with the first test ever', () => {
    expect(advanceStreak({ ...EMPTY_STREAK }, '2026-11-01')).toEqual({
      lastDay: '2026-11-01',
      current: 1,
      best: 1,
      todayCount: 1,
    });
  });

  it('counts more tests on the same day without changing the streak', () => {
    expect(advanceStreak(streak(), '2026-11-01')).toEqual(streak({ todayCount: 3 }));
  });

  it('continues the streak on the next day and resets the day count', () => {
    expect(advanceStreak(streak(), '2026-11-02')).toEqual({
      lastDay: '2026-11-02',
      current: 4,
      best: 5,
      todayCount: 1,
    });
  });

  it('raises best when the streak passes it', () => {
    expect(advanceStreak(streak({ current: 5, best: 5 }), '2026-11-02')).toMatchObject({ current: 6, best: 6 });
  });

  it('continues across a month and a year boundary', () => {
    expect(advanceStreak(streak({ lastDay: '2026-10-31' }), '2026-11-01')).toMatchObject({ current: 4 });
    expect(advanceStreak(streak({ lastDay: '2026-12-31' }), '2027-01-01')).toMatchObject({ current: 4 });
  });

  it('starts over after a skipped day but keeps best', () => {
    expect(advanceStreak(streak(), '2026-11-03')).toEqual({
      lastDay: '2026-11-03',
      current: 1,
      best: 5,
      todayCount: 1,
    });
  });

  it('treats a clock that went backwards like the same day and keeps the stored day', () => {
    expect(advanceStreak(streak(), '2026-10-30')).toEqual(streak({ todayCount: 3 }));
  });

  it('does not grow past the counter limit', () => {
    const full = streak({ current: MAX_STREAK_COUNT, best: MAX_STREAK_COUNT, todayCount: MAX_STREAK_COUNT });
    expect(advanceStreak(full, '2026-11-01').todayCount).toBe(MAX_STREAK_COUNT);
    expect(advanceStreak(full, '2026-11-02').current).toBe(MAX_STREAK_COUNT);
  });

  it('does not change its input', () => {
    const before = streak();
    advanceStreak(before, '2026-11-02');
    expect(before).toEqual(streak());
  });
});

describe('getStreakView', () => {
  it('shows the streak and the day count on the day of the latest test', () => {
    expect(getStreakView(streak(), '2026-11-01')).toEqual({ current: 3, todayCount: 2 });
  });

  it('keeps the streak alive the day after, with no tests yet today', () => {
    expect(getStreakView(streak(), '2026-11-02')).toEqual({ current: 3, todayCount: 0 });
  });

  it('shows no streak once a whole day was skipped', () => {
    expect(getStreakView(streak(), '2026-11-03')).toEqual({ current: 0, todayCount: 0 });
    expect(getStreakView(streak(), '2027-05-01')).toEqual({ current: 0, todayCount: 0 });
  });

  it('shows nothing when no test was recorded', () => {
    expect(getStreakView({ ...EMPTY_STREAK }, '2026-11-01')).toEqual({ current: 0, todayCount: 0 });
  });

  it('keeps the streak (without a day count) when the clock went backwards', () => {
    expect(getStreakView(streak(), '2026-10-30')).toEqual({ current: 3, todayCount: 0 });
  });
});

describe('parseStreak', () => {
  it('accepts a consistent streak and the empty state', () => {
    expect(parseStreak(streak())).toEqual(streak());
    expect(parseStreak({ ...EMPTY_STREAK })).toEqual(EMPTY_STREAK);
  });

  it.each([
    ['null', null],
    ['an array', []],
    ['a string', 'x'],
    ['a missing field', { lastDay: '2026-11-01', current: 1, best: 1 }],
    ['an extra field', { ...streak(), extra: 1 }],
    ['a bad day', streak({ lastDay: '2026-02-30' })],
    ['a day that is not text', { ...streak(), lastDay: 20261101 }],
    ['current of zero with a day', streak({ current: 0 })],
    ['a day count of zero with a day', streak({ todayCount: 0 })],
    ['best below current', streak({ current: 4, best: 3 })],
    ['a negative number', streak({ current: -1 })],
    ['a fraction', streak({ todayCount: 1.5 })],
    ['a number over the limit', streak({ current: MAX_STREAK_COUNT + 1, best: MAX_STREAK_COUNT + 1 })],
    ['text instead of a number', { ...streak(), best: '5' }],
    ['no day but counters', { lastDay: null, current: 1, best: 1, todayCount: 1 }],
  ])('rejects %s', (_label, raw) => {
    expect(parseStreak(raw)).toBeNull();
  });
});

describe('loadStreak and recordActivity', () => {
  it('loads the empty state when nothing, or something damaged, is stored', async () => {
    const storage = createMemoryStorage();
    expect(await loadStreak(storage)).toEqual(EMPTY_STREAK);
    await storage.set(STREAK_KEY, { lastDay: 'nope' });
    expect(await loadStreak(storage)).toEqual(EMPTY_STREAK);
  });

  it('records tests over several days and persists them', async () => {
    const storage = createMemoryStorage();
    const day = (d: number, hour = 12) => new Date(2026, 10, d, hour);

    expect(await recordActivity(storage, day(1))).toMatchObject({ current: 1, todayCount: 1 });
    expect(await recordActivity(storage, day(1, 23))).toMatchObject({ current: 1, todayCount: 2 });
    expect(await recordActivity(storage, day(2, 0))).toMatchObject({ current: 2, todayCount: 1 });
    // A skipped day (the 3rd) breaks the streak.
    expect(await recordActivity(storage, day(4))).toMatchObject({ current: 1, best: 2, todayCount: 1 });

    expect(await storage.get(STREAK_KEY)).toEqual({ lastDay: '2026-11-04', current: 1, best: 2, todayCount: 1 });
    expect(await loadStreak(storage)).toEqual({ lastDay: '2026-11-04', current: 1, best: 2, todayCount: 1 });
  });

  it('starts fresh when the stored value is damaged', async () => {
    const storage = createMemoryStorage();
    await storage.set(STREAK_KEY, 'broken');
    expect(await recordActivity(storage, new Date(2026, 10, 1))).toEqual({
      lastDay: '2026-11-01',
      current: 1,
      best: 1,
      todayCount: 1,
    });
  });
});

describe('mergeStreaks', () => {
  it('keeps the other side when one is empty', () => {
    expect(mergeStreaks({ ...EMPTY_STREAK }, streak())).toEqual(streak());
    expect(mergeStreaks(streak(), { ...EMPTY_STREAK })).toEqual(streak());
  });

  it('uses the state with the later day and the higher best of both', () => {
    const older = streak({ lastDay: '2026-10-20', current: 9, best: 9, todayCount: 4 });
    const newer = streak({ lastDay: '2026-11-01', current: 2, best: 3, todayCount: 1 });
    expect(mergeStreaks(older, newer)).toEqual({ lastDay: '2026-11-01', current: 2, best: 9, todayCount: 1 });
    expect(mergeStreaks(newer, older)).toEqual({ lastDay: '2026-11-01', current: 2, best: 9, todayCount: 1 });
  });

  it('takes the higher counts when both ended on the same day', () => {
    const a = streak({ current: 3, best: 4, todayCount: 1 });
    const b = streak({ current: 2, best: 7, todayCount: 5 });
    expect(mergeStreaks(a, b)).toEqual({ lastDay: '2026-11-01', current: 3, best: 7, todayCount: 5 });
  });

  it('always gives a consistent result', () => {
    const merged = mergeStreaks(streak({ lastDay: '2026-11-02', current: 6, best: 6 }), streak());
    expect(parseStreak(merged)).toEqual(merged);
  });
});

describe('getGoalProgress', () => {
  it('is null when the goal is off', () => {
    expect(getGoalProgress(4, 0)).toBeNull();
  });

  it('reports progress below, at and above the goal (done never exceeds the goal)', () => {
    expect(getGoalProgress(0, 3)).toEqual({ goal: 3, done: 0, reached: false });
    expect(getGoalProgress(2, 3)).toEqual({ goal: 3, done: 2, reached: false });
    expect(getGoalProgress(3, 3)).toEqual({ goal: 3, done: 3, reached: true });
    expect(getGoalProgress(7, 3)).toEqual({ goal: 3, done: 3, reached: true });
  });
});
