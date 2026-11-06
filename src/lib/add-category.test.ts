import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readCorpus } from '../../scripts/read-corpus.ts';
import {
  appendRegistryEntry,
  buildCategorySkeleton,
  formatRegistryEntry,
  nextCategoryOrder,
  planAddCategory,
  validateCategoryName,
} from './add-category';
import { buildCategories, parseCategoryRegistry } from './categories';
import { checkSentence } from './content-rules';

const registryText = readFileSync('src/content/categories.json', 'utf8');
const UI = ['en', 'id'];
const LANGS = ['en', 'es', 'id'];

describe('validateCategoryName', () => {
  it('accepts lowercase words, with hyphens', () => {
    expect(validateCategoryName('geography')).toBeNull();
    expect(validateCategoryName('earth-science')).toBeNull();
  });

  it.each(['', 'Geography', 'geo graphy', '1geo', 'geo_graphy', 'géo', '-geo', 'a'.repeat(31)])(
    'rejects %j',
    (name) => {
      expect(validateCategoryName(name)).toContain('not a valid category name');
    },
  );
});

describe('nextCategoryOrder', () => {
  it('is 10 above the highest order, rounded up to a multiple of 10', () => {
    expect(nextCategoryOrder([])).toBe(10);
    expect(nextCategoryOrder([10, 20, 30, 40])).toBe(50);
    expect(nextCategoryOrder([45])).toBe(60);
    expect(nextCategoryOrder([1000])).toBe(1010);
  });
});

describe('categories.json editing', () => {
  it('formats an entry on one line like the existing ones', () => {
    expect(formatRegistryEntry({ id: 'Geografi', en: 'Geography' }, 50)).toBe(
      '{ "labels": { "id": "Geografi", "en": "Geography" }, "order": 50 }',
    );
    expect(formatRegistryEntry({ en: 'Earth "science"' }, 5)).toContain('"Earth \\"science\\""');
  });

  it('appends at the end and leaves everything before it byte for byte', () => {
    const entry = formatRegistryEntry({ id: 'Geografi', en: 'Geography' }, 50);
    const next = appendRegistryEntry(registryText, 'geography', entry);
    const lastEntryEnd = registryText.lastIndexOf('}\n}') + 1;
    expect(next.startsWith(registryText.slice(0, lastEntryEnd))).toBe(true);
    expect(next.endsWith(`,\n  "geography": ${entry}\n}\n`)).toBe(true);
    expect(Object.keys(JSON.parse(next))).toEqual(['science', 'history', 'technology', 'health', 'geography']);
    expect(JSON.parse(next).science).toEqual(JSON.parse(registryText).science);
  });

  it('writes the first entry of an empty list without a comma', () => {
    const next = appendRegistryEntry('{}\n', 'science', formatRegistryEntry({ en: 'Science' }, 10));
    expect(JSON.parse(next)).toEqual({ science: { labels: { en: 'Science' }, order: 10 } });
    expect(next).toBe('{\n  "science": { "labels": { "en": "Science" }, "order": 10 }\n}\n');
  });

  it('fails clearly when the text has no closing brace', () => {
    expect(() => appendRegistryEntry('nonsense', 'x', '{}')).toThrow('closing');
  });
});

describe('buildCategorySkeleton', () => {
  const parsed = JSON.parse(buildCategorySkeleton('en', 'geography'));

  it('has the file shape with one placeholder item, no labels, and an id that matches the path', () => {
    expect(Object.keys(parsed)).toEqual(['lang', 'category', 'items']);
    expect(parsed.lang).toBe('en');
    expect(parsed.category).toBe('geography');
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].id).toBe('en-geography-001');
    expect(buildCategorySkeleton('en', 'geography').endsWith('}\n')).toBe(true);
  });

  it('is rejected by the build rules until it is replaced', () => {
    const problems = checkSentence('en', 'geography', parsed.items[0]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('REPLACE_ME');
  });
});

