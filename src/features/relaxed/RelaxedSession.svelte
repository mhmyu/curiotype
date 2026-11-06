<script lang="ts">
  import ModeDescription from '@/features/typing-test/ModeDescription.svelte';
  import { tick, untrack } from 'svelte';
  import FavoriteButton from '@/features/favorites/FavoriteButton.svelte';
  import SentenceCard from '@/features/results/SentenceCard.svelte';
  import { readShortcutEvent, shouldHandleResultEnter } from '@/features/shortcuts/shortcuts';
  import TypingArea from '@/features/typing-area/TypingArea.svelte';
  import { applyInput, createState } from '@/features/typing-engine/engine';
  import type { Dictionary } from '@/i18n/types';
  import type { Sentence } from '@/lib/types';
  import {
    advance,
    completeSentence,
    countCompleted,
    finishSession,
    getLearnedSentences,
    startSession,
  } from './relaxed-session';
  import type { RelaxedSession } from './relaxed-session';

  interface Props {
    ui: Dictionary;
    /** Label of a category in the interface language. */
    categoryLabel: (id: string) => string;
    /** Language of the sentences (the typing area marks its text with it). */
    contentLang: string;
    /** The first sentence of the session. */
    first: Sentence;
    /** Returns the next sentence from the picker's queue (the parent owns the queue and the filters). */
    next: () => Sentence;
    /** Repository root (`PUBLIC_REPO_URL`); without it the "report" links are hidden. */
    repoUrl?: string;
    /** Ids of the sentences in the collection (the star is filled for these). */
    favoriteIds: ReadonlySet<string>;
    onToggleFavorite: (sentenceId: string) => void;
    /**
     * A sentence was typed to its last character. `firstOfSession` is true for the first one, so
     * the parent counts the session once for the streak.
     */
    onSentenceDone: (sentence: Sentence, firstOfSession: boolean) => void;
    /** One accepted keystroke (the parent plays the typing sound). */
    onKeystroke: () => void;
    /** "New session" on the summary. */
    onNewSession: () => void;
  }

  let {
    ui,
    categoryLabel,
    contentLang,
    first,
    next,
    repoUrl,
    favoriteIds,
    onToggleFavorite,
    onSentenceDone,
    onKeystroke,
    onNewSession,
  }: Props = $props();

  // The parent remounts this component (`{#key}`) for every new session, so the first sentence is
  // only read once.
  let session = $state.raw<RelaxedSession>(startSession(untrack(() => first)));
  let engine = $state.raw(createState(untrack(() => first.text)));
  let typingArea: ReturnType<typeof TypingArea> | undefined = $state();
  let nextButton: HTMLButtonElement | undefined = $state();
  let summaryEl: HTMLElement | undefined = $state();
  // When the summary appeared (runtime value only); Enter is ignored for the first 600 ms.
  let summaryShownAt = 0;

  const number = $derived(session.completed.length + (session.phase === 'typing' ? 1 : 0));
  const learned = $derived(getLearnedSentences(session));

  function fill(template: string, values: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) =>
      key in values ? String(values[key]) : match,
    );
  }

  function handleInput(value: string) {
    if (session.phase !== 'typing') return;

    const previous = engine;
    // No stop-on-error here: a mistake stays marked but never blocks the sentence.
    engine = applyInput(engine, value);
    if (engine.keystrokes > previous.keystrokes) onKeystroke();

    // Same rule as `MODES.relaxed.isFinished`: done when the last character is typed.
    if (engine.typed.length >= engine.target.length) void completeCurrent();
  }

  async function completeCurrent() {
    const sentence = session.current;
    session = completeSentence(session);
    onSentenceDone(sentence, countCompleted(session) === 1);
    // The card has no input to type in, so keyboard users land on "Continue" (Enter goes on).
    await tick();
    nextButton?.focus();
  }

  async function goNext() {
    if (session.phase !== 'card') return;
    const sentence = next();
    session = advance(session, sentence);
    engine = createState(sentence.text);
    await tick();
    typingArea?.focus();
  }

  async function finish() {
    session = finishSession(session);
    summaryShownAt = performance.now();
    await tick();
    summaryEl?.focus();
  }

  /** Esc starts the current sentence over. */
  function restartSentence() {
    if (session.phase === 'typing') engine = createState(session.current.text);
  }

  /*
   * Enter also continues when nothing is focused (the card's own buttons handle Enter natively,
   * so a focused button or link is never taken over).
   */
  function handleWindowKeydown(event: KeyboardEvent) {
    // Summary: Enter starts a new session (the summary itself holds the focus, not a button).
    if (session.phase === 'summary') {
      const facts = readShortcutEvent(event);
      if (shouldHandleResultEnter({ ...facts, msSinceFinished: performance.now() - summaryShownAt })) {
        event.preventDefault();
        onNewSession();
      }
      return;
    }
    if (session.phase !== 'card' || event.key !== 'Enter' || event.isComposing) return;
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    event.preventDefault();
    void goNext();
  }
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<p class="sr-only" role="status" aria-live="polite">
  {session.phase === 'card' ? ui.relaxed.done : ''}
