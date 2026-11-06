<script lang="ts">
  import { onMount } from 'svelte';
  import { MAX_HISTORY_ENTRIES, loadHistory, loadPersonalBests } from '@/features/history/history';
  import type { HistoryEntry, PersonalBests } from '@/features/history/history';
  import { loadSeen } from '@/features/seen/seen';
  import { loadKeyStats } from '@/features/typing-engine/key-stats';
  import type { KeyStats } from '@/features/typing-engine/key-stats';
  import ContentLangSwitch from '@/features/settings/ContentLangSwitch.svelte';
  import { settingsStore } from '@/features/settings/settings.svelte';
  import type { ContentLang, Language } from '@/i18n/config';
  import type { Dictionary } from '@/i18n/types';
  import { resolveContentLang } from '@/lib/content-langs';
  import { getCategoryLabel } from '@/lib/categories';
  import type { CategoryDefinition } from '@/lib/categories';
  import { listSelectableContentLangs } from '@/config/languages';
  import { getStorage } from '@/lib/storage';
  import type { Sentence } from '@/lib/types';
  import { getModeLabel } from '@/features/test-modes/label';
  import {
    bucketValue,
    computeCategoryAccuracy,
    computeCoverage,
    computeTotals,
    filterByContentLang,
    getTrend,
    latestBucket,
    listBuckets,
    listPersonalBests,
    percentOf,
    splitDuration,
    summarizeTrend,
  } from './stats';
  import type { Bucket } from './stats';
  import TrendChart from './TrendChart.svelte';
  import {
    MIN_KEY_ATTEMPTS,
    buildHeatmap,
    getKeyboardRows,
    formatKey,
    hasKeyData,
    listWeakKeys,
  } from './weak-keys';
  import type { HeatLevel, HeatmapKey } from './weak-keys';

  interface Props {
    lang: Language;
    ui: Dictionary;
    /** Sentence languages found under src/content/sentences/. */
    contentLangs: readonly ContentLang[];
    /** Categories per sentence language (labels and order from src/content/categories.json). */
    categories: Record<string, CategoryDefinition[]>;
    /** Sentence language used until the user chooses one (decided at build time). */
    initialContentLang: ContentLang;
  }

  let { lang, ui, contentLangs, categories, initialContentLang }: Props = $props();

  type Status = 'loading' | 'ready';
  type CorpusStatus = 'loading' | 'error' | 'ready';

  // The statistics follow the sentence language, like the typing test (same setting).
  const contentLang = $derived<ContentLang>(
    resolveContentLang(settingsStore.current.contentLang ?? initialContentLang, contentLangs),
  );
  // The select lists the launched languages (and every language in `pnpm dev`); a draft language
  // that is in use stays listed. `contentLangs` stays complete: it is what resolution accepts.
  const selectableContentLangs = $derived(
    listSelectableContentLangs(contentLangs, { dev: import.meta.env.DEV, active: contentLang }),
  );

  let status = $state<Status>('loading');
  let corpusStatus = $state<CorpusStatus>('loading');
  let history = $state.raw<HistoryEntry[]>([]);
  let personalBests = $state.raw<PersonalBests>({});
  let seenIds = $state.raw<string[]>([]);
  let keyStats = $state.raw<KeyStats>({});
  let sentences = $state.raw<Sentence[]>([]);
  // Value of the mode chosen for the trend; null = the mode of the latest test.
  let selectedBucket = $state<string | null>(null);

  // Sentence files already fetched, by language, so switching back needs no request.
  const sentenceCache = new Map<ContentLang, Sentence[]>();
  // Identifies the latest load; an older one that finishes late is ignored.
  let loadToken = 0;

  const entries = $derived(filterByContentLang(history, contentLang));
  const totals = $derived(computeTotals(entries));
  const buckets = $derived(listBuckets(entries));
  const activeBucket = $derived<Bucket | null>(
    buckets.find((bucket) => bucketValue(bucket) === selectedBucket) ?? latestBucket(entries),
  );
  const trend = $derived(activeBucket ? getTrend(entries, activeBucket) : []);
  const trendSummary = $derived(summarizeTrend(trend));
  // Rows follow the categories of the active sentence language, in the order of the list.
  const categoryDefs = $derived(categories[contentLang] ?? []);
  const categoryLabel = (id: string) => getCategoryLabel(categoryDefs, id, lang);
  const categoryIds = $derived(categoryDefs.map((definition) => definition.id));
  const categoryAccuracy = $derived(computeCategoryAccuracy(entries, categoryIds));
  const heatmap = $derived(buildHeatmap(keyStats, getKeyboardRows(contentLang)));
  const weakKeys = $derived(listWeakKeys(keyStats));
  // Key counts are kept apart from the history, so they can exist without tests in it.
  const showKeys = $derived(entries.length > 0 || hasKeyData(keyStats));
  const bests = $derived(listPersonalBests(personalBests, contentLang));
  const coverage = $derived(
    corpusStatus === 'ready' ? computeCoverage(sentences, seenIds, categoryIds) : null,
  );

  const numberFormat = $derived(new Intl.NumberFormat(lang, { maximumFractionDigits: 1 }));

  function formatNumber(value: number): string {
    return numberFormat.format(value);
  }

  function formatDuration(seconds: number): string {
    return splitDuration(seconds)
      .map(({ unit, value }) =>
        new Intl.NumberFormat(lang, { style: 'unit', unit, unitDisplay: 'short' }).format(value),
      )
      .join(' ');
  }

  function bucketLabel(bucket: Bucket): string {
    return getModeLabel(ui, bucket);
  }

  // Cell look per heat level. Whole class names, so Tailwind finds them. The number inside the
  // cell carries the value; the fill only helps to scan the keyboard.
  const HEAT_CLASSES: Record<HeatLevel, string> = {
    0: 'border-border bg-surface',
    1: 'border-border bg-error/10',
    2: 'border-error bg-error/25',
    3: 'border-error bg-error/45',
  };

  function cellClass(cell: HeatmapKey): string {
    return cell.level === null
      ? 'border-dashed border-border text-text-muted'
      : `${HEAT_CLASSES[cell.level]} text-typing-correct`;
  }

  function cellLabel(cell: HeatmapKey): string {
    const key = formatKey(cell.key);
    return cell.percent === null
      ? fill(ui.stats.keyCellAriaNoData, { key, attempts: cell.attempts, min: MIN_KEY_ATTEMPTS })
      : fill(ui.stats.keyCellAria, { key, percent: cell.percent, attempts: cell.attempts });
  }

  function fill(template: string, values: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) =>
      key in values ? String(values[key]) : match,
    );
  }

  const trendDescription = $derived(
    trendSummary
      ? fill(ui.stats.trendAria, {
          count: trend.length,
          latest: formatNumber(trendSummary.latest),
          average: formatNumber(trendSummary.average),
          best: formatNumber(trendSummary.best),
        })
      : '',
  );

  async function fetchSentences(code: ContentLang): Promise<Sentence[]> {
    const cached = sentenceCache.get(code);
    if (cached) return cached;
    const response = await fetch(`/data/${code}/sentences.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const loaded = (await response.json()) as Sentence[];
    sentenceCache.set(code, loaded);
    return loaded;
  }

  async function load(code: ContentLang) {
    const token = ++loadToken;
    status = 'loading';
    corpusStatus = 'loading';
    selectedBucket = null;

    // Stored data first: the page is useful without the sentence file.
    try {
      const storage = getStorage();
      const [savedHistory, savedBests, savedSeen, savedKeys] = await Promise.all([
        loadHistory(storage),
        loadPersonalBests(storage),
        loadSeen(storage, code),
        loadKeyStats(storage, code),
      ]);
      if (token !== loadToken) return;
      history = savedHistory;
      personalBests = savedBests;
      seenIds = savedSeen;
      keyStats = savedKeys;
    } catch {
      // Storage may be blocked: then nothing was saved, so the page shows no data.
      if (token !== loadToken) return;
      history = [];
      personalBests = {};
      seenIds = [];
      keyStats = {};
    }
    status = 'ready';

    try {
      const loaded = await fetchSentences(code);
      if (token !== loadToken) return;
      sentences = loaded;
      corpusStatus = 'ready';
    } catch {
      if (token === loadToken) corpusStatus = 'error';
    }
  }

  function selectContentLang(code: ContentLang) {
    if (code === contentLang) return;
    void settingsStore.update({ contentLang: code });
    void load(code);
  }

  onMount(() => {
    void (async () => {
      // The saved language decides which statistics to show, so wait for the settings first
      // (init never rejects: on a storage error the defaults stay).
      await settingsStore.init();
      await load(contentLang);
    })();
  });
</script>

{#snippet bar(percent: number)}
  <!-- Decorative: the numbers next to it carry the value. -->
  <div class="h-2 w-full overflow-hidden rounded-full bg-border" aria-hidden="true">
    <div class="h-full rounded-full bg-accent" style:width="{percent}%"></div>
  </div>
{/snippet}

<div class="flex flex-col gap-8">
  {#if selectableContentLangs.length > 1}
    <ContentLangSwitch
      codes={selectableContentLangs}
      value={contentLang}
      {lang}
      label={ui.test.contentLangLabel}
      onSelect={selectContentLang}
    />
  {/if}

  {#if status === 'loading'}
    <p class="text-body-long text-text-muted" role="status">{ui.test.loading}</p>
  {:else}
    <section class="flex flex-col gap-3" aria-labelledby="stats-totals">
      <h2 id="stats-totals" class="text-h2">{ui.stats.totalsTitle}</h2>
      <dl class="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div class="card flex flex-col gap-1 px-4 py-3">
          <dt class="text-caption text-text-muted">{ui.stats.totalTests}</dt>
          <dd class="font-heading text-figure tabular-nums" data-testid="stat-tests">
            {formatNumber(totals.tests)}
          </dd>
        </div>
        <div class="card flex flex-col gap-1 px-4 py-3">
          <dt class="text-caption text-text-muted">{ui.stats.totalTime}</dt>
          <dd class="font-heading text-figure tabular-nums" data-testid="stat-time">
            {formatDuration(totals.typingSeconds)}
          </dd>
        </div>
        <div class="card flex flex-col gap-1 px-4 py-3">
          <dt class="text-caption text-text-muted">{ui.stats.sentencesLearned}</dt>
          <dd class="font-heading text-figure tabular-nums" data-testid="stat-learned">
            {#if coverage}
              {formatNumber(coverage.seen)}
            {:else if corpusStatus === 'error'}
              {formatNumber(seenIds.length)}
            {:else}
              …
            {/if}
          </dd>
        </div>
      </dl>
      <p class="text-caption text-text-muted">
        {fill(ui.stats.historyNote, { limit: MAX_HISTORY_ENTRIES })}
      </p>
    </section>

    {#if entries.length === 0}
      <p class="text-body-long text-text-muted" role="status" data-testid="stats-empty">
        {ui.stats.emptyHistory}
      </p>
    {:else}
      <section class="flex flex-col gap-3" aria-labelledby="stats-trend">
        <h2 id="stats-trend" class="text-h2">{ui.stats.trendTitle}</h2>

        {#if buckets.length > 1}
          <label class="flex flex-col gap-1 text-caption text-text-muted sm:w-fit">
            <span>{ui.stats.bucketLabel}</span>
            <select
              class="field"
              value={activeBucket ? bucketValue(activeBucket) : ''}
              onchange={(event) => (selectedBucket = event.currentTarget.value)}
            >
              {#each buckets as bucket (bucketValue(bucket))}
                <option value={bucketValue(bucket)}>{bucketLabel(bucket)}</option>
              {/each}
            </select>
          </label>
        {:else if activeBucket}
          <p class="text-caption text-text-muted">{bucketLabel(activeBucket)}</p>
        {/if}

        {#if trendSummary}
          <dl class="grid grid-cols-3 gap-3" data-testid="trend-summary">
            <div class="card flex flex-col gap-1 px-3 py-3">
              <dt class="text-caption text-text-muted">{ui.stats.latest}</dt>
              <dd class="font-heading text-h2 tabular-nums" data-testid="trend-latest">
                {formatNumber(trendSummary.latest)}
              </dd>
            </div>
            <div class="card flex flex-col gap-1 px-3 py-3">
              <dt class="text-caption text-text-muted">{ui.stats.average}</dt>
              <dd class="font-heading text-h2 tabular-nums" data-testid="trend-average">
                {formatNumber(trendSummary.average)}
              </dd>
            </div>
            <div class="card flex flex-col gap-1 px-3 py-3">
              <dt class="text-caption text-text-muted">{ui.stats.best}</dt>
              <dd class="font-heading text-h2 tabular-nums" data-testid="trend-best">
                {formatNumber(trendSummary.best)}
              </dd>
            </div>
          </dl>
          <div class="card p-4">
            <TrendChart
              points={trend}
              caption={fill(ui.stats.trendCaption, { count: trend.length })}
              description={trendDescription}
            />
          </div>
        {/if}
      </section>

      <section class="flex flex-col gap-3" aria-labelledby="stats-accuracy">
        <h2 id="stats-accuracy" class="text-h2">{ui.stats.accuracyTitle}</h2>
        <ul class="flex flex-col gap-3">
          {#each categoryAccuracy as row (row.category)}
            <li class="card flex flex-col gap-2 px-4 py-3" data-testid="accuracy-{row.category}">
              <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span class="text-ui">{categoryLabel(row.category)}</span>
                {#if row.accuracy === null}
                  <span class="text-caption text-text-muted">{ui.stats.noData}</span>
                {:else}
                  <span class="tabular-nums">
                    <span class="font-semibold">{formatNumber(row.accuracy)}%</span>
                    <span class="text-caption text-text-muted">
                      · {fill(ui.stats.accuracyChars, { count: formatNumber(row.chars) })}
                    </span>
                  </span>
                {/if}
              </div>
              {@render bar(row.accuracy ?? 0)}
            </li>
          {/each}
        </ul>
        <p class="text-caption text-text-muted">{ui.stats.accuracyNote}</p>
      </section>
    {/if}

    {#if showKeys}
      <section class="flex flex-col gap-3" aria-labelledby="stats-keys">
        <h2 id="stats-keys" class="text-h2">{ui.stats.keysTitle}</h2>
        <p class="text-body-long text-text-muted">
          {fill(ui.stats.keysIntro, { min: MIN_KEY_ATTEMPTS })}
        </p>

        <div class="card p-3" role="group" aria-label={ui.stats.keysHeatmapLabel} data-testid="key-heatmap">
          <div class="flex flex-col gap-1">
            {#each heatmap as row, rowIndex (rowIndex)}
              <!-- Each row is as wide as its share of ten keys, so the rows are staggered like a keyboard. -->
              <div
                class="mx-auto grid gap-1"
                style:width="{row.length * 10}%"
                style:grid-template-columns="repeat({row.length}, minmax(0, 1fr))"
              >
                {#each row as cell (cell.key)}
                  <span
                    role="img"
                    aria-label={cellLabel(cell)}
                    data-testid="key-{cell.key}"
                    data-level={cell.level ?? 'none'}
                    class="flex min-h-12 flex-col items-center justify-center rounded-container border-2 text-ui leading-tight {cellClass(cell)}"
                  >
                    <span aria-hidden="true">{formatKey(cell.key)}</span>
                    <span class="text-caption tabular-nums" aria-hidden="true">
                      {cell.percent ?? '–'}
                    </span>
                  </span>
                {/each}
              </div>
            {/each}
          </div>
        </div>
        <p class="text-caption text-text-muted">
          {fill(ui.stats.keysLegend, { min: MIN_KEY_ATTEMPTS })}
        </p>

        <h3 class="text-h3">{ui.stats.keysWeakTitle}</h3>
        {#if weakKeys.length === 0}
          <p class="text-body-long text-text-muted" data-testid="weak-keys-empty">
            {fill(ui.stats.keysWeakEmpty, { min: MIN_KEY_ATTEMPTS })}
          </p>
        {:else}
          <ol class="flex flex-col gap-3" data-testid="weak-keys">
            {#each weakKeys as weak (weak.key)}
              <li class="card flex items-center gap-4 px-4 py-3" data-testid="weak-key-{weak.key}">
                <span
                  class="flex size-11 shrink-0 items-center justify-center rounded-container border-2 border-border bg-surface font-typing text-typing-sm text-typing-correct"
                  lang={contentLang}
                  aria-hidden="true"
                >
                  {formatKey(weak.key)}
                </span>
                <div class="flex min-w-0 flex-col">
                  <span class="font-semibold tabular-nums">
                    {formatNumber(weak.rate * 100)}%
                    <span class="sr-only">{formatKey(weak.key)}</span>
                  </span>
                  <span class="text-caption text-text-muted">
                    {fill(ui.stats.keysWeakRow, {
                      errors: formatNumber(weak.errors),
                      attempts: formatNumber(weak.attempts),
                    })}
                  </span>
                </div>
              </li>
            {/each}
          </ol>
        {/if}
        <p class="text-caption text-text-muted">{ui.stats.keysNote}</p>
      </section>
    {/if}

    <section class="flex flex-col gap-3" aria-labelledby="stats-coverage">
      <h2 id="stats-coverage" class="text-h2">{ui.stats.coverageTitle}</h2>
      {#if corpusStatus === 'loading'}
        <p class="text-body-long text-text-muted" role="status">{ui.test.loading}</p>
      {:else if corpusStatus === 'error' || !coverage}
        <p class="text-body-long text-error" role="alert">{ui.test.loadError}</p>
      {:else}
        <p class="text-body-long" data-testid="coverage-total">
          {fill(ui.stats.coverageTotal, {
            seen: formatNumber(coverage.seen),
            total: formatNumber(coverage.total),
            percent: percentOf(coverage.seen, coverage.total),
          })}
        </p>
        <ul class="flex flex-col gap-3">
          {#each coverage.byCategory as row (row.category)}
            <li class="card flex flex-col gap-2 px-4 py-3" data-testid="coverage-{row.category}">
              <div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <span class="text-ui">{categoryLabel(row.category)}</span>
                {#if row.total === 0}
                  <span class="text-caption text-text-muted">{ui.stats.noSentences}</span>
                {:else}
                  <span class="tabular-nums">
                    <span class="font-semibold">
                      {fill(ui.stats.coverageRow, {
                        seen: formatNumber(row.seen),
                        total: formatNumber(row.total),
                      })}
                    </span>
                    <span class="text-caption text-text-muted">· {percentOf(row.seen, row.total)}%</span>
                  </span>
                {/if}
              </div>
              {@render bar(percentOf(row.seen, row.total))}
            </li>
          {/each}
        </ul>
      {/if}
    </section>

    <section class="flex flex-col gap-3" aria-labelledby="stats-bests">
      <h2 id="stats-bests" class="text-h2">{ui.history.personalBests}</h2>
      {#if bests.length === 0}
        <p class="text-body-long text-text-muted">{ui.stats.noBests}</p>
      {:else}
        <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2" data-testid="stats-bests">
          {#each bests as best (bucketValue(best))}
            <li class="card flex items-center justify-between gap-3 px-4 py-3 text-caption">
              <span>{bucketLabel(best)}</span>
              <span class="font-heading text-h3 tabular-nums">
                {formatNumber(best.wpm)}
                <span class="font-ui text-caption">{ui.results.wpm}</span>
              </span>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}
</div>
