import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  addCategoryLabel,
  addCategoryToTaxonomy,
  buildCategorySkeleton,
  readCategories,
  readCategoryLabels,
  validateCategoryName,
} from './add-category';
import { checkSentence } from './content-rules';
import { CATEGORIES } from './taxonomy';

const taxonomy = readFileSync('src/lib/taxonomy.ts', 'utf8');
const dictionary = readFileSync('src/i18n/ui/en.ts', 'utf8');

describe('validateCategoryName', () => {
  it('accepts lowercase words, with hyphens', () => {
    expect(validateCategoryName('geography', ['science'])).toBeNull();
    expect(validateCategoryName('earth-science', [])).toBeNull();
  });

  it.each(['', 'Geography', 'geo graphy', '1geo', 'geo_graphy', 'géo', '-geo', 'a'.repeat(31)])(
    'rejects %j',
    (name) => {
      expect(validateCategoryName(name, [])).toContain('not a valid category name');
    },
  );

  it('rejects a name that exists', () => {
    expect(validateCategoryName('science', ['science'])).toContain('already exists');
  });
});

describe('taxonomy.ts', () => {
  it('reads the real list', () => {
    expect(readCategories(taxonomy)).toEqual([...CATEGORIES]);
  });

  it('appends a category and keeps the rest of the file', () => {
    const next = addCategoryToTaxonomy(taxonomy, 'geography');
    expect(readCategories(next)).toEqual([...CATEGORIES, 'geography']);
    expect(next.replace("'geography'", '').length).toBeGreaterThan(taxonomy.length - 5);
    expect(next).toContain('export type Category = (typeof CATEGORIES)[number];');
  });

  it('fails clearly when the declaration is missing', () => {
    expect(() => addCategoryToTaxonomy('const x = 1;', 'geography')).toThrow('CATEGORIES');
  });
});

describe('dictionary files', () => {
  it('reads the labels of the real file', () => {
    expect(readCategoryLabels(dictionary)).toEqual([...CATEGORIES]);
  });

  it('adds a label at the end of the categories block only', () => {
    const next = addCategoryLabel(dictionary, 'geography', 'Geography');
    expect(readCategoryLabels(next)).toEqual([...CATEGORIES, 'geography']);
    expect(next).toContain("    geography: 'Geography',\n  },");
    expect(next.length - dictionary.length).toBe("    geography: 'Geography',\n".length);
  });

  it('quotes a hyphenated key and escapes an apostrophe in the label', () => {
    const next = addCategoryLabel(dictionary, 'earth-science', "Earth's science");
    expect(next).toContain("    'earth-science': 'Earth\\'s science',");
    expect(readCategoryLabels(next)).toContain('earth-science');
  });

  it('fails clearly when there is no categories block', () => {
    expect(() => addCategoryLabel('export const en = {};', 'x', 'X')).toThrow('categories');
  });
});

describe('buildCategorySkeleton', () => {
  const lang = 'en';
  const parsed = JSON.parse(buildCategorySkeleton(lang, 'geography'));

  it('has the file shape with one placeholder item and an id that matches the path', () => {
    expect(parsed.lang).toBe('en');
    expect(parsed.category).toBe('geography');
    expect(parsed.items).toHaveLength(1);
    expect(parsed.items[0].id).toBe('en-geography-001');
    expect(buildCategorySkeleton(lang, 'geography').endsWith('}\n')).toBe(true);
  });

  it('is rejected by the build rules until it is replaced', () => {
    const problems = checkSentence('en', 'geography' as never, parsed.items[0]);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain('REPLACE_ME');
  });
});

describe('pnpm content:add-category', () => {
  const dirs: string[] = [];
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
  });

  /** A scratch copy of the three places the script touches. */
  function workspace() {
    const root = mkdtempSync(join(tmpdir(), 'add-category-'));
    dirs.push(root);
    cpSync('src/content/sentences', join(root, 'sentences'), { recursive: true });
    cpSync('src/i18n/ui', join(root, 'ui'), { recursive: true });
    writeFileSync(join(root, 'taxonomy.ts'), taxonomy);
    const base = ['--dir', join(root, 'sentences'), '--taxonomy', join(root, 'taxonomy.ts'), '--ui', join(root, 'ui')];
    const run = (args: string[]) => {
      try {
        const stdout = execFileSync('node', ['scripts/add-category.ts', ...args, ...base], { encoding: 'utf8', stdio: 'pipe' });
        return { code: 0, out: stdout };
      } catch (error) {
        const failure = error as { status: number; stderr: string };
        return { code: failure.status, out: failure.stderr };
      }
    };
    return { root, run };
  }

  it('writes the taxonomy, both labels and a skeleton per sentence language', () => {
    const { root, run } = workspace();
    const result = run(['geography', '--id', 'Geografi', '--en', 'Geography']);
    expect(result.code).toBe(0);
    expect(readCategories(readFileSync(join(root, 'taxonomy.ts'), 'utf8'))).toContain('geography');
    expect(readFileSync(join(root, 'ui/id.ts'), 'utf8')).toContain("geography: 'Geografi',");
    expect(readFileSync(join(root, 'ui/en.ts'), 'utf8')).toContain("geography: 'Geography',");
    for (const lang of ['id', 'en', 'es']) {
      const file = JSON.parse(readFileSync(join(root, 'sentences', lang, 'geography.json'), 'utf8'));
      expect(file.items[0].id).toBe(`${lang}-geography-001`);
    }
  });

  it('--langs limits the skeleton files', () => {
    const { root, run } = workspace();
    expect(run(['geography', '--id', 'Geografi', '--en', 'Geography', '--langs', 'id,en']).code).toBe(0);
    expect(existsSync(join(root, 'sentences/id/geography.json'))).toBe(true);
    expect(existsSync(join(root, 'sentences/es/geography.json'))).toBe(false);
  });

  it.each([
    ['an existing category', ['science', '--id', 'Sains', '--en', 'Science'], 'already exists'],
    ['an invalid name', ['Geo Graphy', '--id', 'G', '--en', 'G'], 'not a valid category name'],
    ['a missing label', ['geography', '--id', 'Geografi'], 'Missing the label for the "en"'],
    ['an unknown language', ['geography', '--id', 'G', '--en', 'G', '--langs', 'xx'], 'Unknown sentence language'],
  ])('changes nothing and explains it for %s', (_name, args, message) => {
    const { root, run } = workspace();
    const result = run(args);
    expect(result.code).toBe(1);
    expect(result.out).toContain(message);
    expect(readFileSync(join(root, 'taxonomy.ts'), 'utf8')).toBe(taxonomy);
    expect(readFileSync(join(root, 'ui/en.ts'), 'utf8')).toBe(dictionary);
    expect(existsSync(join(root, 'sentences/id/geography.json'))).toBe(false);
  });

  it('never overwrites an existing sentence file and writes nothing else', () => {
    const { root, run } = workspace();
    writeFileSync(join(root, 'sentences/es/geography.json'), '{"keep":true}');
    const result = run(['geography', '--id', 'Geografi', '--en', 'Geography']);
    expect(result.code).toBe(1);
    expect(result.out).toContain('already exists');
    expect(readFileSync(join(root, 'taxonomy.ts'), 'utf8')).toBe(taxonomy);
    expect(existsSync(join(root, 'sentences/id/geography.json'))).toBe(false);
    expect(readFileSync(join(root, 'sentences/es/geography.json'), 'utf8')).toBe('{"keep":true}');
  });
});
