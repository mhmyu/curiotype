import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { planAddCategory } from '../src/lib/add-category.ts';
import type { AddCategoryPlan } from '../src/lib/add-category.ts';
import { DEFAULT_CORPUS_DIR, DEFAULT_REGISTRY_PATH, DEFAULT_UI_DIR, readInterfaceLangs } from './read-corpus.ts';

/**
 * `pnpm content:add-category <name> --<ui-lang> "<label>" ... [--order N] [--langs id,en] [--dry-run]`
 *
 * Adds a sentence category the recommended way: one command writes the entry of
 * `src/content/categories.json` (a label per interface language, all required, and an `order`) and a
 * skeleton `src/content/sentences/<lang>/<name>.json` with one placeholder sentence for each
 * sentence language (`--langs` limits them; default: all). For a category that is already listed
 * (for example to add its English file), the entry is left alone and only the missing language files
 * are created; labels, when given, must match the entry. The build rejects the placeholder until it is
 * replaced. Every check runs before anything is written, and an existing file is never overwritten.
 * `--dry-run` only prints what would happen. `--dir`, `--ui` and `--registry` point at other
 * locations (tests).
 */
const argv = process.argv.slice(2);
const uiDir = optionValue('--ui') ?? DEFAULT_UI_DIR;
const corpusDir = optionValue('--dir') ?? DEFAULT_CORPUS_DIR;
const registryPath = optionValue('--registry') ?? DEFAULT_REGISTRY_PATH;

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

/** Value of `--name <value>`; a missing value is an error, not a silent default. */
function optionValue(flag: string): string | undefined {
  const index = argv.indexOf(flag);
  if (index === -1) return undefined;
  const value = argv[index + 1];
  if (value === undefined || value.startsWith('--')) fail(`The option ${flag} needs a value.`);
  return value;
}

const uiCodes = readInterfaceLangs(uiDir);
const usage = `Usage: pnpm content:add-category <name> ${uiCodes.map((code) => `--${code} "<label>"`).join(' ')} [--order N] [--langs id,en] [--dry-run]`;
const known = new Set(['--order', '--langs', '--dry-run', '--dir', '--ui', '--registry', ...uiCodes.map((code) => `--${code}`)]);
const unknownOption = argv.find((arg) => arg.startsWith('--') && !known.has(arg));
if (unknownOption) fail(`Unknown option "${unknownOption}".\n${usage}`);

const name = argv[0] && !argv[0].startsWith('--') ? argv[0] : undefined;
if (!name) fail(`Missing category name.\n${usage}`);

const labels: Record<string, string> = {};
for (const code of uiCodes) {
  const label = optionValue(`--${code}`)?.trim();
  if (label) labels[code] = label;
}

const orderText = optionValue('--order');
if (orderText !== undefined && !/^\d{1,4}$/.test(orderText)) fail('--order must be a whole number from 0 to 9999.');
const langsText = optionValue('--langs');

const sentenceLangs = readdirSync(corpusDir, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

let registrySource: string;
try {
  registrySource = readFileSync(registryPath, 'utf8');
} catch (error) {
  fail(`Cannot read ${registryPath}: ${(error as Error).message}`);
}

let plan: AddCategoryPlan;
try {
  plan = planAddCategory({
    name,
    labels,
    order: orderText === undefined ? undefined : Number(orderText),
    requestedLangs: langsText === undefined ? undefined : langsText.split(',').map((lang) => lang.trim()).filter(Boolean),
    registrySource,
    uiLangs: uiCodes,
    sentenceLangs,
    langsWithFile: sentenceLangs.filter((lang) => existsSync(join(corpusDir, lang, `${name}.json`))),
  });
} catch (error) {
  fail(`${(error as Error).message}`);
}

const filePaths = plan.files.map((file) => join(corpusDir, file.lang, `${name}.json`));
const dryRun = argv.includes('--dry-run');

if (dryRun) {
  console.log('Dry run: nothing was written.');
  if (plan.entry) console.log(`Would add this entry to ${registryPath}:\n  ${plan.entry}`);
  else console.log(`${registryPath} would stay as it is ("${name}" is already listed).`);
  console.log('Would create:');
  for (const path of filePaths) console.log(`  ${path}`);
} else {
  if (plan.registrySource !== null) writeFileSync(registryPath, plan.registrySource);
  plan.files.forEach((file, index) => writeFileSync(filePaths[index], file.content));
  console.log(plan.isNew ? `Added the category "${name}":` : `Added language files for the category "${name}":`);
  if (plan.registrySource !== null) console.log(`  ${registryPath} (new entry)`);
  for (const path of filePaths) console.log(`  ${path}`);
}
for (const note of plan.notes) console.log(`Note: ${note}`);
if (!dryRun) {
  console.log(`
Next:
  1. Replace the placeholder sentence in each new file (see CONTENT_GUIDE.md). The build fails while a REPLACE_ME placeholder is left.
  2. For a language that will not have this category yet, delete its new file.
  3. pnpm content:stats --scores && pnpm check && pnpm build`);
}
