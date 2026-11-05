import type { Difficulty } from './taxonomy.ts';

/**
 * Measured sentence difficulty (spec 20). Pure functions, no DOM and no `@/` alias: this file is
 * imported by the build rules (`content-rules.ts`) and by `pnpm content:stats` (plain Node, which
 * needs the explicit `.ts` extension on relative imports).
 *
 * A sentence has a score; a language has a threshold; the sentence is `easy` below the threshold
 * and `hard` at or above it. The weights and the thresholds are a starting point calibrated on the
 * 40 sample sentences: recalibrate when the corpus nears 100 sentences per category (see
 * "Difficulty" in CONTENT_GUIDE.md) with `pnpm content:stats`.
 */

/** Points added to the score of a sentence, on top of its length in characters. */
export const DIFFICULTY_WEIGHTS = {
  /** Per digit: numbers are slow to type and break the rhythm. */
  digit: 3,
  /** Per capital letter that is not the first character of the sentence (names, acronyms). */
  innerCapital: 2,
  /** Per character that is not a letter, a digit or a space, except the final full stop. */
  punctuation: 2,
  /** Per word (a run of letters) with at least `LONG_WORD_LETTERS` letters. */
  longWord: 5,
} as const;

/** A word of this many letters or more counts as a long word. */
export const LONG_WORD_LETTERS = 10;

/**
 * Score of a sentence: its length in characters plus the weighted counts of digits, inner
 * capitals, punctuation and long words. Letters are matched as Unicode letters so that an
 * accented letter is a letter (identical to A-Za-z for the ASCII corpus of today).
 */
export function scoreSentence(text: string): number {
  const body = text.endsWith('.') ? text.slice(0, -1) : text;
  const digits = (text.match(/[0-9]/g) ?? []).length;
  const innerCapitals = [...text.slice(1)].filter((ch) => /\p{Lu}/u.test(ch)).length;
  // Combining marks (\p{M}) belong to their letter, so they are not punctuation.
  const punctuation = (body.match(/[^\p{L}\p{M}\p{N} ]/gu) ?? []).length;
  const longWords = (text.match(new RegExp(`\\p{L}{${LONG_WORD_LETTERS},}`, 'gu')) ?? []).length;

  return (
    text.length +
    DIFFICULTY_WEIGHTS.digit * digits +
    DIFFICULTY_WEIGHTS.innerCapital * innerCapitals +
    DIFFICULTY_WEIGHTS.punctuation * punctuation +
    DIFFICULTY_WEIGHTS.longWord * longWords
  );
}

/** Score threshold per language code: below it a sentence is `easy`, at or above it `hard`. */
export type DifficultyThresholds = Readonly<Record<string, number>>;

/**
 * Starting thresholds, about the median score of the sample sentences of each language (Indonesian
 * sentences run about 15-20% longer for the same fact). Measured on the 20 sample sentences of each
 * language (rewritten in v53 so that the two levels are far apart: easy sentences score at most 83,
 * hard ones at least 135): en 52-180 (median 105.5), id 55-204 (median 114.5). Any threshold inside
 * the gap gives the same labels. Recalibrate with `pnpm content:stats`; changing
 * a value changes which label every sentence must carry, so relabel with `--scores`.
 */
export const DIFFICULTY_THRESHOLDS: DifficultyThresholds = {
  en: 100,
  id: 120,
  // Draft languages (T37a, spec 21.4): starting point = the `en` threshold x a length factor
  // (es, pt-br, fr 1.2; de 1.15), NOT measured. Calibrate each one with `pnpm content:stats --scores`
  // when the language has enough sentences, before launching it (see "Adding a sentence language").
  // First data point (T37b, rewritten in v53): the 20 `es` sample sentences score 59-188 with median
  // 116.5 against the threshold 120 (10 easy at most 83, 10 hard at least 150). Too few and unverified
  // to move it; recheck at about 20 per category.
  es: 120,
  'pt-br': 120,
  fr: 120,
  de: 115,
};

/** Language whose threshold a language without its own entry uses (like the length ranges). */
export const FALLBACK_THRESHOLD_LANG = 'en';

/** Threshold of a language, using the fallback language's for an unlisted one. */
export function getDifficultyThreshold(
  lang: string,
  table: DifficultyThresholds = DIFFICULTY_THRESHOLDS,
): number {
  return table[lang] ?? table[FALLBACK_THRESHOLD_LANG];
}

/** The level a sentence must carry: `easy` below the threshold of its language, else `hard`. */
export function classifyDifficulty(
  text: string,
  lang: string,
  table: DifficultyThresholds = DIFFICULTY_THRESHOLDS,
): Difficulty {
  return scoreSentence(text) < getDifficultyThreshold(lang, table) ? 'easy' : 'hard';
}
