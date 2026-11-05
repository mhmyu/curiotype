import { appendFileSync, writeFileSync } from 'node:fs';
import { collectSources, checkAll, formatReport, summarize } from '../src/lib/source-check.ts';
import { DEFAULT_CORPUS_DIR, argValue, readCorpus } from './read-corpus.ts';

/**
 * `pnpm content:check-sources` requests every unique source URL of the corpus.
 * 404, 410, and unknown hosts are "broken" (exit code 1); bot blocks, rate
 * limits, server errors, and timeouts are only "uncertain" warnings.
 *
 * Options: `--report <file>` writes the Markdown report (the link-check workflow
 * turns it into an issue); `--dir <path>` reads another corpus folder.
 * In GitHub Actions the report is also added to the job summary.
 */
const argv = process.argv.slice(2);
const refs = collectSources(readCorpus(argValue(argv, '--dir') ?? DEFAULT_CORPUS_DIR));
console.log(`Checking ${refs.length} unique source URLs...`);

const results = await checkAll(
  refs,
  { fetch, timeoutMs: 15_000, retries: 2, retryDelayMs: 2_000, sleep: (ms) => new Promise((done) => setTimeout(done, ms)) },
  4,
);
const report = formatReport(results);

console.log(report);
const reportPath = argValue(argv, '--report');
if (reportPath) writeFileSync(reportPath, report);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, report);
if (summarize(results).broken > 0) process.exitCode = 1;
