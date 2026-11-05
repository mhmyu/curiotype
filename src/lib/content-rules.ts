import type { ContentLang } from '../i18n/config';
import { DIFFICULTY_THRESHOLDS, getDifficultyThreshold, scoreSentence } from './difficulty';
import type { DifficultyThresholds } from './difficulty';
import type { Category, Difficulty } from './taxonomy';

/**
 * Mechanical content rules, enforced at build time by src/content.config.ts.
 * They mirror CONTENT_GUIDE.md; change both together. Judgment calls (is the
 * fact true, does the source support it, topic variety) stay with reviewers.
 */

/** Inclusive text length range (characters). */
export type LengthRange = readonly [number, number];

/** Length range per language code (one range for both difficulties; the score decides the level). */
export type TextLengthTable = Record<string, LengthRange>;

/**
 * Inclusive text length (characters) per language code: a sanity range, so that no sentence is
 * too short to be worth typing or so long that it wraps to five lines on a phone. Whether a
 * sentence is `easy` or `hard` is not decided by length alone but by its score
 * (`lib/difficulty.ts`). A language without an entry uses the `FALLBACK_LENGTH_LANG` range; add an
 * entry only when its sentences need another range (for example a script where one character
 * carries more meaning, such as Chinese). The values are the union of the former per-difficulty
 * ranges (en 50-170, id 55-190).
 */
export const TEXT_LENGTH: TextLengthTable = {
  en: [50, 170],
  id: [55, 190],
  // Draft languages (T37a, spec 21.2): starting point = the `en` range x 1.15, rounded (50 -> 58,
  // 170 -> 196). Spanish, Portuguese, French and German run longer than English for the same fact.
  // Tune from data with `pnpm content:stats` once a language has enough sentences, before launching.
  es: [58, 196],
  'pt-br': [58, 196],
  fr: [58, 196],
  de: [58, 196],
};

/**
 * Language used for the length range of a language that has no entry in `TEXT_LENGTH`, so a new
 * language folder works without a code change. Add an entry for the language to `TEXT_LENGTH`
 * when its sentences need another range.
 */
export const FALLBACK_LENGTH_LANG = 'en';

/** Inclusive length range of a sentence, using the fallback range for unlisted languages. */
export function getTextLength(lang: ContentLang, table: TextLengthTable = TEXT_LENGTH): LengthRange {
  return table[lang] ?? table[FALLBACK_LENGTH_LANG];
}

export const EXPLANATION_LENGTH = [40, 220] as const;

/**
 * Which characters a sentence may contain, per language. The aim is always the
 * same: every character must be typable on the standard keyboard of that
 * language without special tools. Languages without an entry in
 * `LANGUAGE_RULES` use `DEFAULT_LANGUAGE_RULES` (printable ASCII).
 */
export interface LanguageRules {
  /**
   * Matches ONE allowed character (a single code point, so use the `u` flag when
   * the class holds characters outside the BMP). It must not use the `g` or `y`
   * flag: `RegExp.test` would keep state between calls.
   */
  allowedChar: RegExp;
  /** Shown to the author when a character is rejected: what is allowed and what to do instead. */
  hint: string;
  /**
   * Optional layout rules that a single-character class cannot express (for example French has no
   * space before `: ; ! ?`). Each pattern marks a violation when it matches the text; it must not use
   * the `g` or `y` flag.
   */
  forbidden?: readonly ForbiddenPattern[];
}

export interface ForbiddenPattern {
  pattern: RegExp;
  /** Shown to the author when the pattern matches: what is wrong and what to do instead. */
  message: string;
}

/** Printable ASCII: every character can be typed on US and Indonesian layouts. */
export const DEFAULT_LANGUAGE_RULES: LanguageRules = {
  allowedChar: /[\x20-\x7E]/,
  hint: 'Replace them with plain ASCII or words.',
};

