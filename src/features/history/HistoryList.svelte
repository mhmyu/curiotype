<script lang="ts">
  import type { Language } from '@/i18n/config';
  import type { Dictionary } from '@/i18n/types';
  import { getModeLabel } from '@/features/test-modes/label';
  import { parseBucketKey } from './history';
  import type { HistoryEntry, PersonalBests } from './history';

  interface Props {
    history: readonly HistoryEntry[];
    personalBests: PersonalBests;
    ui: Dictionary;
    lang: Language;
  }

  let { history, personalBests, ui, lang }: Props = $props();

  const RECENT_LIMIT = 10;

  const recent = $derived(history.slice(0, RECENT_LIMIT));
  const bests = $derived(
    Object.entries(personalBests).map(([key, wpm]) => ({ ...parseBucketKey(key), wpm })),
  );
  const dateFormat = $derived(
    new Intl.DateTimeFormat(lang, { dateStyle: 'medium', timeStyle: 'short' }),
  );
</script>

<section class="flex flex-col gap-5 border-t-2 border-border pt-5">
  <h2 class="text-h2">{ui.history.title}</h2>

  {#if history.length === 0 && bests.length === 0}
    <p class="text-body-long text-text-muted">{ui.history.empty}</p>
  {:else}
    {#if bests.length > 0}
      <div class="flex flex-col gap-3">
        <h3 class="text-h3">{ui.history.personalBests}</h3>
        <ul class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {#each bests as best}
            <li class="card flex items-center justify-between gap-3 px-4 py-3 text-caption">
              <span>{best.contentLang.toUpperCase()} · {getModeLabel(ui, best)}</span>
              <span class="font-heading text-h3 tabular-nums">
                {Math.round(best.wpm)} <span class="font-ui text-caption">{ui.results.wpm}</span>
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}

    {#if recent.length > 0}
      <div class="flex flex-col gap-3">
        <h3 class="text-h3">{ui.history.recent}</h3>
        <ul class="flex flex-col gap-3">
          {#each recent as entry (entry.id)}
            <li
              class="card flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 text-caption"
            >
              <span class="text-text-muted">
                {dateFormat.format(entry.finishedAt)}
              </span>
              <span>{entry.contentLang.toUpperCase()} · {getModeLabel(ui, entry)}</span>
              <span class="tabular-nums">
                <span class="font-semibold">{Math.round(entry.wpm)} {ui.results.wpm}</span>
                · {entry.accuracy}%
              </span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  {/if}
</section>
