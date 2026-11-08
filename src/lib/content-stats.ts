import { isDraftLanguage } from '../config/languages.ts';
import { EXPLANATION_LENGTH, getTextLength } from './content-rules.ts';
import { classifyDifficulty, getDifficultyThreshold, scoreSentence } from './difficulty.ts';
import { DIFFICULTIES } from './taxonomy.ts';
import type { Difficulty } from './taxonomy.ts';

/**
 * Pure logic behind `pnpm content:stats` (scripts/content-stats.ts). It imports
 * with explicit `.ts` extensions because Node runs the script directly (type
 * stripping), without Vite's alias resolution.
 */

const REGISTRY_FILE = 'src/content/categories.json';

/** Minimum sentences per category per language before a public release. */
export const TARGET_PER_CATEGORY = 100;

/** Wanted share of each difficulty inside one category, in percent. */
export const TARGET_SHARE: Record<Difficulty, number> = { easy: 50, hard: 50 };

/** A share may differ from its target by this many percentage points before a warning. */
export const SHARE_TOLERANCE = 10;

/** Categories with fewer sentences than this skip the share check (too noisy to judge). */
export const MIN_FOR_SHARE_CHECK = 10;

/** The part of a sentence file the statistics need. */
export interface StatsFile {
  lang: string;
  category: string;
  /** `text` is optional so counts can be computed without it; without text there are no scores. */
  items: readonly { difficulty: string; text?: string }[];
}

export type DifficultyCounts = Record<Difficulty, number>;

export interface CategoryStats {
  category: string;
  /** False when `src/content/categories.json` has no entry for it (the build rejects such a file). */
  registered: boolean;
  total: number;
  byDifficulty: DifficultyCounts;
  /** Sentences whose difficulty is not in DIFFICULTIES (the build rejects them; reported anyway). */
  unknownDifficulty: number;
  /** Sentences whose label differs from their score (the build rejects them; reported anyway). */
  mislabeled: number;
}

/**
 * How the scores of one language are spread. A threshold at the median puts half of the sentences
 * in each level (the 50/50 target), so the median is the value to compare the threshold with.
 */
export interface ScoreSummary {
  count: number;
  min: number;
  median: number;
  max: number;
  /** Threshold in use for the language (`lib/difficulty.ts`). */
  threshold: number;
}

export interface LangStats {
  lang: string;
  /** True for a draft language (`DRAFT_LANGUAGES`): built and validated, but not offered in production. */
  draft: boolean;
  total: number;
  byDifficulty: DifficultyCounts;
  categories: CategoryStats[];
  /** Null when the files carry no sentence text. */
  scores: ScoreSummary | null;
}

function emptyCounts(): DifficultyCounts {
  return { easy: 0, hard: 0 };
}

function emptyCategory(category: string, registered: boolean): CategoryStats {
  return { category, registered, total: 0, byDifficulty: emptyCounts(), unknownDifficulty: 0, mislabeled: 0 };
}

/** Summary of a list of scores (any order); null for an empty list. */
export function summarizeScores(scores: readonly number[], threshold: number): ScoreSummary | null {
  if (scores.length === 0) return null;
  const sorted = [...scores].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  const median = sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
  return {
    count: sorted.length,
    min: sorted[0],
    median,
    max: sorted[sorted.length - 1],
    threshold,
  };
}

/**
 * Counts sentences per language, category, and difficulty. A language lists the categories it has a
 * file for: first the ones registered in `categories.json` (in the order of `registeredIds`), then
 * the unregistered ones by name. A category a language has no file for gets no row (a category may
 * exist in only some languages; `findCategoryNotes` reports it).
 */
