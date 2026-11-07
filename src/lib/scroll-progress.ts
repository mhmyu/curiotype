/** Scroll distance (px) after which the back-to-top button appears. */
export const BACK_TO_TOP_SHOW_AFTER = 120;

/**
 * Share of the page that has been scrolled, from 0 (top) to 1 (bottom).
 * A page that does not scroll at all counts as 0.
 */
export function getScrollProgress(scrollTop: number, scrollHeight: number, viewportHeight: number): number {
  const max = scrollHeight - viewportHeight;
  if (!Number.isFinite(max) || max <= 0 || !Number.isFinite(scrollTop)) return 0;
  return Math.min(1, Math.max(0, scrollTop / max));
}

/** The button shows only once the page has been scrolled a little. */
export function isBackToTopVisible(scrollTop: number): boolean {
  return scrollTop > BACK_TO_TOP_SHOW_AFTER;
}

/** Circumference of the progress ring (radius 20 in a 44 x 44 viewBox). */
export const RING_CIRCUMFERENCE = 2 * Math.PI * 20;

/** `stroke-dashoffset` that leaves `progress` of the ring drawn. */
export function getRingDashOffset(progress: number): number {
  const clamped = Math.min(1, Math.max(0, Number.isFinite(progress) ? progress : 0));
  return RING_CIRCUMFERENCE * (1 - clamped);
}
