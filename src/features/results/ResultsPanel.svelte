<script lang="ts">
  import type { Dictionary } from '@/i18n/types';
  import type { TestResult } from '@/features/typing-engine/metrics';
  import { MAX_PLAUSIBLE_WPM } from '@/features/history/plausibility';
  import FavoriteButton from '@/features/favorites/FavoriteButton.svelte';
  import type { Sentence } from '@/lib/types';
  import SentenceCard from './SentenceCard.svelte';
  import { getShareFileName, getShareText, renderShareImage } from './share-image';
  import type { ShareImageData } from './share-image';
  import { getShareButtonState } from './share-button-state';
  import type { ShareImageStatus } from './share-button-state';
  import { shareOrDownload } from './share-result';
  import WpmChart from './WpmChart.svelte';

  interface Props {
    result: TestResult;
    sentences: readonly Sentence[];
    ui: Dictionary;
    /** Label of a category in the interface language. */
    categoryLabel: (id: string) => string;
    isPersonalBest: boolean;
    /** The result is above the plausible limit: it was not saved; a note explains it. */
    implausible?: boolean;
    /** Mode with its option for the shared image, e.g. "Time 30s" (from `getModeLabel`). */
    modeLabel: string;
    /** Text of one typed sentence to put on the shared image; null leaves the fact out. */
    shareFact: string | null;
    /** Repository root (`PUBLIC_REPO_URL`); without it the "report" links are hidden. */
    repoUrl?: string;
    /** Ids of the sentences in the collection (the star is filled for these). */
    favoriteIds: ReadonlySet<string>;
    onToggleFavorite: (sentenceId: string) => void;
    onRetry: () => void;
    /** Custom text mode only: goes back to the text editor. Without it the button is not shown. */
    onChangeText?: () => void;
  }

  let {
    result,
    sentences,
    ui,
    categoryLabel,
    isPersonalBest,
    implausible = false,
    modeLabel,
    shareFact,
    repoUrl,
    favoriteIds,
    onToggleFavorite,
    onRetry,
    onChangeText,
  }: Props = $props();

  const stats = $derived([
    { label: ui.results.accuracy, value: `${result.accuracy}%` },
    { label: ui.results.rawWpm, value: `${Math.round(result.rawWpm)}` },
    { label: ui.results.consistency, value: `${result.consistency}%` },
    { label: ui.results.errors, value: `${result.errors}` },
  ]);

  const shareData = $derived<ShareImageData>({
    siteName: ui.meta.siteName,
    wpm: result.wpm,
    wpmLabel: ui.results.wpm,
    accuracy: result.accuracy,
    accuracyLabel: ui.results.accuracy,
    modeLabel,
    fact: shareFact,
  });

  // The image is drawn as soon as the result is shown, so the click only has to share it: browsers
  // (iOS Safari especially) refuse to share when too much time passes between the tap and the call.
  // The finished blob is kept, so the click handler never waits for the drawing (T34).
  let imageStatus = $state<ShareImageStatus>('preparing');
  let imageBlob: Blob | null = null;
  // Identifies the latest drawing; an older one that finishes late is ignored.
  let drawToken = 0;

  function prepareImage(data: ShareImageData) {
    const token = ++drawToken;
    imageBlob = null;
    imageStatus = 'preparing';
    renderShareImage(data).then(
      (blob) => {
        if (token !== drawToken) return;
        imageBlob = blob;
        imageStatus = 'ready';
      },
      () => {
        if (token === drawToken) imageStatus = 'failed';
      },
    );
  }

  $effect(() => {
    prepareImage(shareData);
  });

  let shareMessage = $state('');
  let sharing = $state(false);

  const shareButton = $derived(getShareButtonState(imageStatus, sharing));
  const shareStatusText = $derived(shareButton.message === 'failed' ? ui.results.shareFailed : shareMessage);

  async function onShare() {
    const action = shareButton.onClick;
    if (action === 'ignore') return;
    shareMessage = '';
    if (action === 'redraw') {
      prepareImage(shareData);
      return;
    }
    const blob = imageBlob;
    if (!blob) return;
    sharing = true;
    try {
      // No `await` before this call: it must run inside the tap (user activation).
      const outcome = await shareOrDownload(blob, {
        fileName: getShareFileName(shareData.wpm),
        title: ui.meta.siteName,
        text: getShareText(shareData),
      });
      if (outcome === 'downloaded') shareMessage = ui.results.shareSaved;
    } catch {
      shareMessage = ui.results.shareFailed;
    } finally {
      sharing = false;
    }
  }