describe('planAddCategory', () => {
  const base = {
    name: 'geography',
    labels: { id: 'Geografi', en: 'Geography' },
    registrySource: registryText,
    uiLangs: UI,
    sentenceLangs: LANGS,
    langsWithFile: [] as string[],
  };

  it('adds a new category to the list (order after the highest) and plans a file per language', () => {
    const plan = planAddCategory(base);
    expect(plan.isNew).toBe(true);
    expect(plan.entry).toBe('"geography": { "labels": { "id": "Geografi", "en": "Geography" }, "order": 50 }');
    const registry = parseCategoryRegistry(JSON.parse(plan.registrySource!), UI);
    expect(registry.map((d) => [d.id, d.order])).toEqual([
      ['science', 10],
      ['history', 20],
      ['technology', 30],
      ['health', 40],
      ['geography', 50],
    ]);
    expect(plan.files.map((file) => file.lang)).toEqual(['en', 'es', 'id']);
    expect(plan.notes).toEqual([]);
  });

  it('writes the labels in the order the file already uses (id, en)', () => {
    const plan = planAddCategory({ ...base, labels: { en: 'Geography', id: 'Geografi' } });
    expect(plan.entry).toContain('"labels": { "id": "Geografi", "en": "Geography" }');
  });

  it('takes --order when given, and --langs limits the files', () => {
    const plan = planAddCategory({ ...base, order: 25, requestedLangs: ['id', 'id'] });
    expect(plan.entry).toContain('"order": 25');
    expect(plan.files.map((file) => file.lang)).toEqual(['id']);
  });

  it('leaves a listed category alone and creates only the languages without a file', () => {
    const plan = planAddCategory({ ...base, name: 'science', labels: {}, langsWithFile: ['id'] });
    expect(plan.isNew).toBe(false);
    expect(plan.registrySource).toBeNull();
    expect(plan.entry).toBeNull();
    expect(plan.files.map((file) => file.lang)).toEqual(['en', 'es']);
    expect(plan.notes.join(' ')).toContain('Skipped the languages that already have a file: id');
  });

  it('accepts matching labels for a listed category and ignores --order with a note', () => {
    const plan = planAddCategory({
      ...base,
      name: 'science',
      labels: { id: 'Sains', en: 'Science' },
      order: 99,
      requestedLangs: ['es'],
    });
    expect(plan.registrySource).toBeNull();
    expect(plan.notes).toEqual(['--order is ignored: "science" is already listed (order 10).']);
  });

  it.each([
    ['a label that differs from the listed one', { ...base, name: 'science', labels: { id: 'Ilmu' } }, 'already listed'],
    ['an invalid name', { ...base, name: 'Geo Graphy' }, 'not a valid category name'],
    ['a missing label for a new category', { ...base, labels: { id: 'Geografi' } }, 'Missing the label for the "en"'],
    ['a label that is too long', { ...base, labels: { id: 'x'.repeat(31), en: 'Geography' } }, 'label of "geography"'],
    ['an order out of range', { ...base, order: 10000 }, '"order" of "geography"'],
    ['an unknown language', { ...base, requestedLangs: ['xx'] }, 'Unknown sentence language'],
    ['an empty language list', { ...base, requestedLangs: [] }, 'at least one language'],
    ['an existing file named in --langs', { ...base, requestedLangs: ['id'], langsWithFile: ['id'] }, 'id/geography.json already exists'],
    ['an existing file of a new category', { ...base, langsWithFile: ['es'] }, 'es/geography.json already exists'],
    ['a listed category that every language has', { ...base, name: 'science', labels: {}, langsWithFile: LANGS }, 'Nothing to add'],
    ['a registry that is not JSON', { ...base, registrySource: '{' }, 'not valid JSON'],
    ['a registry that breaks the rules', { ...base, registrySource: '{ "bad": {} }' }, 'entry "bad" needs a "labels" object'],
    ['a label for an unknown interface language', { ...base, labels: { ...base.labels, fr: 'Géographie' } }, 'not an interface language'],
    ['no sentence languages', { ...base, sentenceLangs: [] }, 'No sentence languages'],
  ])('refuses %s', (_name, input, message) => {
    expect(() => planAddCategory(input)).toThrow(message);
  });
});