export function computeContentStats(
  files: readonly StatsFile[],
  registeredIds: readonly string[],
): LangStats[] {
  const byLang = new Map<string, Map<string, CategoryStats>>();
  const scoresByLang = new Map<string, number[]>();

  for (const file of files) {
    let categories = byLang.get(file.lang);
    if (!categories) {
      categories = new Map();
      byLang.set(file.lang, categories);
    }
    let stats = categories.get(file.category);
    if (!stats) {
      stats = emptyCategory(file.category, registeredIds.includes(file.category));
      categories.set(file.category, stats);
    }
    for (const item of file.items) {
      stats.total += 1;
      if (item.text !== undefined) {
        const scores = scoresByLang.get(file.lang) ?? [];
        scores.push(scoreSentence(item.text));
        scoresByLang.set(file.lang, scores);
        if (item.difficulty !== classifyDifficulty(item.text, file.lang)) stats.mislabeled += 1;
      }
      if ((DIFFICULTIES as readonly string[]).includes(item.difficulty)) {
        stats.byDifficulty[item.difficulty as Difficulty] += 1;
      } else {
        stats.unknownDifficulty += 1;
      }
    }
  }

  return [...byLang.keys()].sort().map((lang) => {
    const found = byLang.get(lang)!;
    const known = registeredIds.filter((category) => found.has(category)).map((category) => found.get(category)!);
    const extra = [...found.keys()]
      .filter((category) => !registeredIds.includes(category))
      .sort()
      .map((category) => found.get(category)!);
    const categories = [...known, ...extra];
    const byDifficulty = emptyCounts();
    for (const category of categories) {
      for (const difficulty of DIFFICULTIES) byDifficulty[difficulty] += category.byDifficulty[difficulty];
    }
    return {
      lang,
      draft: isDraftLanguage(lang),
      total: categories.reduce((sum, category) => sum + category.total, 0),
      byDifficulty,
      categories,
      scores: summarizeScores(scoresByLang.get(lang) ?? [], getDifficultyThreshold(lang)),
    };
  });
}

/** Share of `count` in `total`, in whole percent (0 when `total` is 0). */
export function percentOf(count: number, total: number): number {
  return total === 0 ? 0 : Math.round((count / total) * 100);
}

/** A sentence file with what the detail statistics read: text, explanation and source URL. */
export interface DetailFile {
  lang: string;
  category: string;
  items: readonly { text?: string; explanation?: string; source?: { url: string } }[];
}

/** A length is "near the limit" from this share of the maximum (90%). */
export const NEAR_LIMIT_SHARE = 0.9;

/** A letter with fewer occurrences than this in a language is listed as rare. */
export const RARE_LETTER_MIN = 30;

/** One source page may serve at most this share of a category (percent) before a warning. */
export const SOURCE_SHARE_LIMIT = 10;

/** Categories with fewer sentences than this skip the source check (too noisy to judge). */
export const MIN_FOR_SOURCE_CHECK = 20;

/** How many domains the report lists. */
const TOP_DOMAINS = 3;

export interface LengthSummary {
  count: number;
  min: number;
  median: number;
  max: number;
  allowedMin: number;
  allowedMax: number;
  /** Items at 90% of the allowed maximum or more. */
  nearLimit: number;
}

export interface LangDetails {
  lang: string;
  text: LengthSummary | null;
  explanation: LengthSummary | null;
  sources: {
    pages: number;
    domains: number;
    topDomains: { domain: string; count: number }[];
    topPage: { url: string; count: number } | null;
  };
  digits: { sentences: number; withDigit: number; counts: number[] };
  letters: {
    /** Letters a-z with fewer than `RARE_LETTER_MIN` occurrences, rarest first. */
    rare: { letter: string; count: number }[];
    /** Letters outside a-z (accents, other scripts) with their counts, most frequent first. */
    other: { letter: string; count: number }[];
  };
}

function medianOf(sorted: readonly number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[middle - 1] + sorted[middle]) / 2 : sorted[middle];
}

function summarizeLengths(lengths: readonly number[], allowed: readonly [number, number]): LengthSummary | null {
  if (lengths.length === 0) return null;
  const sorted = [...lengths].sort((a, b) => a - b);
  const limit = Math.floor(allowed[1] * NEAR_LIMIT_SHARE);
  return {
    count: sorted.length,
    min: sorted[0],
    median: medianOf(sorted),
    max: sorted[sorted.length - 1],
    allowedMin: allowed[0],
    allowedMax: allowed[1],
    nearLimit: sorted.filter((length) => length >= limit).length,
  };
}

/** The page of a source URL without its `#fragment`, and its host without `www.`. */
export function describeSourceUrl(url: string): { page: string; domain: string } {
  try {
    const parsed = new URL(url);
    return {
      page: `${parsed.origin}${parsed.pathname}${parsed.search}`,
      domain: parsed.hostname.replace(/^www\./, ''),
    };
  } catch {
    return { page: url, domain: url };
  }
}

