/**
 * Single source of truth for sentence categories and difficulty levels.
 * Adding a value here makes TypeScript require its UI label in every language
 * dictionary (see src/i18n/types.ts) and allows it in the content schema.
 */
export const CATEGORIES = ['science', 'history', 'technology', 'health'] as const;
export type Category = (typeof CATEGORIES)[number];

/**
 * Two levels. A sentence's level is not a matter of opinion: it is computed from its text
 * (see `lib/difficulty.ts`) and the build rejects a label that does not match.
 */
export const DIFFICULTIES = ['easy', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
