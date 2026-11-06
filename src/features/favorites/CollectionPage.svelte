<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    loadFavorites,
    pruneFavorites,
    removeFavorite,
    restoreFavorite,
  } from '@/features/favorites/favorites';
  import type { Favorite } from '@/features/favorites/favorites';
  import SentenceCard from '@/features/results/SentenceCard.svelte';
  import ContentLangSwitch from '@/features/settings/ContentLangSwitch.svelte';
  import { settingsStore } from '@/features/settings/settings.svelte';
  import type { ContentLang, Language } from '@/i18n/config';
  import type { Dictionary } from '@/i18n/types';
  import { resolveContentLang } from '@/lib/content-langs';
  import { listSelectableContentLangs } from '@/config/languages';
  import { getStorage } from '@/lib/storage';
  import { getCategoryLabel } from '@/lib/categories';
  import type { CategoryDefinition } from '@/lib/categories';
  import type { Sentence } from '@/lib/types';

  interface Props {
    lang: Language;
    ui: Dictionary;
    /** Sentence languages found under src/content/sentences/. */
    contentLangs: readonly ContentLang[];
    /** Categories per sentence language (labels and order from src/content/categories.json). */
    categories: Record<string, CategoryDefinition[]>;
    /** Sentence language used until the user chooses one (decided at build time). */
    initialContentLang: ContentLang;
    /** Repository root (`PUBLIC_REPO_URL`); without it the "report" links are hidden. */
    repoUrl?: string;
  }

  let { lang, ui, contentLangs, categories, initialContentLang, repoUrl }: Props = $props();

  type Status = 'loading' | 'error' | 'ready';

  // The collection follows the sentence language, like the typing test (same setting).
  const contentLang = $derived<ContentLang>(
    resolveContentLang(settingsStore.current.contentLang ?? initialContentLang, contentLangs),
  );
  // The select lists the launched languages (and every language in `pnpm dev`); a draft language
  // that is in use stays listed. `contentLangs` stays complete: it is what resolution accepts.
  const selectableContentLangs = $derived(
    listSelectableContentLangs(contentLangs, { dev: import.meta.env.DEV, active: contentLang }),
  );

  let status = $state<Status>('loading');
  let favorites = $state.raw<Favorite[]>([]);
  let sentencesById = $state.raw<ReadonlyMap<string, Sentence>>(new Map());
  // Only the categories that have a file in the active sentence language are listed.
  const categoryDefs = $derived(categories[contentLang] ?? []);
  const categoryLabel = (id: string) => getCategoryLabel(categoryDefs, id, lang);
  let category = $state<string>('all');
  // The last removed entry, kept (without a timer) until the next removal, "Undo", a language
  // change or leaving the page (K16). Only this one can be undone.
  let lastRemoved = $state.raw<Favorite | null>(null);
  let summary: HTMLElement | undefined = $state();
  let list: HTMLElement | undefined = $state();
  let undoButton: HTMLButtonElement | undefined = $state();

  // Sentence files already fetched, by language, so switching back needs no request.
  const sentenceCache = new Map<ContentLang, Sentence[]>();
  // Identifies the latest load; an older one that finishes late is ignored.
  let loadToken = 0;

  // Newest first (the stored order); ids that are not in the corpus are never shown.
  const items = $derived(
    favorites
      .map((favorite) => sentencesById.get(favorite.id))
      .filter((sentence): sentence is Sentence => sentence !== undefined)
      .filter((sentence) => category === 'all' || sentence.category === category),
  );
  const countText = $derived(ui.collection.count.replace('{count}', String(favorites.length)));

  async function fetchSentences(code: ContentLang): Promise<Sentence[]> {
    const cached = sentenceCache.get(code);
    if (cached) return cached;
    const response = await fetch(`/data/${code}/sentences.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const sentences = (await response.json()) as Sentence[];
    sentenceCache.set(code, sentences);
    return sentences;
  }

  async function load(code: ContentLang) {
    const token = ++loadToken;
    status = 'loading';
    lastRemoved = null;
    try {
      const sentences = await fetchSentences(code);
      const storage = getStorage();
      // Saved ids whose sentence was removed from the content files are cleaned up here. An
      // empty corpus would wipe everything, so then the list is only read.
      const saved =
        sentences.length > 0
          ? await pruneFavorites(storage, code, new Set(sentences.map((sentence) => sentence.id)))
          : await loadFavorites(storage, code);
      if (token !== loadToken) return;
      sentencesById = new Map(sentences.map((sentence) => [sentence.id, sentence]));
      favorites = saved;
      status = 'ready';
    } catch {
      if (token === loadToken) status = 'error';
    }
  }

  function selectContentLang(code: ContentLang) {
    if (code === contentLang) return;
    // A category the new language does not have goes back to "All".
    if (category !== 'all' && !(categories[code] ?? []).some((c) => c.id === category)) category = 'all';
    void settingsStore.update({ contentLang: code });
    void load(code);
  }

  async function remove(sentenceId: string) {
    const entry = favorites.find((favorite) => favorite.id === sentenceId);
    try {
      favorites = await removeFavorite(getStorage(), contentLang, sentenceId);
      // A removal before this one becomes permanent: only the newest can be undone.
      lastRemoved = entry ?? null;
      // The card that held the focus is gone; move the focus to the count line (the "Undo"
      // button is the next stop for Tab). With an empty list there is no count line, so the
      // focus goes to the "Undo" button itself.
      await tick();
      (summary ?? undoButton)?.focus();
    } catch {
      // Storage may be blocked; the sentence then stays in the list.
    }
  }

  async function undo() {
    const entry = lastRemoved;
    if (!entry) return;
    try {
      favorites = await restoreFavorite(getStorage(), contentLang, entry);
      lastRemoved = null;
      // Focus the "Remove" button of the restored card; when the category filter hides it, the
      // count line gets the focus instead.
      await tick();
      const restored = list?.querySelector<HTMLElement>(`[data-remove-id="${CSS.escape(entry.id)}"]`);
      (restored ?? summary)?.focus();
    } catch {
      // Storage may be blocked; the row stays so the user can try again.
    }
  }

  onMount(() => {
    void (async () => {
      // The saved language decides which collection to show, so wait for the settings first
      // (init never rejects: on a storage error the defaults stay).
      await settingsStore.init();
      await load(contentLang);
    })();
  });
</script>

{#snippet undoRow()}
  <!-- Stays until the next removal, "Undo", a language change or leaving the page: no timer (WCAG 2.2.1). -->
  <div role="status" class="flex flex-wrap items-center gap-x-3 gap-y-1" data-testid="undo-row">
    {#if lastRemoved}
      <span class="text-caption text-text-muted">{ui.collection.removed}</span>
      <button bind:this={undoButton} type="button" class="btn" onclick={() => void undo()}>
        {ui.collection.undo}
      </button>
    {/if}
  </div>
{/snippet}

<div class="flex flex-col gap-5">
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
  {:else if status === 'error'}
    <p class="text-body-long text-error" role="alert">{ui.test.loadError}</p>
  {:else if favorites.length === 0}
    <p class="text-body-long text-text-muted" role="status">{ui.collection.empty}</p>
    {@render undoRow()}
  {:else}
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p bind:this={summary} tabindex="-1" class="text-caption text-text-muted" data-testid="collection-count">
          {countText}
        </p>
        {@render undoRow()}
      </div>
      <label class="flex flex-col gap-1 text-caption text-text-muted">
        <span>{ui.test.categoryLabel}</span>
        <select class="field" bind:value={category}>
          <option value="all">{ui.test.all}</option>
          {#each categoryDefs as definition (definition.id)}
            <option value={definition.id}>{categoryLabel(definition.id)}</option>
          {/each}
        </select>
      </label>
    </div>

    {#if items.length === 0}
      <p class="text-body-long text-text-muted" role="status">{ui.collection.emptyFilter}</p>
    {:else}
      <ul bind:this={list} class="flex flex-col gap-3">
        {#each items as sentence (sentence.id)}
          <SentenceCard {sentence} {ui} {categoryLabel} {repoUrl}>
            {#snippet actions()}
              <button
                type="button"
                class="btn"
                data-remove-id={sentence.id}
                onclick={() => void remove(sentence.id)}
              >
                {ui.collection.remove}
              </button>
            {/snippet}
          </SentenceCard>
        {/each}
      </ul>
    {/if}
  {/if}
</div>