function sortedByCount<T extends { count: number }>(rows: T[], key: (row: T) => string): T[] {
  return rows.sort((a, b) => b.count - a.count || key(a).localeCompare(key(b)));
}

/**
 * Detail statistics per language: length of text and explanation against their allowed range,
 * how the sources are spread, how often digits occur and which letters are rare. Information only
 * (`findSourceWarnings` is the one check that warns).
 */
export function computeContentDetails(files: readonly DetailFile[]): LangDetails[] {
  const langs = [...new Set(files.map((file) => file.lang))].sort();
  return langs.map((lang) => {
    const items = files.filter((file) => file.lang === lang).flatMap((file) => file.items);
    const texts = items.flatMap((item) => (item.text === undefined ? [] : [item.text]));
    const explanations = items.flatMap((item) => (item.explanation === undefined ? [] : [item.explanation]));

    const pageCounts = new Map<string, number>();
    const domainCounts = new Map<string, number>();
    for (const item of items) {
      if (!item.source) continue;
      const { page, domain } = describeSourceUrl(item.source.url);
      pageCounts.set(page, (pageCounts.get(page) ?? 0) + 1);
      domainCounts.set(domain, (domainCounts.get(domain) ?? 0) + 1);
    }
    const pages = sortedByCount([...pageCounts].map(([url, count]) => ({ url, count })), (row) => row.url);
    const domains = sortedByCount([...domainCounts].map(([domain, count]) => ({ domain, count })), (row) => row.domain);

    const digitCounts = Array<number>(10).fill(0);
    let withDigit = 0;
    const letterCounts = new Map<string, number>();
    for (const text of texts) {
      let hasDigit = false;
      for (const char of text.toLowerCase()) {
        if (char >= '0' && char <= '9') {
          digitCounts[Number(char)] += 1;
          hasDigit = true;
        } else if (/\p{L}/u.test(char)) {
          letterCounts.set(char, (letterCounts.get(char) ?? 0) + 1);
        }
      }
      if (hasDigit) withDigit += 1;
    }
    const basic = 'abcdefghijklmnopqrstuvwxyz'.split('').map((letter) => ({ letter, count: letterCounts.get(letter) ?? 0 }));
    const rare = basic.filter((row) => row.count < RARE_LETTER_MIN).sort((a, b) => a.count - b.count || a.letter.localeCompare(b.letter));
    const other = sortedByCount(
      [...letterCounts].filter(([letter]) => !/^[a-z]$/.test(letter)).map(([letter, count]) => ({ letter, count })),
      (row) => row.letter,
    );

    return {
      lang,
      text: summarizeLengths(texts.map((text) => text.length), getTextLength(lang)),
      explanation: summarizeLengths(explanations.map((text) => text.length), EXPLANATION_LENGTH),
      sources: {
        pages: pages.length,
        domains: domains.length,
        topDomains: domains.slice(0, TOP_DOMAINS),
        topPage: pages[0] ?? null,
      },
      digits: { sentences: texts.length, withDigit, counts: digitCounts },
      letters: { rare, other },
    };
  });
}

/**
 * Warnings for a source page that serves too much of one category: more than `SOURCE_SHARE_LIMIT`
 * percent of its sentences, in a category of at least `MIN_FOR_SOURCE_CHECK`. The `#fragment` does
 * not count as another page. Only the page is checked, not the domain (an encyclopedia may
 * legitimately be the domain of many sentences).
 */
export function findSourceWarnings(files: readonly DetailFile[]): string[] {
  const warnings: string[] = [];
  for (const file of files) {
    const withSource = file.items.filter((item) => item.source !== undefined);
    if (withSource.length < MIN_FOR_SOURCE_CHECK) continue;
    const counts = new Map<string, number>();
    for (const item of withSource) {
      const { page } = describeSourceUrl(item.source!.url);
      counts.set(page, (counts.get(page) ?? 0) + 1);
    }
    for (const [page, count] of [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))) {
      const share = percentOf(count, withSource.length);
      if (share > SOURCE_SHARE_LIMIT) {
        warnings.push(
          `${file.lang}/${file.category}: ${page} is the source of ${count} of ${withSource.length} sentences (${share}%), at most ${SOURCE_SHARE_LIMIT}% is advised.`,
        );
      }
    }
  }
  return warnings;
}