/**
 * Character rules of languages that need more than ASCII (accented letters,
 * another script). Add an entry together with the sentence folder of that
 * language; see "Adding a sentence language" in README.md. Keep the text in
 * Unicode NFC (checked for every language): an accented letter must be one
 * character, not a base letter plus a combining mark.
 *
 * Example for a language that uses Latin letters with accents:
 *   fr: { allowedChar: /[\x20-\x7E\u00C0-\u00FF\u0152\u0153]/, hint: 'Use French letters only.' },
 */
/**
 * Rules for a Latin language with accents: printable ASCII plus the given accented letters, both
 * cases. `lowercase` lists the lowercase letters; their uppercase forms are added. Letters are
 * written as `\u` escapes so that this file can never hold a decomposed (NFC-violating) letter.
 */
function latinAccentRules(
  lowercase: string,
  hint: string,
  options: { extra?: string; forbidden?: readonly ForbiddenPattern[] } = {},
): LanguageRules {
  const upper = [...lowercase].map((ch) => ch.toUpperCase()).join('');
  return {
    allowedChar: new RegExp(`[\\x20-\\x7E${lowercase}${upper}${options.extra ?? ''}]`, 'u'),
    hint,
    forbidden: options.forbidden,
  };
}

export const LANGUAGE_RULES: Record<string, LanguageRules> = {
  // Spanish: a e i o u with an acute accent, u with a diaeresis, n with a tilde.
  // Not allowed: the inverted marks (U+00BF, U+00A1); statements end with a full stop.
  es: latinAccentRules(
    '\u00E1\u00E9\u00ED\u00F3\u00FA\u00FC\u00F1',
    'Use ASCII plus the Spanish letters \u00E1 \u00E9 \u00ED \u00F3 \u00FA \u00FC \u00F1. Do not use the inverted marks (\u00BF \u00A1): write a statement that ends with a full stop.',
  ),
  // Brazilian Portuguese: acute, grave, circumflex, tilde, cedilla. Not allowed: u with a diaeresis
  // (no longer used since the 1990 orthography agreement).
  'pt-br': latinAccentRules(
    '\u00E1\u00E0\u00E2\u00E3\u00E7\u00E9\u00EA\u00ED\u00F3\u00F4\u00F5\u00FA',
    'Use ASCII plus the Portuguese letters \u00E1 \u00E0 \u00E2 \u00E3 \u00E7 \u00E9 \u00EA \u00ED \u00F3 \u00F4 \u00F5 \u00FA. Do not use \u00FC (no longer used in Brazilian Portuguese).',
  ),
  // French. Not allowed: the ligatures (U+0153, U+00E6), y with a diaeresis (U+00FF) and the
  // guillemets (U+00AB, U+00BB): they are not on the standard AZERTY keyboard. No space before : ; ! ?
  fr: latinAccentRules(
    '\u00E0\u00E2\u00E7\u00E9\u00E8\u00EA\u00EB\u00EE\u00EF\u00F4\u00F9\u00FB\u00FC',
    'Use ASCII plus the French letters \u00E0 \u00E2 \u00E7 \u00E9 \u00E8 \u00EA \u00EB \u00EE \u00EF \u00F4 \u00F9 \u00FB \u00FC. Do not use \u0153 \u00E6 \u00FF or the guillemets (\u00AB \u00BB): pick another word or use plain quotation marks.',
    {
      forbidden: [
        {
          pattern: /\s[:;!?]/,
          message:
            'a space before ":", ";", "!" or "?" is not allowed (write the mark right after the word).',
        },
      ],
    },
  ),
  // German: umlauts and the sharp s. Not allowed: the capital sharp s (U+1E9E); it is not on the
  // keyboard (write SS in capitals).
  de: latinAccentRules(
    '\u00E4\u00F6\u00FC',
    'Use ASCII plus the German letters \u00E4 \u00F6 \u00FC \u00DF. Do not use the capital sharp s (\u1E9E).',
    { extra: '\u00DF' },
  ),
};

/** Character rules of a sentence language, using the ASCII default for unlisted languages. */
export function getLanguageRules(
  lang: ContentLang,
  registry: Record<string, LanguageRules> = LANGUAGE_RULES,
): LanguageRules {
  return registry[lang] ?? DEFAULT_LANGUAGE_RULES;
}