</script>

<section class="flex flex-col gap-5" aria-labelledby="results-title">
  <h2 id="results-title" class="sr-only">{ui.results.title}</h2>

  <div class="card flex flex-col gap-4 p-5">
    <div class="flex flex-wrap items-end gap-x-4 gap-y-2">
      <p class="font-heading text-figure font-bold tabular-nums sm:text-figure-lg">
        {Math.round(result.wpm)}
        <span class="font-ui text-caption text-text-muted">{ui.results.wpm}</span>
      </p>
      {#if isPersonalBest}
        <p
          class="mb-1 rounded-xs border-2 border-on-primary bg-primary px-3 py-1 text-caption font-semibold text-on-primary"
        >
          {ui.results.personalBest}
        </p>
      {/if}
    </div>

    {#if implausible}
      <p class="text-body-long text-text-muted" data-testid="result-implausible">
        {ui.results.implausible.replace('{limit}', String(MAX_PLAUSIBLE_WPM))}
      </p>
    {/if}

    <dl class="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {#each stats as stat}
        <div class="flex flex-col gap-1">
          <dt class="text-caption text-text-muted">{stat.label}</dt>
          <dd class="font-heading text-h2 font-semibold tabular-nums">{stat.value}</dd>
        </div>
      {/each}
    </dl>

    <WpmChart samples={result.samples} label={ui.results.chartTitle} />
  </div>

  <!-- Right below the chart, before the sentence list: the list length changes with the mode. -->
  <div class="flex flex-wrap items-center gap-3">
    <button type="button" class="btn btn-primary" onclick={onRetry}>
      {ui.results.tryAgain}
    </button>
    {#if onChangeText}
      <button type="button" class="btn" data-testid="change-text" onclick={onChangeText}>
        {ui.customText.changeText}
      </button>
    {/if}
    <button
      type="button"
      class="btn"
      data-testid="share-result"
      aria-disabled={shareButton.ariaDisabled}
      onclick={() => void onShare()}
    >
      {shareButton.label === 'busy' ? ui.results.shareBusy : ui.results.share}
    </button>
  </div>
  <!-- Space for the status text is kept (two lines on a phone), so a message does not push the list down. -->
  <p
    class="min-h-[2.45rem] text-caption text-text-muted sm:min-h-[1.225rem]"
    role="status"
    data-testid="share-status"
  >
    {shareStatusText}
  </p>
  <p class="shortcut-hint text-caption text-text-muted" data-testid="shortcut-hint-retry">
    <kbd class="kbd">Enter</kbd>: {ui.results.shortcutRetry}
  </p>

  {#if sentences.length > 0}
    <div class="flex flex-col gap-3">
      <h3 class="text-h3">{ui.results.learnedTitle}</h3>
      <ul class="flex flex-col gap-3">
        {#each sentences as sentence (sentence.id)}
          <SentenceCard {sentence} {ui} {categoryLabel} {repoUrl}>
            {#snippet actions()}
              <FavoriteButton
                saved={favoriteIds.has(sentence.id)}
                label={ui.results.saveToCollection}
                onToggle={() => onToggleFavorite(sentence.id)}
              />
            {/snippet}
          </SentenceCard>
        {/each}
      </ul>
    </div>
  {/if}
</section>