function formatLength(label: string, summary: LengthSummary | null, unit: string): string[] {
  if (!summary) return [];
  const near = summary.nearLimit > 0 ? `; ${summary.nearLimit} at ${NEAR_LIMIT_SHARE * 100}% of the maximum or more` : '';
  return [
    `  ${label} length: min ${summary.min}, median ${summary.median}, max ${summary.max} (allowed ${summary.allowedMin}-${summary.allowedMax} ${unit})${near}`,
  ];
}

function formatDetails(details: LangDetails): string[] {
  const lines = [
    ...formatLength('text', details.text, 'characters'),
    ...formatLength('explanation', details.explanation, 'characters'),
  ];
  const { sources, digits, letters } = details;
  if (sources.pages > 0) {
    const domains = sources.topDomains.map((row) => `${row.domain} ${row.count}`).join(', ');
    lines.push(`  sources: ${sources.pages} page(s) on ${sources.domains} domain(s); most used: ${domains}`);
    if (sources.topPage && sources.topPage.count > 1) {
      lines.push(`  most used page: ${sources.topPage.url} (${sources.topPage.count} sentences)`);
    }
  }
  if (digits.sentences > 0) {
    const perDigit = digits.counts.map((count, digit) => `${digit}:${count}`).join(' ');
    lines.push(
      `  digits: in ${digits.withDigit} of ${digits.sentences} sentences (${percentOf(digits.withDigit, digits.sentences)}%); ${perDigit}`,
    );
  }
  if (letters.rare.length > 0) {
    lines.push(
      `  letters under ${RARE_LETTER_MIN} occurrences: ${letters.rare.map((row) => `${row.letter} ${row.count}`).join(', ')}`,
    );
  }
  if (letters.other.length > 0) {
    lines.push(`  other letters: ${letters.other.map((row) => `${row.letter} ${row.count}`).join(', ')}`);
  }
  return lines;
}

/** Human-readable warnings; an empty list means the corpus meets the targets. */
export function findWarnings(stats: readonly LangStats[], registeredIds: readonly string[]): string[] {
  const warnings: string[] = [];
  if (stats.length === 0) warnings.push('No sentence files found.');

  for (const lang of stats) {
    for (const category of lang.categories) {
      const label = `${lang.lang}/${category.category}`;
      if (!category.registered) {
        warnings.push(
          `Category "${category.category}" (${label}.json) has no entry in ${REGISTRY_FILE} (the build rejects this). Add one, or fix the file name if it is a typo.`,
        );
      }
      if (category.total < TARGET_PER_CATEGORY) {
        warnings.push(`${label}: ${category.total} sentences, target is ${TARGET_PER_CATEGORY}.`);
      }
      if (category.unknownDifficulty > 0) {
        warnings.push(`${label}: ${category.unknownDifficulty} sentence(s) with an unknown difficulty.`);
      }
      if (category.mislabeled > 0) {
        warnings.push(
          `${label}: ${category.mislabeled} sentence(s) labelled differently from their score (the build rejects this; see --scores).`,
        );
      }
      if (category.total < MIN_FOR_SHARE_CHECK) continue;
      for (const difficulty of DIFFICULTIES) {
        const share = percentOf(category.byDifficulty[difficulty], category.total);
        const target = TARGET_SHARE[difficulty];
        if (Math.abs(share - target) > SHARE_TOLERANCE) {
          warnings.push(
            `${label}: ${difficulty} is ${share}% of the sentences, target is ${target}% (allowed difference: ${SHARE_TOLERANCE} points).`,
          );
        }
      }
    }
  }
  const used = new Set(stats.flatMap((lang) => lang.categories.map((category) => category.category)));
  for (const id of registeredIds) {
    if (!used.has(id)) {
      warnings.push(`Category "${id}" is listed in ${REGISTRY_FILE} but has no sentence file, so the site does not show it.`);
    }
  }
  return warnings;
}

/**
 * Informative lines (not warnings) for categories that exist in some sentence languages only, such as
 * `Category geography: only in id (missing in en, es)`. Nothing when there is a single language.
 */
