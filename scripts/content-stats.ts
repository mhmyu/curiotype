import {
  computeContentDetails,
  computeContentStats,
  findCategoryNotes,
  findSourceWarnings,
  findWarnings,
  formatScores,
  formatStats,
} from '../src/lib/content-stats.ts';
import {
  DEFAULT_CORPUS_DIR,
  DEFAULT_REGISTRY_PATH,
  DEFAULT_UI_DIR,
  argValue,
  readCategoryRegistry,
  readCorpus,
  readInterfaceLangs,
} from './read-corpus.ts';

/**
 * `pnpm content:stats` prints sentence counts per language, category, and
 * difficulty, the spread of the difficulty scores, the length of text and explanation against
 * their limits, how the sources, digits and letters are spread, and warns when a category is
 * below the target, the easy/hard mix drifts from 50/50, a sentence file uses a
 * category that `src/content/categories.json` does not list, or a listed
 * category has no file. A category that exists in only some languages is
 * reported as a note, not a warning. Warnings do not fail the command unless
 * `--strict` is given. `--scores` also lists the score and the level of every
 * sentence (to check a label before opening a pull request).
 * `--dir`, `--registry` and `--ui` point at other locations (tests).
 */
const argv = process.argv.slice(2);
const files = readCorpus(argValue(argv, '--dir') ?? DEFAULT_CORPUS_DIR);
let registeredIds: string[];
try {
  const registry = readCategoryRegistry(
    argValue(argv, '--registry') ?? DEFAULT_REGISTRY_PATH,
    readInterfaceLangs(argValue(argv, '--ui') ?? DEFAULT_UI_DIR),
  );
  registeredIds = registry.map((definition) => definition.id);
} catch (error) {
  console.error(`Error: ${(error as Error).message}`);
  process.exit(1);
}
const stats = computeContentStats(files, registeredIds);
const warnings = [...findWarnings(stats, registeredIds), ...findSourceWarnings(files)];
const details = computeContentDetails(files);
const notes = findCategoryNotes(stats);

if (argv.includes('--scores')) {
  console.log(formatScores(files));
  console.log('');
}
console.log(formatStats(stats, warnings, notes, details));
if (argv.includes('--strict') && warnings.length > 0) process.exitCode = 1;