</p>

{#if session.phase === 'summary'}
  <section
    bind:this={summaryEl}
    tabindex="-1"
    class="flex flex-col gap-5 outline-none"
    aria-labelledby="relaxed-summary-title"
    data-testid="relaxed-summary"
  >
    <div class="card flex flex-col gap-2 p-5">
      <h2 id="relaxed-summary-title" class="text-h2">{ui.relaxed.summaryTitle}</h2>
      <p class="text-body-long" data-testid="relaxed-summary-count">
        {fill(ui.relaxed.summaryCount, { count: countCompleted(session) })}
      </p>
    </div>

    {#if learned.length > 0}
      <div class="flex flex-col gap-3">
        <h3 class="text-h3">{ui.results.learnedTitle}</h3>
        <ul class="flex flex-col gap-3">
          {#each learned as sentence (sentence.id)}
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
    {:else}
      <p class="text-body-long text-text-muted">{ui.relaxed.summaryEmpty}</p>
    {/if}

    <div>
      <button
        type="button"
        class="btn btn-primary"
        data-testid="relaxed-new-session"
        onclick={onNewSession}
      >
        {ui.relaxed.newSession}
      </button>
    </div>
  </section>
{:else}
  <div class="flex items-center justify-between gap-3 text-caption text-text-muted">
    <span data-testid="relaxed-number">{fill(ui.relaxed.sentenceNumber, { n: number })}</span>
    {#if session.phase === 'typing'}
      <button type="button" class="btn" data-testid="relaxed-finish" onclick={() => void finish()}>
        {ui.relaxed.finish}
      </button>
    {/if}
  </div>

  <TypingArea
    bind:this={typingArea}
    typingState={engine}
    {ui}
    lang={contentLang}
    disabled={session.phase === 'card'}
    onInput={handleInput}
    onEscape={restartSentence}
  />

  <ModeDescription {ui} mode="relaxed" />

  {#if session.phase === 'typing'}
    <p class="text-caption text-text-muted">{ui.relaxed.hint}</p>
  {:else}
    <ul class="flex flex-col gap-3" data-testid="relaxed-card">
      <SentenceCard sentence={session.current} {ui} {categoryLabel} {repoUrl}>
        {#snippet actions()}
          <FavoriteButton
            saved={favoriteIds.has(session.current.id)}
            label={ui.results.saveToCollection}
            onToggle={() => onToggleFavorite(session.current.id)}
          />
        {/snippet}
      </SentenceCard>
    </ul>
    <div class="flex flex-wrap items-center gap-3">
      <button
        bind:this={nextButton}
        type="button"
        class="btn btn-primary"
        data-testid="relaxed-next"
        onclick={() => void goNext()}
      >
        {ui.relaxed.next}
      </button>
      <button type="button" class="btn" data-testid="relaxed-finish" onclick={() => void finish()}>
        {ui.relaxed.finish}
      </button>
    </div>
  {/if}
{/if}
