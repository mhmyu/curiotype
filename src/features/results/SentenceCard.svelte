<script lang="ts">
  import type { Snippet } from 'svelte';
  import type { Dictionary } from '@/i18n/types';
  import { buildFactReportUrl } from '@/lib/report';
  import type { Sentence } from '@/lib/types';

  interface Props {
    sentence: Sentence;
    ui: Dictionary;
    /** Repository root (`PUBLIC_REPO_URL`); without it the "report" link is hidden. */
    repoUrl?: string;
    /** Buttons shown next to the report link (the star in the results, "remove" in the collection). */
    actions?: Snippet;
  }

  let { sentence, ui, repoUrl, actions }: Props = $props();

  const reportUrl = $derived(buildFactReportUrl(repoUrl, sentence.id));
</script>

<!-- One sentence with its explanation and source. Used by the results list and the collection page. -->
<li class="card flex flex-col gap-2 p-5" data-sentence-id={sentence.id}>
  <p class="text-body-long font-semibold">{sentence.text}</p>
  <p class="text-body-long text-text-muted">{sentence.explanation}</p>
  <p class="text-caption text-text-muted">
    {ui.categories[sentence.category]} ·
    <!-- The level is spelled out (never colour alone): badge with a 2px radius. -->
    <span
      class="inline-block rounded-xs border-2 px-1.5 font-semibold leading-snug {sentence.difficulty === 'hard'
        ? 'border-accent bg-accent text-surface'
        : 'border-on-primary bg-primary text-on-primary'}"
      data-testid="difficulty-badge"
      data-difficulty={sentence.difficulty}
    >
      {ui.difficulties[sentence.difficulty]}
    </span>
    ·
    {ui.results.sourceLabel}:
    <a
      href={sentence.source.url}
      target="_blank"
      rel="noopener noreferrer"
      class="text-accent underline underline-offset-2"
    >
      {sentence.source.title}
    </a>
  </p>
  {#if reportUrl || actions}
    <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
      {@render actions?.()}
      {#if reportUrl}
        <a
          href={reportUrl}
          target="_blank"
          rel="noopener noreferrer"
          class="-my-2 inline-flex min-h-11 items-center text-caption text-accent underline underline-offset-2"
        >
          {ui.results.reportFact}
        </a>
      {/if}
    </div>
  {/if}
</li>
