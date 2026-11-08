/**
 * A test that runs while its tab is hidden is not a fair test (the typing area cannot be
 * focused or watched, and a timed test could even finish in the background). When the tab stays
 * hidden for this long during a running test, the test is stopped and not counted.
 */
export const HIDDEN_TAB_LIMIT_MS = 5000;

/**
 * True when a running test must be stopped because its tab was hidden for `hiddenForMs`.
 * Only a running test is stopped: a test that has not started has nothing to lose, and a
 * finished one is already scored.
 */
export function shouldStopForHiddenTab(
  running: boolean,
  hiddenForMs: number,
  limitMs: number = HIDDEN_TAB_LIMIT_MS,
): boolean {
  return running && hiddenForMs >= limitMs;
}
