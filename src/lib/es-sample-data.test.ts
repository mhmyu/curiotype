import { describe, expect, it } from 'vitest';
import { readCorpus } from '../../scripts/read-corpus.ts';
import { isDraftLanguage } from '../config/languages';
import { checkSentence } from './content-rules';
import type { ItemToCheck } from './content-rules';
import { classifyDifficulty } from './difficulty';

/**
 * The Spanish sample sentences (T37b, spec 21.5) are checked here with the same rules as the build,
 * so a broken sample fails `pnpm test:run` and not only `pnpm build`. The facts and sources are NOT
 * verified (the owner does that); this test only guards the mechanical rules.
 */
const files = readCorpus('src/content/sentences').filter((file) => file.lang === 'es');

/** The four categories the Spanish sample ships with (new categories are not required to exist in `es`). */
const SAMPLE_CATEGORIES = ['health', 'history', 'science', 'technology'];

describe('es sample sentences', () => {
  it('is a launched language with five sentences in each category', () => {
    expect(isDraftLanguage('es')).toBe(false);
    expect(files.map((file) => file.category).sort()).toEqual(SAMPLE_CATEGORIES);
    for (const file of files) expect(file.items).toHaveLength(5);
  });

  it('passes every content rule of the build', () => {
    for (const file of files) {
      for (const item of file.items) {
        const problems = checkSentence('es', file.category, item as unknown as ItemToCheck);
        expect(problems, item.id).toEqual([]);
      }
    }
  });

  it('keeps accented letters (the accents must be typed) and has unique ids', () => {
    const texts = files.flatMap((file) => file.items.map((item) => item.text));
    expect(texts.some((text) => /[\u00E1\u00E9\u00ED\u00F3\u00FA\u00F1]/.test(text))).toBe(true);
    const ids = files.flatMap((file) => file.items.map((item) => item.id));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('carries the label that the score of the es threshold gives, with both levels in use', () => {
    const items = files.flatMap((file) => file.items);
    for (const item of items) expect(item.difficulty, item.id).toBe(classifyDifficulty(item.text, 'es'));
    expect(new Set(items.map((item) => item.difficulty))).toEqual(new Set(['easy', 'hard']));
  });

  it('uses the Spanish Wikipedia as source', () => {
    for (const file of files) {
      for (const item of file.items) expect(item.source.url, item.id).toMatch(/^https:\/\/es\.wikipedia\.org\/wiki\/\S+$/);
    }
  });
});
