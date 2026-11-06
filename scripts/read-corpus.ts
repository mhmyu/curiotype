import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseCategoryRegistry } from '../src/lib/categories.ts';
import type { CategoryDefinition } from '../src/lib/categories.ts';

/** A sentence file as it is on disk, with the language and category taken from its path. */
export interface CorpusFile {
  path: string;
  lang: string;
  category: string;
  items: { id: string; difficulty: string; text: string; source: { url: string } }[];
}

/**
 * Reads every `<root>/<lang>/<category>.json` without Astro, so scripts run with
 * plain Node. Languages are the folder names, like the build discovers them.
 * Throws a readable error on unreadable JSON; content rules are the build's job.
 */
export function readCorpus(root: string): CorpusFile[] {
  const files: CorpusFile[] = [];
  const langs = readdirSync(root, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
  for (const lang of langs) {
    const names = readdirSync(join(root, lang)).filter((name) => name.endsWith('.json')).sort();
    for (const name of names) {
      const path = join(root, lang, name);
      let data: { items?: unknown };
      try {
        data = JSON.parse(readFileSync(path, 'utf8'));
      } catch (error) {
        throw new Error(`Cannot read ${path}: ${(error as Error).message}`);
      }
      if (!Array.isArray(data.items)) throw new Error(`${path} has no "items" array.`);
      files.push({ path, lang, category: name.slice(0, -'.json'.length), items: data.items });
    }
  }
  return files;
}

/** Value of `--name <value>` in `argv`, or undefined. */
export function argValue(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

export const DEFAULT_CORPUS_DIR = 'src/content/sentences';
export const DEFAULT_REGISTRY_PATH = 'src/content/categories.json';
export const DEFAULT_UI_DIR = 'src/i18n/ui';

/** Interface languages = the dictionary file names in `uiDir` (`en.ts`, `id.ts`), sorted. */
export function readInterfaceLangs(uiDir: string): string[] {
  return readdirSync(uiDir)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => file.slice(0, -'.ts'.length))
    .sort();
}

/** Reads and validates `categories.json`; the error message names the file and the entry. */
export function readCategoryRegistry(path: string, interfaceLangs: readonly string[]): CategoryDefinition[] {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read ${path}: ${(error as Error).message}`);
  }
  return parseCategoryRegistry(raw, interfaceLangs);
}
