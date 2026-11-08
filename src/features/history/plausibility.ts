/**
 * Plausibility of a finished test. A result far above what a person can type (a script, a stuck
 * key, a clock that jumped) must not become a personal best or enter the history.
 */

/**
 * Highest net WPM (correct characters only) that still counts. The fastest typists in the world
 * stay below it; a result above it is almost certainly not a real test.
 */
export const MAX_PLAUSIBLE_WPM = 300;

/**
 * True when the result can be a real test: the net WPM is a finite number from 0 up to `limit`
 * (inclusive). `limit` is a parameter so a caller can lift it (see `getPlausibilityLimit`).
 */
export function isPlausibleResult(
  result: { readonly wpm: number },
  limit: number = MAX_PLAUSIBLE_WPM,
): boolean {
  return Number.isFinite(result.wpm) && result.wpm >= 0 && result.wpm <= limit;
}

/** True when the browser says it is driven by automation (`navigator.webdriver`). */
export function isAutomatedBrowser(nav: { readonly webdriver?: boolean } | undefined): boolean {
  return nav?.webdriver === true;
}

/**
 * The limit to apply in this browser. A browser driven by automation (the end-to-end tests type a
 * whole sentence in a few milliseconds) is not limited, so those tests can still check the
 * history, records and streak; a person's browser always gets `MAX_PLAUSIBLE_WPM`.
 */
export function getPlausibilityLimit(nav: { readonly webdriver?: boolean } | undefined): number {
  return isAutomatedBrowser(nav) ? Number.POSITIVE_INFINITY : MAX_PLAUSIBLE_WPM;
}
