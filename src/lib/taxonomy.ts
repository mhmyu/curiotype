/**
 * A category id. The real list lives in `src/content/categories.json` and the sentence files
 * (see `lib/categories.ts`), so this is a plain string: the build checks the names, not TypeScript.
 */
export type Category = string;

/**
 * Two levels. A sentence's level is not a matter of opinion: it is computed from its text
 * (see `lib/difficulty.ts`) and the build rejects a label that does not match.
 */
export const DIFFICULTIES = ['easy', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
