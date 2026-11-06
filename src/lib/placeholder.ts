/**
 * Marker written into the sentence skeletons that `pnpm content:add-category` creates. The build
 * rejects any sentence that still contains it, so a skeleton can never be published by accident.
 * This file has no imports so that both the build rules and the Node script can load it.
 */
export const PLACEHOLDER_MARKER = 'REPLACE_ME';

/** True when any of the given strings still holds the placeholder marker. */
export function hasPlaceholder(...values: readonly string[]): boolean {
  return values.some((value) => value.includes(PLACEHOLDER_MARKER));
}
