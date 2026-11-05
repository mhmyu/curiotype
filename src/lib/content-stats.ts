import { isDraftLanguage } from '../config/languages.ts';
import { classifyDifficulty, getDifficultyThreshold, scoreSentence } from './difficulty.ts';
import { CATEGORIES, DIFFICULTIES } from './taxonomy.ts';
import type { Difficulty } from './taxonomy.ts';

/**
 * Pure logic behind `pnpm content:stats` (scripts/content-stats.ts). It imports
 * with explicit `.ts` extensions because Node runs the script directly (type
 * stripping), without Vite's alias resolution.
 */

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

function emptyCategory(category: string): CategoryStats {
  return { category, total: 0, byDifficulty: emptyCounts(), unknownDifficulty: 0, mislabeled: 0 };
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
 * Counts sentences per language, category, and difficulty. Every known category
 * is listed for every language (zero when its file is missing); categories found
 * in files but unknown to the taxonomy are listed after them.
 */
export function computeContentStats(files: readonly StatsFile[]): LangStats[] {
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
      stats = emptyCategory(file.category);
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
    const known = CATEGORIES.map(
      (category) => found.get(category) ?? emptyCategory(category as string),
    );
    const extra = [...found.keys()]
      .filter((category) => !(CATEGORIES as readonly string[]).includes(category))
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

/** Human-readable warnings; an empty list means the corpus meets the targets. */
export function findWarnings(stats: readonly LangStats[]): string[] {
  const warnings: string[] = [];
  if (stats.length === 0) warnings.push('No sentence files found.');

  for (const lang of stats) {
    for (const category of lang.categories) {
      const label = `${lang.lang}/${category.category}`;
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
  return warnings;
}

function pad(value: string | number, width: number): string {
  return String(value).padEnd(width);
}

/** Plain-text report: one table per language, then the warnings. */
export function formatStats(stats: readonly LangStats[], warnings: readonly string[]): string {
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