/** Characters of `text` that the rules do not allow, in order of appearance (each once). */
export function findDisallowedChars(text: string, rules: LanguageRules): string[] {
  return [...new Set([...text].filter((ch) => !rules.allowedChar.test(ch)))];
}
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const SOURCE_TITLE = /^[^:]+: \S.*$/;

export interface ItemToCheck {
  id: string;
  difficulty: Difficulty;
  text: string;
  explanation: string;
  source: { title: string; url: string };
}

/** Rule tables `checkSentence` reads; tests pass their own to try a language that has no entry yet. */
export interface RuleTables {
  textLength: TextLengthTable;
  languageRules: Record<string, LanguageRules>;
  difficultyThresholds: DifficultyThresholds;
}

const DEFAULT_TABLES: RuleTables = {
  textLength: TEXT_LENGTH,
  languageRules: LANGUAGE_RULES,
  difficultyThresholds: DIFFICULTY_THRESHOLDS,
};

/** Returns human-readable problems for one sentence; an empty list means it passes. */
export function checkSentence(
  lang: ContentLang,
  category: Category,
  item: ItemToCheck,
  tables: RuleTables = DEFAULT_TABLES,
): string[] {
  const problems: string[] = [];
  const label = `"${item.id}"`;
  const { text } = item;

  if (!new RegExp(`^${escapeRegExp(lang)}-${category}-\\d{3}$`).test(item.id)) {
    problems.push(`${label}: id must look like "${lang}-${category}-001".`);
  }

  const [min, max] = getTextLength(lang, tables.textLength);
  if (text.length < min || text.length > max) {
    problems.push(
      `${label}: text has ${text.length} characters, but sentences in "${lang}" need ${min}-${max}.`,
    );
  }
  // The level is measured, not chosen: the label must equal what the score says (lib/difficulty.ts).
  const score = scoreSentence(text);
  const threshold = getDifficultyThreshold(lang, tables.difficultyThresholds);
  const expected: Difficulty = score < threshold ? 'easy' : 'hard';
  if (item.difficulty !== expected) {
    problems.push(
      `${label}: score ${score} is ${expected} (threshold for "${lang}" is ${threshold}), but difficulty is "${item.difficulty}". Set difficulty to "${expected}" or change the sentence; "pnpm content:stats --scores" lists the score of every sentence.`,
    );
  }
  const rules = getLanguageRules(lang, tables.languageRules);
  const bad = findDisallowedChars(text, rules);
  if (bad.length > 0) {
    problems.push(
      `${label}: text contains characters that are not on a standard keyboard for "${lang}" (${bad.join(' ')}). ${rules.hint}`,
    );
  }
  for (const { pattern, message } of rules.forbidden ?? []) {
    if (pattern.test(text)) problems.push(`${label}: ${message}`);
  }
  if (text !== text.normalize('NFC')) {
    problems.push(
      `${label}: text must be Unicode NFC (each accented letter as one character, not a letter plus a combining mark). Retype the accented letters or normalize the text to NFC.`,
    );
  }
  if (text !== text.trim() || /\s{2,}/.test(text)) {
    problems.push(`${label}: text must use single spaces and no leading or trailing spaces.`);
  }
  if (!text.endsWith('.')) {
    problems.push(`${label}: text must end with a full stop.`);
  }

  const [minExplanation, maxExplanation] = EXPLANATION_LENGTH;
  if (item.explanation.length < minExplanation || item.explanation.length > maxExplanation) {
    problems.push(
      `${label}: explanation has ${item.explanation.length} characters, but it needs ${minExplanation}-${maxExplanation}.`,
    );
  }

  if (!SOURCE_TITLE.test(item.source.title)) {
    problems.push(`${label}: source title must look like "Publisher: Page title".`);
  }
  if (!item.source.url.startsWith('https://')) {
    problems.push(`${label}: source url must be a public https:// link.`);
  }

  return problems;
}
