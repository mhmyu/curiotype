import { PLACEHOLDER_MARKER } from './placeholder.ts';

/**
 * Pure helpers behind `pnpm content:add-category`: they take file contents as strings and return
 * new contents, so they are tested without touching the disk. The script in `scripts/` reads and
 * writes the files. No imports other than `./placeholder.ts` (the script runs under plain Node).
 */

const CATEGORY_NAME = /^[a-z][a-z-]{0,29}$/;
const CATEGORIES_DECLARATION = /export const CATEGORIES = \[([^\]]*)\] as const;/;
const CATEGORIES_BLOCK = /(\n {2}categories: \{\n)((?: {4}[^\n]*\n)*)( {2}\},)/;

/** Returns a message when `name` cannot be a category, or null when it can. */
export function validateCategoryName(name: string, existing: readonly string[]): string | null {
  if (!CATEGORY_NAME.test(name)) {
    return `"${name}" is not a valid category name: use 1 to 30 lowercase letters (a-z), with "-" between words, starting with a letter.`;
  }
  if (existing.includes(name)) return `The category "${name}" already exists.`;
  return null;
}

/** Category names listed in `CATEGORIES` of `lib/taxonomy.ts`, or null when the declaration is not found. */
export function readCategories(taxonomySource: string): string[] | null {
  const match = CATEGORIES_DECLARATION.exec(taxonomySource);
  if (!match) return null;
  return [...match[1].matchAll(/'([^']+)'/g)].map((entry) => entry[1]);
}

/** `taxonomy.ts` with `name` appended to `CATEGORIES`. */
export function addCategoryToTaxonomy(taxonomySource: string, name: string): string {
  const existing = readCategories(taxonomySource);
  if (!existing) throw new Error('Cannot find "export const CATEGORIES = [...] as const;" in src/lib/taxonomy.ts.');
  const list = [...existing, name].map((entry) => `'${entry}'`).join(', ');
  return taxonomySource.replace(CATEGORIES_DECLARATION, `export const CATEGORIES = [${list}] as const;`);
}

/** Labels of the `categories` block of an interface dictionary file, by category name. */
export function readCategoryLabels(dictionarySource: string): string[] | null {
  const match = CATEGORIES_BLOCK.exec(dictionarySource);
  if (!match) return null;
  return [...match[2].matchAll(/^ {4}([a-z'-]+):/gm)].map((entry) => entry[1].replace(/'/g, ''));
}

/** An interface dictionary file with `name: 'label'` added at the end of its `categories` block. */
export function addCategoryLabel(dictionarySource: string, name: string, label: string): string {
  if (!CATEGORIES_BLOCK.test(dictionarySource)) {
    throw new Error('Cannot find the "categories: { ... }" block in the dictionary file.');
  }
  const key = name.includes('-') ? `'${name}'` : name;
  const value = `'${label.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
  return dictionarySource.replace(CATEGORIES_BLOCK, (_all, open: string, body: string, close: string) => {
    return `${open}${body}    ${key}: ${value},\n${close}`;
  });
}

/** A new sentence file with one placeholder item that the build rejects until it is replaced. */
export function buildCategorySkeleton(lang: string, category: string): string {
  const skeleton = {
    lang,
    category,
    items: [
      {
        id: `${lang}-${category}-001`,
        difficulty: 'easy',
        text: `${PLACEHOLDER_MARKER}: write one sentence here.`,
        explanation: `${PLACEHOLDER_MARKER}: one or two sentences of extra context.`,
        source: {
          title: `${PLACEHOLDER_MARKER}: Publisher: Page title`,
          url: `https://example.org/${PLACEHOLDER_MARKER}`,
        },
      },
    ],
  };
  return `${JSON.stringify(skeleton, null, 2)}\n`;
}
