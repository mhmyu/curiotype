import { computeContentStats, findWarnings, formatScores, formatStats } from '../src/lib/content-stats.ts';
import { DEFAULT_CORPUS_DIR, argValue, readCorpus } from './read-corpus.ts';

/**
 * `pnpm content:stats` prints sentence counts per language, category, and
 * difficulty, the spread of the difficulty scores, and warns when a category is
 * below the target or the easy/hard mix drifts from 50/50. Warnings do not fail
 * the command unless `--strict` is given. `--scores` also lists the score and the
 * level of every sentence (to check a label before opening a pull request).
 * `--dir <path>` reads another corpus folder.
 */
const argv = process.argv.slice(2);
const files = readCorpus(argValue(argv, '--dir') ?? DEFAULT_CORPUS_DIR);
const stats = computeContentStats(files);
const warnings = findWarnings(stats);

if (argv.includes('--scores')) {
  console.log(formatScores(files));
  console.log('');
}
console.log(formatStats(stats, warnings));
if (argv.includes('--strict') && warnings.length > 0) process.exitCode = 1;
