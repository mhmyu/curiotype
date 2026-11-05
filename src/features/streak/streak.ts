import type { StorageAdapter } from '@/lib/storage/types';

// Versioned key. One value for the whole app (a streak does not depend on the sentence language).
export const STREAK_KEY = 'streak:v1';

/** Upper bound for every counter; a larger stored number is treated as damaged data. */
export const MAX_STREAK_COUNT = 100_000;

export interface Streak {
  /** Local calendar day (`YYYY-MM-DD`) of the latest finished test; null when none was recorded yet. */
  lastDay: string | null;
  /** Consecutive days with at least one finished test, counted up to `lastDay`. */
  current: number;
  /** Longest streak ever reached. */
  best: number;
  /** Tests finished on `lastDay`. */
  todayCount: number;
}

export const EMPTY_STREAK: Readonly<Streak> = Object.freeze({
  lastDay: null,
  current: 0,
  best: 0,
  todayCount: 0,
});

const DAY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const MS_PER_DAY = 86_400_000;

/** Local calendar day of a date as `YYYY-MM-DD` (the device time zone, not UTC). */
export function toDayKey(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Days since the epoch for a valid `YYYY-MM-DD`, or null. UTC maths, so daylight saving never shifts a day. */
function dayNumber(day: string): number | null {
  const match = DAY_PATTERN.exec(day);
  if (!match) return null;
  const [year, month, date] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const utc = Date.UTC(year, month - 1, date);
  const check = new Date(utc);
  const valid =
    check.getUTCFullYear() === year && check.getUTCMonth() === month - 1 && check.getUTCDate() === date;
  return valid ? Math.round(utc / MS_PER_DAY) : null;
}

/** Whole days from `from` to `to` (positive when `to` is later); null when either is not a valid day. */
export function daysBetween(from: string, to: string): number | null {
  const a = dayNumber(from);
  const b = dayNumber(to);
  return a === null || b === null ? null : b - a;
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_STREAK_COUNT;
}

/**
 * Strict reader: returns the streak when `raw` is a consistent value, otherwise null. Consistent
 * means the exact four fields, a real calendar day (or none, with all counters zero), `current`
 * of at least 1 once a day exists, `best >= current`, and `todayCount >= 1` once a day exists.
 */
export function parseStreak(raw: unknown): Streak | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const source = raw as Record<string, unknown>;
  const keys = Object.keys(source);
  if (keys.length !== 4 || !['lastDay', 'current', 'best', 'todayCount'].every((k) => k in source)) {
    return null;
  }
  const { lastDay, current, best, todayCount } = source;
  if (!isCount(current) || !isCount(best) || !isCount(todayCount)) return null;
  if (lastDay === null) {
    return current === 0 && best === 0 && todayCount === 0 ? { ...EMPTY_STREAK } : null;
  }
  if (typeof lastDay !== 'string' || dayNumber(lastDay) === null) return null;
  if (current < 1 || todayCount < 1 || best < current) return null;
  return { lastDay, current, best, todayCount };
}

/** Tolerant reader for runtime use: anything that is not a consistent streak counts as "no streak yet". */
export async function loadStreak(storage: StorageAdapter): Promise<Streak> {
  return parseStreak(await storage.get<unknown>(STREAK_KEY)) ?? { ...EMPTY_STREAK };
}

/** The state after one more test finished on `today` (`YYYY-MM-DD`). Pure; does not touch storage. */
export function advanceStreak(streak: Streak, today: string): Streak {
  const gap = streak.lastDay === null ? null : daysBetween(streak.lastDay, today);

  // Same day, or the clock went backwards: the day does not change, only the count of the day grows.
  if (gap !== null && gap <= 0) {
    return { ...streak, todayCount: Math.min(streak.todayCount + 1, MAX_STREAK_COUNT) };
  }
  // The next day continues the streak; the first test ever and any longer gap start a new one.
  const current = gap === 1 ? Math.min(streak.current + 1, MAX_STREAK_COUNT) : 1;
  return { lastDay: today, current, best: Math.max(streak.best, current), todayCount: 1 };
}

/** Records one finished test (any scored mode) or one relaxed session at `now` and returns the new state. */
export async function recordActivity(storage: StorageAdapter, now: Date = new Date()): Promise<Streak> {
  const next = advanceStreak(await loadStreak(storage), toDayKey(now));
  await storage.set(STREAK_KEY, next);
  return next;
}

export interface StreakView {
  /** Streak still alive on `today`: the latest test was today or yesterday; 0 once a day was skipped. */
  current: number;
  /** Tests finished today. */
  todayCount: number;
}

/** What to show on `today`. A streak is not broken until a whole day passes without a test. */
export function getStreakView(streak: Streak, today: string): StreakView {
  const gap = streak.lastDay === null ? null : daysBetween(streak.lastDay, today);
  if (gap === null || gap > 1) return { current: 0, todayCount: 0 };
  return { current: streak.current, todayCount: gap === 0 ? streak.todayCount : 0 };
}

/**
 * Merge for data import: the state with the later `lastDay` is the current one (the higher
 * `current` when both ended on the same day, with the higher count of that day), and `best` is
 * the higher of the two.
 */
export function mergeStreaks(a: Streak, b: Streak): Streak {
  if (a.lastDay === null) return { ...b };
  if (b.lastDay === null) return { ...a };
  const gap = daysBetween(a.lastDay, b.lastDay) ?? 0;
  let winner: Streak;
  if (gap > 0) winner = b;
  else if (gap < 0) winner = a;
  else {
    winner = {
      lastDay: a.lastDay,
      current: Math.max(a.current, b.current),
      best: 0,
      todayCount: Math.max(a.todayCount, b.todayCount),
    };
  }
  return { ...winner, best: Math.max(a.best, b.best, winner.current) };
}

/** Progress toward the daily goal (`goal` 0 = off). `done` is capped at the goal. */
export interface GoalProgress {
  goal: number;
  done: number;
  reached: boolean;
}

export function getGoalProgress(todayCount: number, goal: number): GoalProgress | null {
  if (goal <= 0) return null;
  return { goal, done: Math.min(todayCount, goal), reached: todayCount >= goal };
}