export function findCategoryNotes(stats: readonly LangStats[]): string[] {
  if (stats.length < 2) return [];
  const langsByCategory = new Map<string, string[]>();
  for (const lang of stats) {
    for (const category of lang.categories) {
      const langs = langsByCategory.get(category.category) ?? [];
      langs.push(lang.lang);
      langsByCategory.set(category.category, langs);
    }
  }
  const notes: string[] = [];
  for (const [category, present] of langsByCategory) {
    if (present.length === stats.length) continue;
    const missing = stats.map((lang) => lang.lang).filter((lang) => !present.includes(lang));
    notes.push(`Category ${category}: only in ${present.join(', ')} (missing in ${missing.join(', ')})`);
  }
  return notes;
}

function pad(value: string | number, width: number): string {
  return String(value).padEnd(width);
}

/** Plain-text report: one table per language, then the warnings. */
export function formatStats(
  stats: readonly LangStats[],
  warnings: readonly string[],
  notes: readonly string[] = [],
  details: readonly LangDetails[] = [],
): string {
  const lines: string[] = [];
  for (const lang of stats) {
    const draftNote = lang.draft ? ' (draft: not offered in the production language select)' : '';
    lines.push(`${lang.lang}: ${lang.total} sentences${draftNote}`);
    lines.push(`  ${pad('category', 14)}${pad('total', 7)}${pad('easy', 12)}hard`);
    const rows = [...lang.categories, { ...lang, category: 'ALL', unknownDifficulty: 0 }];
    for (const row of rows) {
      const cell = (difficulty: Difficulty) =>
        `${row.byDifficulty[difficulty]} (${percentOf(row.byDifficulty[difficulty], row.total)}%)`;
      lines.push(`  ${pad(row.category, 14)}${pad(row.total, 7)}${pad(cell('easy'), 12)}${cell('hard')}`);
    }
    if (lang.scores) {
      const { min, median, max, threshold } = lang.scores;
      lines.push(`  scores: min ${min}, median ${median}, max ${max}; threshold ${threshold} (the median splits 50/50)`);
    }
    const found = details.find((row) => row.lang === lang.lang);
    if (found) lines.push(...formatDetails(found));
    lines.push('');
  }
  lines.push(
    `Targets: at least ${TARGET_PER_CATEGORY} per category per language; ` +
      `difficulty ${TARGET_SHARE.easy}/${TARGET_SHARE.hard} (easy/hard).`,
  );
  const drafts = stats.filter((lang) => lang.draft).map((lang) => lang.lang);
  if (drafts.length > 0) {
    lines.push(
      `Draft languages: ${drafts.join(', ')}. Their thresholds are starting points; calibrate them before launch (see "Adding a sentence language" in README.md).`,
    );
  }
  if (notes.length > 0) {
    lines.push('Notes:');
    for (const note of notes) lines.push(`  - ${note}`);
  }
  if (warnings.length === 0) {
    lines.push('No warnings.');
  } else {
    lines.push(`${warnings.length} warning(s):`);
    for (const warning of warnings) lines.push(`  - ${warning}`);
  }
  return lines.join('\n');
}

/** A sentence file with the text of each sentence, as `--scores` needs it. */
export interface ScoreFile {
  lang: string;
  category: string;
  items: readonly { id: string; difficulty: string; text: string }[];
}

/**
 * Plain-text list of the score and the level of every sentence, per language, lowest score first.
 * A sentence whose label differs from its level is marked, so an author can fix it before the build
 * rejects it. Sentences with an equal score keep id order.
 */
export function formatScores(files: readonly ScoreFile[]): string {
  const byLang = new Map<string, { id: string; score: number; label: string; level: Difficulty }[]>();
  for (const file of files) {
    const rows = byLang.get(file.lang) ?? [];
    for (const item of file.items) {
      rows.push({
        id: item.id,
        score: scoreSentence(item.text),
        label: item.difficulty,
        level: classifyDifficulty(item.text, file.lang),
      });
    }
    byLang.set(file.lang, rows);
  }

  const lines: string[] = [];
  for (const lang of [...byLang.keys()].sort()) {
    const rows = byLang.get(lang)!.sort((a, b) => a.score - b.score || a.id.localeCompare(b.id));
    lines.push(`${lang}: threshold ${getDifficultyThreshold(lang)} (easy below it, hard at or above it)`);
    for (const row of rows) {
      const mark = row.label === row.level ? '' : `  <- labelled "${row.label}", must be "${row.level}"`;
      lines.push(`  ${pad(row.id, 24)}${pad(row.score, 6)}${row.level}${mark}`);
    }
    lines.push('');
  }
  return lines.join('\n').trimEnd();
}
