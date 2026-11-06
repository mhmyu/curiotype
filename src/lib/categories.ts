/**
 * Sentence categories are discovered from the content: a category is the file name of
 * `src/content/sentences/<lang>/<category>.json`, and its labels and order are written once in
 * `src/content/categories.json`. This module is pure (no imports, no Astro) so that the build,
 * the interface and Node scripts can all load it.
 */

/** Category ids: lowercase letters and "-", starting with a letter, 1 to 30 characters. */
export const CATEGORY_PATTERN = /^[a-z][a-z-]{0,29}$/;

/** Order used when an entry of `categories.json` has no `order`. */
export const DEFAULT_CATEGORY_ORDER = 1000;
const MAX_ORDER = 9999;
const MAX_LABEL_LENGTH = 30;
const REGISTRY_FILE = 'src/content/categories.json';

export function isCategoryId(value: unknown): value is string {
  return typeof value === 'string' && CATEGORY_PATTERN.test(value);
}

export interface CategoryDefinition {
  id: string;
  /** Label per interface language (`id`, `en`, ...). */
  labels: Record<string, string>;
  order: number;
}

/** One sentence file as far as categories are concerned. `path` is only used in messages. */
export interface CategoryFile {
  path: string;
  lang: string;
  category: string;
}

export interface BuiltCategories {
  /** Categories that have a file in a sentence language, sorted by order, then id. */
  byLang: Record<string, CategoryDefinition[]>;
  /** Registered categories that have no sentence file at all (a warning, not an error). */
  unused: string[];
}

function compareDefinitions(a: CategoryDefinition, b: CategoryDefinition): number {
  return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Validates the content of `categories.json` and returns the definitions sorted by order, then id.
 * Throws an error naming the entry and the problem.
 */
export function parseCategoryRegistry(
  raw: unknown,
  interfaceLangs: readonly string[],
): CategoryDefinition[] {
  if (!isPlainObject(raw)) {
    throw new Error(`${REGISTRY_FILE} must be an object whose keys are category ids.`);
  }
  const definitions: CategoryDefinition[] = [];

  for (const [id, entry] of Object.entries(raw)) {
    if (!CATEGORY_PATTERN.test(id)) {
      throw new Error(
        `${REGISTRY_FILE}: "${id}" is not a valid category id. Use lowercase letters and "-", starting with a letter (1 to 30 characters).`,
      );
    }
    if (!isPlainObject(entry)) {
      throw new Error(`${REGISTRY_FILE}: entry "${id}" must be an object with "labels" and optional "order".`);
    }
    const { labels, order } = entry;
    if (!isPlainObject(labels)) {
      throw new Error(`${REGISTRY_FILE}: entry "${id}" needs a "labels" object.`);
    }
    for (const lang of interfaceLangs) {
      if (!(lang in labels)) {
        throw new Error(`${REGISTRY_FILE}: entry "${id}" has no label for interface language "${lang}".`);
      }
    }
    for (const lang of Object.keys(labels)) {
      if (!interfaceLangs.includes(lang)) {
        throw new Error(
          `${REGISTRY_FILE}: entry "${id}" has a label for "${lang}", which is not an interface language (${interfaceLangs.join(', ')}).`,
        );
      }
    }
    for (const lang of interfaceLangs) {
      const label = labels[lang];
      if (typeof label !== 'string' || label !== label.trim() || label.length < 1 || label.length > MAX_LABEL_LENGTH) {
        throw new Error(
          `${REGISTRY_FILE}: the "${lang}" label of "${id}" must be text of 1 to ${MAX_LABEL_LENGTH} characters without spaces at the ends.`,
        );
      }
    }
    if (order !== undefined && (!Number.isInteger(order) || (order as number) < 0 || (order as number) > MAX_ORDER)) {
      throw new Error(`${REGISTRY_FILE}: "order" of "${id}" must be a whole number from 0 to ${MAX_ORDER}.`);
    }
    definitions.push({
      id,
      labels: Object.fromEntries(interfaceLangs.map((lang) => [lang, labels[lang] as string])),
      order: (order as number | undefined) ?? DEFAULT_CATEGORY_ORDER,
    });
  }
  return definitions.sort(compareDefinitions);
}

/**
 * Groups the registered categories by sentence language, using the files that exist.
 * Throws when a file uses a category that is not registered (this catches a typo in a file name).
 */
export function buildCategories(
  registry: readonly CategoryDefinition[],
  files: readonly CategoryFile[],
): BuiltCategories {
  const byId = new Map(registry.map((definition) => [definition.id, definition]));
  const idsByLang = new Map<string, Set<string>>();
  const used = new Set<string>();

  for (const file of files) {
    if (!byId.has(file.category)) {
      throw new Error(
        `Category "${file.category}" (${file.path}) has no entry in ${REGISTRY_FILE}. Add one, or fix the file name if it is a typo.`,
      );
    }
    used.add(file.category);
    if (!idsByLang.has(file.lang)) idsByLang.set(file.lang, new Set());
    idsByLang.get(file.lang)!.add(file.category);
  }

  const byLang: Record<string, CategoryDefinition[]> = {};
  for (const [lang, ids] of idsByLang) {
    byLang[lang] = registry.filter((definition) => ids.has(definition.id)); // registry is sorted
  }
  return { byLang, unused: registry.filter((d) => !used.has(d.id)).map((d) => d.id) };
}

/** Label in the interface language; falls back to the id written as words, never empty. */
export function getCategoryLabel(
  definitions: readonly CategoryDefinition[],
  id: string,
  uiLang: string,
): string {
  const label = definitions.find((definition) => definition.id === id)?.labels[uiLang];
  if (label) return label;
  const words = id.replace(/-/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : id;
}