describe('pnpm content:add-category and content:stats', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** A scratch copy of the three places the scripts read and write. */
  function workspace() {
    const root = mkdtempSync(join(tmpdir(), 'add-category-'));
    dirs.push(root);
    cpSync('src/content/sentences', join(root, 'sentences'), { recursive: true });
    cpSync('src/i18n/ui', join(root, 'ui'), { recursive: true });
    cpSync('src/content/categories.json', join(root, 'categories.json'));
    const paths = ['--dir', join(root, 'sentences'), '--ui', join(root, 'ui'), '--registry', join(root, 'categories.json')];
    const run = (script: string, args: string[]) => {
      try {
        const stdout = execFileSync('node', [script, ...args, ...paths], { encoding: 'utf8', stdio: 'pipe' });
        return { code: 0, out: stdout };
      } catch (error) {
        const failure = error as { status: number; stdout: string; stderr: string };
        return { code: failure.status, out: `${failure.stdout}${failure.stderr}` };
      }
    };
    const add = (args: string[]) => run('scripts/add-category.ts', args);
    const registry = () => readFileSync(join(root, 'categories.json'), 'utf8');
    const file = (lang: string, name: string) => join(root, 'sentences', lang, `${name}.json`);
    /** Everything the scripts could change: the registry text and the list of sentence files. */
    const snapshot = () =>
      JSON.stringify({
        registry: registry(),
        files: LANGS.flatMap((lang) => readdirSync(join(root, 'sentences', lang)).map((name) => `${lang}/${name}`)),
      });
    return { root, add, run, registry, file, snapshot };
  }

  it('adds the entry and a skeleton per sentence language, keeping the old entries', () => {
    const { add, registry, file } = workspace();
    const result = add(['geography', '--id', 'Geografi', '--en', 'Geography']);
    expect(result.code).toBe(0);
    expect(registry().startsWith(registryText.slice(0, registryText.lastIndexOf('}\n}') + 1))).toBe(true);
    const parsed = JSON.parse(registry());
    expect(parsed.geography).toEqual({ labels: { id: 'Geografi', en: 'Geography' }, order: 50 });
    expect(parsed.science).toEqual(JSON.parse(registryText).science);
    for (const lang of LANGS) {
      const created = JSON.parse(readFileSync(file(lang, 'geography'), 'utf8'));
      expect(created.items[0].id).toBe(`${lang}-geography-001`);
    }
    expect(result.out).toContain('Added the category "geography"');
  });

  it('builds a valid list: the new category is registered and the files are found', () => {
    const { add, root } = workspace();
    expect(add(['geography', '--id', 'Geografi', '--en', 'Geography', '--langs', 'id']).code).toBe(0);
    const registry = parseCategoryRegistry(JSON.parse(readFileSync(join(root, 'categories.json'), 'utf8')), UI);
    const files = readCorpus(join(root, 'sentences')).map((f) => ({ path: f.path, lang: f.lang, category: f.category }));
    const built = buildCategories(registry, files);
    expect(built.byLang.id.map((d) => d.id)).toEqual(['science', 'history', 'technology', 'health', 'geography']);
    expect(built.byLang.en.map((d) => d.id)).toEqual(['science', 'history', 'technology', 'health']);
    expect(built.unused).toEqual([]);
  });

  it('--langs limits the files, and --order sets the order', () => {
    const { add, registry, file } = workspace();
    expect(add(['geography', '--id', 'Geografi', '--en', 'Geography', '--langs', 'id,en', '--order', '5']).code).toBe(0);
    expect(existsSync(file('id', 'geography'))).toBe(true);
    expect(existsSync(file('en', 'geography'))).toBe(true);
    expect(existsSync(file('es', 'geography'))).toBe(false);
    expect(JSON.parse(registry()).geography.order).toBe(5);
  });

  it('adds the missing language of a listed category without changing the list', () => {
    const { add, registry, file } = workspace();
    expect(add(['geography', '--id', 'Geografi', '--en', 'Geography', '--langs', 'id']).code).toBe(0);
    const listed = registry();
    const result = add(['geography', '--langs', 'en']);
    expect(result.code).toBe(0);
    expect(registry()).toBe(listed);
    expect(existsSync(file('en', 'geography'))).toBe(true);
    expect(existsSync(file('es', 'geography'))).toBe(false);
    expect(result.out).toContain('Added language files for the category "geography"');
    expect(result.out).not.toContain('(new entry)');
  });

  it('without --langs a listed category gets only the languages that lack it, and says which it skipped', () => {
    const { add, registry, file } = workspace();
    add(['geography', '--id', 'Geografi', '--en', 'Geography', '--langs', 'id']);
    const listed = registry();
    const result = add(['geography', '--id', 'Geografi', '--order', '99']);
    expect(result.code).toBe(0);
    expect(registry()).toBe(listed);
    expect(existsSync(file('en', 'geography'))).toBe(true);
    expect(existsSync(file('es', 'geography'))).toBe(true);
    expect(result.out).toContain('Skipped the languages that already have a file: id.');
    expect(result.out).toContain('--order is ignored');
  });

  it('--dry-run prints the entry and the files and writes nothing', () => {
    const { add, snapshot, root } = workspace();
    const before = snapshot();
    const result = add(['geography', '--id', 'Geografi', '--en', 'Geography', '--dry-run']);
    expect(result.code).toBe(0);
    expect(snapshot()).toBe(before);
    expect(result.out).toContain('Dry run: nothing was written.');
    expect(result.out).toContain('"geography": { "labels": { "id": "Geografi", "en": "Geography" }, "order": 50 }');
    expect(result.out).toContain(join(root, 'sentences', 'es', 'geography.json'));
    expect(result.out).not.toContain('Next:');
  });

  it.each([
    ['a label that differs from the listed one', ['science', '--id', 'Ilmu'], 'already listed'],
    ['an invalid name', ['Geo Graphy', '--id', 'G', '--en', 'G'], 'not a valid category name'],
    ['a missing label', ['geography', '--id', 'Geografi'], 'Missing the label for the "en"'],
    ['an unknown language', ['geography', '--id', 'G', '--en', 'G', '--langs', 'xx'], 'Unknown sentence language'],
    ['an unknown option', ['geography', '--id', 'G', '--en', 'G', '--lang', 'id'], 'Unknown option "--lang"'],
    ['an option without a value', ['geography', '--id', 'G', '--en'], 'The option --en needs a value'],
    ['an order that is not a number', ['geography', '--id', 'G', '--en', 'G', '--order', 'ten'], '--order must be a whole number'],
    ['a missing name', ['--id', 'G', '--en', 'G'], 'Missing category name'],
    ['a listed category that every language already has', ['science'], 'Nothing to add'],
    ['a label that is too long', ['geography', '--id', 'x'.repeat(31), '--en', 'G'], 'label of "geography"'],
  ])('changes nothing and explains it for %s', (_name, args, message) => {
    const { snapshot, add } = workspace();
    const before = snapshot();
    const result = add(args);
    expect(result.code).toBe(1);
    expect(result.out).toContain(message);
    expect(snapshot()).toBe(before);
  });

  it('changes nothing when the list cannot be read or is broken', () => {
    const { root, add, snapshot } = workspace();
    writeFileSync(join(root, 'categories.json'), '{ "science": { "labels": { "id": "Sains" } } }\n');
    const before = snapshot();
    const result = add(['geography', '--id', 'Geografi', '--en', 'Geography']);
    expect(result.code).toBe(1);
    expect(result.out).toContain('entry "science" has no label for interface language "en"');
    expect(snapshot()).toBe(before);
    rmSync(join(root, 'categories.json'));
    expect(add(['geography', '--id', 'Geografi', '--en', 'Geography']).out).toContain('Cannot read');
  });

  it('never overwrites an existing sentence file and writes nothing else', () => {
    const { add, registry, file } = workspace();
    writeFileSync(file('es', 'geography'), '{"keep":true}');
    const listed = registry();
    const result = add(['geography', '--id', 'Geografi', '--en', 'Geography']);
    expect(result.code).toBe(1);
    expect(result.out).toContain('already exists');
    expect(registry()).toBe(listed);
    expect(existsSync(file('id', 'geography'))).toBe(false);
    expect(readFileSync(file('es', 'geography'), 'utf8')).toBe('{"keep":true}');
  });

  it('content:stats notes a category that exists in one language only', () => {
    const { add, run } = workspace();
    add(['geography', '--id', 'Geografi', '--en', 'Geography', '--langs', 'id']);
    const result = run('scripts/content-stats.ts', []);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Category geography: only in id (missing in en, es)');
  });

  it('content:stats warns about an unregistered file name and a listed category without files', () => {
    const { add, run, file } = workspace();
    add(['geography', '--id', 'Geografi', '--en', 'Geography', '--langs', 'id']);
    renameSync(file('id', 'geography'), file('id', 'geograpy'));
    const result = run('scripts/content-stats.ts', []);
    expect(result.code).toBe(0);
    expect(result.out).toContain('Category "geograpy" (id/geograpy.json) has no entry in src/content/categories.json');
    expect(result.out).toContain('Category "geography" is listed in src/content/categories.json but has no sentence file');
    expect(run('scripts/content-stats.ts', ['--strict']).code).toBe(1);
  });
});
