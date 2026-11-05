/**
 * Builds the "report a wrong fact" link shown under each sentence.
 *
 * The link opens GitHub's issue form `.github/ISSUE_TEMPLATE/fact-report.yml` in the repository
 * with the sentence id already filled in. It is a plain link (no API call, no data sent from this
 * site): the visitor reviews and submits the form on GitHub themselves.
 */

/** Name of the issue form file; must match `.github/ISSUE_TEMPLATE/`. */
export const FACT_REPORT_TEMPLATE = 'fact-report.yml';

/** Id of the form field that receives the sentence id; must match `fact-report.yml`. */
export const SENTENCE_ID_FIELD = 'sentence_id';

/** Prefix of the issue title. */
export const FACT_REPORT_TITLE_PREFIX = '[Fact]';

/** Sentence ids look like `id-science-001`; this is deliberately loose (the build checks the exact format). */
const SENTENCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Returns the URL of the pre-filled report form, or `undefined` when no link should be shown:
 * the repository is not configured (`PUBLIC_REPO_URL` empty) or the id is not a plausible id.
 *
 * @param repoUrl Repository root as returned by `parseRepoUrl` (no trailing slash).
 */
export function buildFactReportUrl(
  repoUrl: string | undefined,
  sentenceId: string,
): string | undefined {
  if (!repoUrl || !SENTENCE_ID_PATTERN.test(sentenceId)) return undefined;
  const query = new URLSearchParams({
    template: FACT_REPORT_TEMPLATE,
    title: `${FACT_REPORT_TITLE_PREFIX} ${sentenceId}`,
    [SENTENCE_ID_FIELD]: sentenceId,
  });
  return `${repoUrl}/issues/new?${query.toString()}`;
}
