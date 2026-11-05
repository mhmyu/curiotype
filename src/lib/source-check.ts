/**
 * Pure logic behind `pnpm content:check-sources` (scripts/check-sources.ts).
 * Network access goes through an injected `fetch`, so everything here is unit
 * tested without a network. Imports use explicit `.ts` extensions because Node
 * runs the script directly (type stripping).
 */

/** The part of a sentence file the checker needs. */
export interface SourceFile {
  items: readonly { id: string; source: { url: string } }[];
}

/** One unique source URL and the sentences that cite it. */
export interface SourceRef {
  url: string;
  ids: string[];
}

/**
 * ok = the page answers. broken = it is gone (404, 410, or the host does not
 * exist). uncertain = a bot block, rate limit, server error, or timeout: the
 * link may be fine for people, so it is only reported as a warning.
 */
export type LinkStatus = 'ok' | 'broken' | 'uncertain';

export interface LinkResult extends SourceRef {
  status: LinkStatus;
  /** Short reason, such as "HTTP 404" or "DNS lookup failed". */
  detail: string;
}

/** Unique source URLs (exact string match) in first-seen order, each with the ids that cite it. */
export function collectSources(files: readonly SourceFile[]): SourceRef[] {
  const byUrl = new Map<string, SourceRef>();
  for (const file of files) {
    for (const item of file.items) {
      const url = item.source.url;
      const ref = byUrl.get(url) ?? { url, ids: [] };
      if (!ref.ids.includes(item.id)) ref.ids.push(item.id);
      byUrl.set(url, ref);
    }
  }
  return [...byUrl.values()];
}

/** Status of an HTTP response code. */
export function classifyHttpStatus(code: number): LinkStatus {
  if (code < 400) return 'ok';
  if (code === 404 || code === 410) return 'broken';
  return 'uncertain';
}

/** Error codes that mean the host name does not exist (EAI_AGAIN is a temporary failure, so it is not here). */
const DNS_FAILURE_CODES = ['ENOTFOUND', 'ENODATA'];

function errorCode(error: unknown): string | undefined {
  const direct = (error as { code?: unknown } | null)?.code;
  if (typeof direct === 'string') return direct;
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause?.code;
  return typeof cause === 'string' ? cause : undefined;
}

/** Status of a request that failed before any response. */
export function classifyNetworkError(error: unknown): { status: LinkStatus; detail: string } {
  const code = errorCode(error);
  if (code !== undefined && DNS_FAILURE_CODES.includes(code)) {
    return { status: 'broken', detail: 'DNS lookup failed' };
  }
  const name = (error as { name?: unknown } | null)?.name;
  if (name === 'TimeoutError' || name === 'AbortError') {
    return { status: 'uncertain', detail: 'timed out' };
  }
  return { status: 'uncertain', detail: code ? `network error (${code})` : 'network error' };
}

/** The subset of `fetch` the checker uses; the real `fetch` fits. */
export type FetchLike = (
  url: string,
  init: { method: string; signal: AbortSignal; redirect: 'follow'; headers: Record<string, string> },
) => Promise<{ status: number; body?: { cancel(): Promise<unknown> } | null }>;

export interface CheckOptions {
  fetch: FetchLike;
  /** Per request. */
  timeoutMs: number;
  /** Extra attempts after a temporary failure (5xx, timeout, network error). */
  retries: number;
  /** Delay before retry n (1-based) is `retryDelayMs * n`. */
  retryDelayMs: number;
  /** Injected so tests do not wait. */
  sleep: (ms: number) => Promise<void>;
}

const HEADERS = { 'User-Agent': 'Mozilla/5.0 (compatible; typing-link-check)', Accept: '*/*' };

type Attempt = { status: LinkStatus; detail: string; transient: boolean };

async function request(url: string, method: 'HEAD' | 'GET', options: CheckOptions): Promise<Attempt & { code?: number }> {
  try {
    const response = await options.fetch(url, {
      method,
      signal: AbortSignal.timeout(options.timeoutMs),
      redirect: 'follow',
      headers: HEADERS,
    });
    // Free the connection; the body is not needed.
    await Promise.resolve(response.body?.cancel()).catch(() => undefined);
    const status = classifyHttpStatus(response.status);
    return {
      status,
      detail: `HTTP ${response.status}`,
      transient: response.status >= 500 || response.status === 408,
      code: response.status,
    };
  } catch (error) {
    const { status, detail } = classifyNetworkError(error);
    return { status, detail, transient: status === 'uncertain' };
  }
}

async function attemptOnce(url: string, options: CheckOptions): Promise<Attempt> {
  const head = await request(url, 'HEAD', options);
  if (head.status === 'ok') return head;
  // Some servers answer HEAD wrongly (405, 403, even 404): confirm with GET, which decides.
  if (head.code === undefined) return head; // network failure: GET would fail the same way
  return request(url, 'GET', options);
}

/** Checks one URL: HEAD, then GET to confirm a failure, retrying temporary failures. */
export async function checkUrl(ref: SourceRef, options: CheckOptions): Promise<LinkResult> {
  try {
    new URL(ref.url);
  } catch {
    return { ...ref, status: 'broken', detail: 'invalid URL' };
  }
  let attempt = await attemptOnce(ref.url, options);
  for (let retry = 1; retry <= options.retries && attempt.transient; retry += 1) {
    await options.sleep(options.retryDelayMs * retry);
    attempt = await attemptOnce(ref.url, options);
  }
  return { ...ref, status: attempt.status, detail: attempt.detail };
}

/** Checks all URLs with at most `concurrency` requests in flight; results keep the input order. */
export async function checkAll(
  refs: readonly SourceRef[],
  options: CheckOptions,
  concurrency: number,
): Promise<LinkResult[]> {
  const results: LinkResult[] = new Array(refs.length);
  let next = 0;
  async function worker(): Promise<void> {
    while (next < refs.length) {
      const index = next;
      next += 1;
      results[index] = await checkUrl(refs[index], options);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, refs.length)) }, worker));
  return results;
}

export interface LinkSummary {
  total: number;
  ok: number;
  broken: number;
  uncertain: number;
}

export function summarize(results: readonly LinkResult[]): LinkSummary {
  const count = (status: LinkStatus) => results.filter((result) => result.status === status).length;
  return { total: results.length, ok: count('ok'), broken: count('broken'), uncertain: count('uncertain') };
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|');
}

function section(title: string, rows: readonly LinkResult[]): string[] {
  if (rows.length === 0) return [];
  return [
    `### ${title} (${rows.length})`,
    '',
    '| URL | Problem | Sentences |',
    '| --- | --- | --- |',
    ...rows.map((row) => `| ${escapeCell(row.url)} | ${escapeCell(row.detail)} | ${row.ids.join(', ')} |`),
    '',
  ];
}

/** Markdown report for the job summary and the GitHub issue. */
export function formatReport(results: readonly LinkResult[]): string {
  const summary = summarize(results);
  const lines = [
    '## Source link check',
    '',
    `${summary.total} unique source URLs: ${summary.ok} ok, ${summary.broken} broken, ${summary.uncertain} uncertain.`,
    '',
    ...section('Broken', results.filter((result) => result.status === 'broken')),
    ...section(
      'Uncertain (bot block, rate limit, server error, or timeout; open them in a browser)',
      results.filter((result) => result.status === 'uncertain'),
    ),
  ];
  if (summary.broken === 0) lines.push('No broken links.');
  return lines.join('\n').trimEnd() + '\n';
}
