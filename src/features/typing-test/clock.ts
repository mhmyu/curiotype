/**
 * Formats a number of seconds as `mm:ss` (`30` -> `00:30`, `120` -> `02:00`). Used by the duration
 * select and by the running time readout. Fractions are cut off and negative or invalid
 * values show `00:00`; minutes are not capped (`3600` -> `60:00`).
 */
export function formatClock(seconds: number): string {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(whole / 60);
  const rest = whole % 60;
  return `${String(minutes).padStart(2, '0')}:${String(rest).padStart(2, '0')}`;
}

/**
 * Whole seconds left in a timed test: counts down from `durationSec`, rounded up (a fraction of a
 * second still counts as a second, so the readout shows `00:00` only when time is really up) and
 * never below zero. Invalid input gives 0.
 */
export function getRemainingSeconds(durationSec: number, elapsedMs: number): number {
  if (!Number.isFinite(durationSec) || !Number.isFinite(elapsedMs)) return 0;
  return Math.max(0, Math.ceil((durationSec * 1000 - elapsedMs) / 1000));
}

/** Whole seconds since the test started (fractions cut off, never below zero; invalid input gives 0). */
export function getElapsedSeconds(elapsedMs: number): number {
  return Number.isFinite(elapsedMs) ? Math.max(0, Math.floor(elapsedMs / 1000)) : 0;
}

/**
 * Share of the time still left, from 0 to 1, for the progress bar of Time mode: `remainingSec /
 * durationSec`, clamped. Invalid input (or a duration of 0 or less) gives 0.
 */
export function getTimeBarFraction(durationSec: number, remainingSec: number): number {
  if (!Number.isFinite(durationSec) || !Number.isFinite(remainingSec) || durationSec <= 0) return 0;
  return Math.min(1, Math.max(0, remainingSec / durationSec));
}
