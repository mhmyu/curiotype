import { CATEGORY_PATTERN, parseCategoryRegistry } from './categories.ts';
import { PLACEHOLDER_MARKER } from './placeholder.ts';

/**
 * Pure logic behind `pnpm content:add-category`: it takes file contents as strings and returns new
 * contents, so it is tested without touching the disk. The script in `scripts/` reads and writes
 * the files. Imports carry `.ts` extensions because the script runs under plain Node.
 */

const REGISTRY_FILE = 'src/content/categories.json';

/** Returns a message when `name` cannot be a category id, or null when it can. */
export function validateCategoryName(name: string): string | null {
  if (CATEGORY_PATTERN.test(name)) return null;
  return `"${name}" is not a valid category name: use 1 to 30 lowercase letters (a-z), with "-" between words, starting with a letter.`;
}

/** `order` of a new category: 10 above the highest one in use, rounded up to a multiple of 10. */
export function nextCategoryOrder(orders: readonly number[]): number {
  const highest = orders.reduce((max, order) => Math.max(max, order), 0);
  return Math.ceil((highest + 10) / 10) * 10;
}

/** One entry of `categories.json` on a single line, like the existing ones. */
export function formatRegistryEntry(labels: Readonly<Record<string, string>>, order: number): string {
  const text = Object.entries(labels)
    .map(([lang, label]) => `${JSON.stringify(lang)}: ${JSON.stringify(label)}`)
    .join(', ');
  return `{ "labels": { ${text} }, "order": ${order} }`;
}

/**
 * `categories.json` with a new entry at the end. Everything before the closing brace stays as it
 * is, so existing entries (and their formatting) are not touched.
 */
export function appendRegistryEntry(source: string, id: string, entry: string): string {
  const end = source.lastIndexOf('}');
  if (end === -1) throw new Error(`${REGISTRY_FILE} has no closing "}".`);
  const head = source.slice(0, end).trimEnd();
  const comma = head.endsWith('{') ? '' : ',';
  return `${head}${comma}\n  ${JSON.stringify(id)}: ${entry}\n}\n`;
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

export interface AddCategoryInput {
  name: string;
  /** Labels given on the command line, by interface language (may be partial or empty). */
  labels: Readonly<Record<string, string>>;
  /** From `--order`; ignored when the category is already listed. */
  order?: number;
  /** From `--langs`; undefined means every sentence language that has no file yet. */
  requestedLangs?: readonly string[];
  /** Text of `categories.json`. */
  registrySource: string;
  /** Interface languages (the dictionary file names). */
  uiLangs: readonly string[];
  /** Sentence languages (the folder names). */
  sentenceLangs: readonly string[];
  /** Sentence languages that already have `<name>.json`. */
  langsWithFile: readonly string[];
}

export interface AddCategoryPlan {
  /** True when `categories.json` gets a new entry. */
  isNew: boolean;
  /** The new entry as one line (`"geography": { ... }`), or null when the category is already listed. */
  entry: string | null;
  /** New text of `categories.json`, or null when it does not change. */
  registrySource: string | null;
  /** Sentence files to create, with their content. */
  files: { lang: string; content: string }[];
  /** Remarks for the person running the command. */
  notes: string[];
}

function labelOrder(raw: Record<string, unknown>, uiLangs: readonly string[]): string[] {
  const first = Object.values(raw)[0] as { labels?: Record<string, unknown> } | undefined;
  const fromFile = Object.keys(first?.labels ?? {}).filter((lang) => uiLangs.includes(lang));
  return [...fromFile, ...uiLangs.filter((lang) => !fromFile.includes(lang))];
}

/**
 * Decides everything the command will do, or throws an Error saying why it cannot. Nothing is
 * written by this function, and the script writes only after it returned, so a failed check never
 * leaves a half-done change.
 */
export function planAddCategory(input: AddCategoryInput): AddCategoryPlan {
  const { name, labels, uiLangs, sentenceLangs, langsWithFile } = input;
  const nameProblem = validateCategoryName(name);
  if (nameProblem) throw new Error(nameProblem);

  let raw: unknown;
  try {
    raw = JSON.parse(input.registrySource);
  } catch (error) {
    throw new Error(`${REGISTRY_FILE} is not valid JSON: ${(error as Error).message}`);
  }
  const registry = parseCategoryRegistry(raw, uiLangs); // throws, naming the entry
  const rawEntries = raw as Record<string, unknown>;

  if (sentenceLangs.length === 0) throw new Error('No sentence languages found (a folder per language under src/content/sentences/).');
  const requested = input.requestedLangs ? [...new Set(input.requestedLangs)] : undefined;
  if (requested) {
    if (requested.length === 0) throw new Error('--langs needs at least one language.');
    const unknown = requested.filter((lang) => !sentenceLangs.includes(lang));
    if (unknown.length > 0) {
      throw new Error(`Unknown sentence language(s): ${unknown.join(', ')}. Available: ${sentenceLangs.join(', ')}.`);
    }
  }
  for (const code of Object.keys(labels)) {
    if (!uiLangs.includes(code)) throw new Error(`"${code}" is not an interface language (${uiLangs.join(', ')}).`);
  }

  const existing = registry.find((definition) => definition.id === name);
  const notes: string[] = [];
  let entry: string | null = null;
  let registrySource: string | null = null;

  if (existing) {
    for (const [code, label] of Object.entries(labels)) {
      if (label !== existing.labels[code]) {
        throw new Error(
          `"${name}" is already listed in ${REGISTRY_FILE} with the "${code}" label "${existing.labels[code]}", not "${label}". Use the same label or leave the option out.`,
        );
      }
    }
    if (input.order !== undefined) {
      notes.push(`--order is ignored: "${name}" is already listed (order ${existing.order}).`);
    }
  } else {
    for (const code of uiLangs) {
      if (!labels[code]) {
        throw new Error(`Missing the label for the "${code}" interface language (a new category needs one per language).`);
      }
    }
    const order = input.order ?? nextCategoryOrder(registry.map((definition) => definition.order));
    const ordered = Object.fromEntries(labelOrder(rawEntries, uiLangs).map((code) => [code, labels[code]]));
    const text = formatRegistryEntry(ordered, order);
    registrySource = appendRegistryEntry(input.registrySource, name, text);
    entry = `${JSON.stringify(name)}: ${text}`;
    // The labels and the order go through the same rules as the build applies to the file.
    parseCategoryRegistry(JSON.parse(registrySource), uiLangs);
  }

  let langs: string[];
  if (requested) {
    const taken = requested.filter((lang) => langsWithFile.includes(lang));
    if (taken.length > 0) {
      throw new Error(`${taken.map((lang) => `${lang}/${name}.json`).join(', ')} already exists; nothing was changed.`);
    }
    langs = requested;
  } else if (existing) {
    langs = sentenceLangs.filter((lang) => !langsWithFile.includes(lang));
    if (langs.length === 0) {
      throw new Error(`Nothing to add: every sentence language already has "${name}.json".`);
    }
    if (langsWithFile.length > 0) notes.push(`Skipped the languages that already have a file: ${langsWithFile.join(', ')}.`);
  } else {
    if (langsWithFile.length > 0) {
      throw new Error(`${langsWithFile.map((lang) => `${lang}/${name}.json`).join(', ')} already exists; nothing was changed.`);
    }
    langs = [...sentenceLangs];
  }

  return {
    isNew: !existing,
    entry,
    registrySource,
    files: langs.map((lang) => ({ lang, content: buildCategorySkeleton(lang, name) })),
    notes,
  };
}
