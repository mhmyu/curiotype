import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  addCategoryLabel,
  addCategoryToTaxonomy,
  buildCategorySkeleton,
  readCategories,
  validateCategoryName,
} from '../src/lib/add-category.ts';
import { DEFAULT_CORPUS_DIR, argValue } from './read-corpus.ts';

/**
 * `pnpm content:add-category <name> --<ui-lang> "<label>" ... [--langs id,en]`
 *
 * Adds a sentence category: appends it to `CATEGORIES` in `src/lib/taxonomy.ts`, adds its label to
 * every interface dictionary in `src/i18n/ui/` (one `--<code> "<label>"` option per dictionary,
 * all required), and creates `src/content/sentences/<lang>/<name>.json` with one placeholder
 * sentence for each sentence language (`--langs` limits them; default: all). The build rejects the
 * placeholder until it is replaced. Nothing is written unless every check passes, and existing
 * files are never overwritten. `--dir`, `--taxonomy` and `--ui` point at other locations (tests).
 */
const argv = process.argv.slice(2);
const name = argv[0] && !argv[0].startsWith('--') ? argv[0] : undefined;
const corpusDir = argValue(argv, '--dir') ?? DEFAULT_CORPUS_DIR;
const taxonomyPath = argValue(argv, '--taxonomy') ?? 'src/lib/taxonomy.ts';
const uiDir = argValue(argv, '--ui') ?? 'src/i18n/ui';

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

const uiCodes = readdirSync(uiDir)
  .filter((file) => file.endsWith('.ts'))
  .map((file) => file.slice(0, -'.ts'.length))
  .sort();
const usage = `Usage: pnpm content:add-category <name> ${uiCodes.map((code) => `--${code} "<label>"`).join(' ')} [--langs id,en]`;
if (!name) fail(`Missing category name.\n${usage}`);

const taxonomy = readFileSync(taxonomyPath, 'utf8');
const existing = readCategories(taxonomy);
if (!existing) fail(`Cannot find CATEGORIES in ${taxonomyPath}.`);
const nameProblem = validateCategoryName(name, existing);
if (nameProblem) fail(nameProblem);

const labels: Record<string, string> = {};
for (const code of uiCodes) {
  const label = argValue(argv, `--${code}`)?.trim();
  if (!label) fail(`Missing the label for the "${code}" interface language.\n${usage}`);
  labels[code] = label;
}

const allLangs = readdirSync(corpusDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();
const requested = argValue(argv, '--langs');
const langs = requested ? requested.split(',').map((lang) => lang.trim()) : allLangs;
const unknown = langs.filter((lang) => !allLangs.includes(lang));
if (unknown.length > 0) fail(`Unknown sentence language(s): ${unknown.join(', ')}. Available: ${allLangs.join(', ')}.`);

// Compute everything first, write only when nothing failed.
const writes: { path: string; content: string }[] = [{ path: taxonomyPath, content: addCategoryToTaxonomy(taxonomy, name) }];
for (const code of uiCodes) {
  const path = join(uiDir, `${code}.ts`);
  writes.push({ path, content: addCategoryLabel(readFileSync(path, 'utf8'), name, labels[code]) });
}
for (const lang of langs) {
  const path = join(corpusDir, lang, `${name}.json`);
  if (existsSync(path)) fail(`${path} already exists; nothing was changed.`);
  writes.push({ path, content: buildCategorySkeleton(lang, name) });
}
for (const { path, content } of writes) writeFileSync(path, content);

console.log(`Added the category "${name}":`);
for (const { path } of writes) console.log(`  ${path}`);
console.log(`
Next:
  1. Replace the placeholder sentence in each new file (see CONTENT_GUIDE.md). The build fails while a REPLACE_ME placeholder is left.
  2. For a language that will not have this category yet, delete its new file.
  3. pnpm content:stats --scores && pnpm check && pnpm build`);
