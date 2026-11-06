import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { LANGUAGES } from '../i18n/config';
import {
  buildCategories,
  CATEGORY_PATTERN,
  DEFAULT_CATEGORY_ORDER,
  getCategoryLabel,
  isCategoryId,
  parseCategoryRegistry,
} from './categories';

const UI = ['id', 'en'];
const entry = (id: string, en: string, order?: number) => ({
  labels: { id, en },
  ...(order === undefined ? {} : { order }),
});
const raw = {
  science: entry('Sains', 'Science', 10),
  history: entry('Sejarah', 'History', 20),
};
const file = (lang: string, category: string) => ({ path: `${lang}/${category}.json`, lang, category });

describe('category ids', () => {
  it('accepts lowercase words with hyphens', () => {
    for (const id of ['science', 'a', 'earth-science', 'a'.repeat(30)]) {
      expect(isCategoryId(id)).toBe(true);
      expect(CATEGORY_PATTERN.test(id)).toBe(true);
    }
  });

  it('rejects anything else', () => {
    for (const id of ['', 'Science', '1abc', '-a', 'a_b', 'a b', 'a/b', 'a'.repeat(31), 'café', 5, null]) {
      expect(isCategoryId(id)).toBe(false);
    }
  });
});

describe('parseCategoryRegistry', () => {
  it('returns definitions sorted by order, then id, with the default order', () => {
    const list = parseCategoryRegistry(
      { zoo: entry('Kebun', 'Zoo'), beta: entry('B', 'B', 5), alpha: entry('A', 'A'), late: entry('L', 'L', 5000) },
      UI,
    );
    expect(list.map((d) => d.id)).toEqual(['beta', 'alpha', 'zoo', 'late']);
    expect(list.find((d) => d.id === 'alpha')?.order).toBe(DEFAULT_CATEGORY_ORDER);
    expect(list[0].labels).toEqual({ id: 'B', en: 'B' });
  });

  it('accepts an empty registry', () => {
    expect(parseCategoryRegistry({}, UI)).toEqual([]);
  });

  it.each([
    ['not an object', [] as unknown, 'must be an object'],
    ['null', null, 'must be an object'],
    ['a bad id', { Science: entry('S', 'S') }, '"Science" is not a valid category id'],
    ['an entry that is not an object', { science: 'Science' }, 'entry "science" must be an object'],
    ['missing labels', { science: { order: 1 } }, 'needs a "labels" object'],
    ['a missing label', { science: { labels: { id: 'Sains' } } }, 'no label for interface language "en"'],
    ['an extra label', { science: { labels: { id: 'S', en: 'S', fr: 'S' } } }, 'label for "fr"'],
    ['an empty label', { science: entry('', 'Science') }, 'the "id" label of "science"'],
    ['a label with spaces at the ends', { science: entry('Sains ', 'Science') }, 'the "id" label'],
    ['a label over 30 characters', { science: entry('x'.repeat(31), 'Science') }, 'the "id" label'],
    ['a label that is not text', { science: { labels: { id: 5, en: 'S' } } }, 'the "id" label'],
    ['order below range', { science: entry('S', 'S', -1) }, '"order" of "science"'],
    ['order above range', { science: entry('S', 'S', 10000) }, '"order" of "science"'],
    ['order that is not whole', { science: entry('S', 'S', 1.5) }, '"order" of "science"'],
  ])('rejects %s', (_name, input, message) => {
    expect(() => parseCategoryRegistry(input, UI)).toThrow(message);
  });
});

describe('buildCategories', () => {
  const registry = parseCategoryRegistry(
    { ...raw, geography: entry('Geografi', 'Geography', 50) },
    UI,
  );

  it('lists, per language, the categories that have a file, in registry order', () => {
    const { byLang, unused } = buildCategories(registry, [
      file('en', 'history'),
      file('en', 'science'),
      file('id', 'geography'),
      file('id', 'science'),
    ]);
    expect(byLang.en.map((d) => d.id)).toEqual(['science', 'history']);
    expect(byLang.id.map((d) => d.id)).toEqual(['science', 'geography']);
    expect(unused).toEqual([]);
  });

  it('lets a category exist in one language only', () => {
    const { byLang } = buildCategories(registry, [file('id', 'geography'), file('en', 'science')]);
    expect(byLang.en.map((d) => d.id)).toEqual(['science']);
    expect(byLang.id.map((d) => d.id)).toEqual(['geography']);
  });

  it('reports registered categories without any file as unused', () => {
    const { unused } = buildCategories(registry, [file('en', 'science')]);
    expect(unused).toEqual(['history', 'geography']);
  });

  it('rejects a file whose category is not registered, naming the file', () => {
    expect(() => buildCategories(registry, [file('id', 'geograpy')])).toThrow(
      'Category "geograpy" (id/geograpy.json) has no entry in src/content/categories.json. Add one, or fix the file name if it is a typo.',
    );
  });

  it('handles no files', () => {
    expect(buildCategories(registry, [])).toEqual({ byLang: {}, unused: ['science', 'history', 'geography'] });
  });
});

describe('getCategoryLabel', () => {
  const defs = parseCategoryRegistry(raw, UI);

  it('returns the label of the interface language', () => {
    expect(getCategoryLabel(defs, 'science', 'id')).toBe('Sains');
    expect(getCategoryLabel(defs, 'science', 'en')).toBe('Science');
  });

  it('falls back to the id written as words, never empty', () => {
    expect(getCategoryLabel(defs, 'earth-science', 'en')).toBe('Earth science');
    expect(getCategoryLabel(defs, 'science', 'fr')).toBe('Science');
    expect(getCategoryLabel([], 'x', 'en')).toBe('X');
  });
});

describe('the real content', () => {
  const registry = parseCategoryRegistry(
    JSON.parse(readFileSync(new URL('../content/categories.json', import.meta.url), 'utf8')),
    LANGUAGES,
  );
  const root = new URL('../content/sentences/', import.meta.url);
  const files = readdirSync(root, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory())
    .flatMap((dir) =>
      readdirSync(new URL(`${dir.name}/`, root))
        .filter((name) => name.endsWith('.json'))
        .map((name) => file(dir.name, name.replace(/\.json$/, ''))),
    );

  it('registers every category that has a sentence file', () => {
    const { byLang, unused } = buildCategories(registry, files);
    expect(files.length).toBeGreaterThan(0);
    expect(unused).toEqual([]);
    for (const lang of Object.keys(byLang)) {
      expect(byLang[lang].map((d) => d.id)).toEqual(['science', 'history', 'technology', 'health']);
    }
  });

  it('has a label for every interface language', () => {
    for (const definition of registry) {
      for (const lang of LANGUAGES) expect(definition.labels[lang].length).toBeGreaterThan(0);
    }
  });
});
