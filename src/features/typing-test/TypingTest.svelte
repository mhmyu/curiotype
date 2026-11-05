<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { COUNT_OPTIONS, MODES, MODE_IDS, TIME_DURATIONS } from '@/features/test-modes';
  import type { ProgressSnapshot } from '@/features/test-modes';
  import { createSentenceQueue, filterSentences } from '@/features/sentence-picker/picker';
  import { pickWeakKeySentences } from '@/features/sentence-picker/weak-key-picker';
  import { MIN_KEY_ATTEMPTS, formatKey, listWeakKeys } from '@/features/stats/weak-keys';
  import {
    applyInput,
    appendTarget,
    createState,
    getProgressLength,
  } from '@/features/typing-engine/engine';
  import { computeResult, instantWpm } from '@/features/typing-engine/metrics';
  import type { TestResult } from '@/features/typing-engine/metrics';
  import { loadHistory, loadPersonalBests, recordResult } from '@/features/history/history';
  import type { HistoryEntry, PersonalBests } from '@/features/history/history';
  import HistoryList from '@/features/history/HistoryList.svelte';
  import TypingArea from '@/features/typing-area/TypingArea.svelte';
  import ResultsPanel from '@/features/results/ResultsPanel.svelte';
  import { pickShareFact } from '@/features/results/share-image';
  import { getModeLabel } from '@/features/test-modes/label';
  import {
    getCategoryChars,
    getCompletedSentences,
    getTypedSentences,
  } from '@/features/results/learned';
  import { loadFavorites, toggleFavorite } from '@/features/favorites/favorites';
  import { markSeen } from '@/features/seen/seen';
  import DailyFact from '@/features/daily-fact/DailyFact.svelte';
  import { pickDailyFact } from '@/features/daily-fact/daily-fact';
  import ModeDescription from './ModeDescription.svelte';
  import CustomTextInput from '@/features/custom-text/CustomTextInput.svelte';
  import {
    loadCustomTexts,
    removeCustomText,
    saveCustomText,
  } from '@/features/custom-text/custom-texts';
  import type { CustomText } from '@/features/custom-text/custom-texts';
  import RelaxedSession from '@/features/relaxed/RelaxedSession.svelte';
  import StreakBadge from '@/features/streak/StreakBadge.svelte';
  import {
    EMPTY_STREAK,
    getStreakView,
    loadStreak,
    recordActivity,
    toDayKey,
  } from '@/features/streak/streak';
  import type { Streak } from '@/features/streak/streak';
  import ContentLangSwitch from '@/features/settings/ContentLangSwitch.svelte';
  import {
    formatClock,
    getElapsedSeconds,
    getRemainingSeconds,
    getTimeBarFraction,
  } from '@/features/typing-test/clock';
  import { settingsStore } from '@/features/settings/settings.svelte';
  import { createTypingSound } from '@/features/sound/typing-sound';
  import {
    readShortcutEvent,
    shouldHandleResultEnter,
    shouldHandleResultEscape,
  } from '@/features/shortcuts/shortcuts';
  import {
    loadKeyStats,
    recordKeyStats,
    tallyKeystrokes,
  } from '@/features/typing-engine/key-stats';
  import type { KeyStats } from '@/features/typing-engine/key-stats';
  import type { ContentLang, Language } from '@/i18n/config';
  import type { Dictionary } from '@/i18n/types';
  import { resolveContentLang } from '@/lib/content-langs';
  import { listSelectableContentLangs } from '@/config/languages';
  import { getStorage } from '@/lib/storage';
  import { CATEGORIES, DIFFICULTIES } from '@/lib/taxonomy';
  import type { Category, Difficulty } from '@/lib/taxonomy';
  import type { ModeId, Sentence, TestSettings } from '@/lib/types';

  interface Props {
    lang: Language;
    ui: Dictionary;
    /** Sentence languages found under src/content/sentences/ (the language switch lists them). */
    contentLangs: readonly ContentLang[];
    initialContentLang: ContentLang;
    /** Repository root (`PUBLIC_REPO_URL`), for the "report a wrong fact" links; empty hides them. */
    repoUrl?: string;
    /**
     * Id of a sentence to type first: the page opens in Sentence mode with it (filters on "all").
     * Ignored when the sentence is not in the starting language's file.
     */
    initialSentenceId?: string;
  }

  let { lang, ui, contentLangs, initialContentLang, repoUrl, initialSentenceId }: Props = $props();

  // Language of the sentences: the saved choice (when that folder still exists), otherwise the
  // language the page picked at build time. Separate from the interface language (`lang`).
  const contentLang = $derived<ContentLang>(
    resolveContentLang(settingsStore.current.contentLang ?? initialContentLang, contentLangs),
  );
  // The select lists the launched languages (and every language in `pnpm dev`); a draft language
  // that is in use stays listed. `contentLangs` stays complete: it is what resolution accepts.
  const selectableContentLangs = $derived(
    listSelectableContentLangs(contentLangs, { dev: import.meta.env.DEV, active: contentLang }),
  );

  type Status = 'loading' | 'error' | 'empty' | 'ready' | 'running' | 'finished';

  const TICK_INTERVAL_MS = 100;
  const SAMPLE_INTERVAL_MS = 1000;

  // Reactive state
  let status = $state<Status>('loading');
  // True once the first sentence file has loaded; the controls (language switch included) stay on screen after that, even while another language loads or fails.
  let loaded = $state(false);
  let settings = $state<TestSettings>({
    mode: 'time',
    durationSec: 30,
    sentenceCount: 3,
    category: 'all',
    difficulty: 'all',
    focus: 'none',
  });
  // Weak keys the current test practices: `null` until practice has loaded them (or while it is
  // off), an empty list when practice is on but no key is weak yet.
  let practiceKeys = $state.raw<string[] | null>(null);
  let engine = $state.raw(createState(''));
  // Stop-on-error as it was when the current test started; a test never changes rules midway,
  // and its records (the `soe` bucket) follow this value.
  let stopOnError = $state(false);
  let usedSentences = $state.raw<Sentence[]>([]);
  let elapsedMs = $state(0);
  let samples = $state.raw<number[]>([]);
  let result = $state.raw<TestResult | null>(null);
  let history = $state.raw<HistoryEntry[]>([]);
  let personalBests = $state.raw<PersonalBests>({});
  let isPersonalBest = $state(false);
  // Ids of the sentences saved in the collection of the current sentence language.
  let favoriteIds = $state.raw<ReadonlySet<string>>(new Set());
  let streak = $state.raw<Streak>({ ...EMPTY_STREAK });
  // Local day the badge is for. Set when the page loads and after each finished test, so a page
  // left open past midnight shows the right day again after the next test.
  let today = $state(toDayKey(new Date()));
  const streakView = $derived(getStreakView(streak, today));
  let typingArea: ReturnType<typeof TypingArea> | undefined = $state();
  // Relaxed mode: the sentence a new session opens with, and a counter that remounts the session
  // component (so each new session starts clean).
  let relaxedFirst = $state.raw<Sentence | null>(null);
  let sessionKey = $state(0);
  // Custom text mode: the saved texts, and the text of the current test (`null` = the editor is
  // shown, so the user picks or writes a text first).
  let customTexts = $state.raw<CustomText[]>([]);
  let customTarget = $state<string | null>(null);
  // The sentence file in use, with the language it belongs to (they always change together).
  let corpus = $state.raw<{ lang: ContentLang; sentences: Sentence[] } | null>(null);
  // Same sentence for everyone on the same local day; follows `today` like the streak badge.
  const dailyFact = $derived(corpus ? pickDailyFact(corpus.sentences, today, corpus.lang) : null);

  // Runtime values that never drive the UI
  // Sentence files already fetched, by language, so switching back needs no request.
  const sentenceCache = new Map<ContentLang, Sentence[]>();
  // Identifies the latest sentence load; an older one that finishes late is ignored.
  let loadToken = 0;
  let nextSentence: () => Sentence = () => {
    throw new Error('Sentence queue is not ready');
  };
  let timerId: number | undefined;
  let startedAt = 0;
  let sampledSeconds = 0;
  let lastSampleLength = 0;
  // Per-key attempts and errors of the current test; saved to storage when it finishes.
  let keyTally: KeyStats = {};
  // The save of the last finished test; practice waits for it so it reads the fresh key stats.
  let pendingSave: Promise<void> = Promise.resolve();
  // Identifies the latest test start; an older one that finishes loading late is dropped.
  let startToken = 0;
  // Creates its audio context only when the first click plays (browsers need a key press first).
  const typingSound = createTypingSound();

  // Weak-key practice picks corpus sentences, so it does not apply to relaxed mode (no key
  // statistics) or to custom text (the user's own target).
  const canPractice = $derived(settings.mode !== 'relaxed' && settings.mode !== 'custom');
  const practiceOn = $derived(settings.focus === 'weak-keys' && canPractice);
  // Filter panel: closed on every page load (its state is not saved). Own text has no filters.
  let filtersOpen = $state(false);
  const filtersAvailable = $derived(settings.mode !== 'custom');
  const activeFilterCount = $derived(
    (settings.category !== 'all' ? 1 : 0) +
      (settings.difficulty !== 'all' ? 1 : 0) +
      (practiceOn ? 1 : 0),
  );

  /** Esc inside the filter panel (or on its button) closes the panel only; it must not restart the test. */
  function onFiltersKeydown(event: KeyboardEvent) {
    if (event.key !== 'Escape' || !filtersOpen) return;
    event.preventDefault();
    event.stopPropagation();
    filtersOpen = false;
    document.querySelector<HTMLButtonElement>('[data-testid="filters-toggle"]')?.focus();
  }

  /** What the chosen difficulty means; nothing for "all". */
  const difficultyHint = $derived(
    settings.difficulty === 'easy'
      ? ui.test.difficultyEasyHint
      : settings.difficulty === 'hard'
        ? ui.test.difficultyHardHint
        : null,
  );
  // Seconds left in Time mode (the countdown shown in place of the duration select while it runs).
  const remainingSec = $derived(getRemainingSeconds(settings.durationSec, elapsedMs));
  // Progress bar of Time mode (spec 22.5): the share of time left now and one second from now. The
  // bar slides to the second value over 1s (linear) while the test runs, so it moves smoothly;
  // with reduced motion it only shows the first value and so steps once per second.
  const barNow = $derived(getTimeBarFraction(settings.durationSec, remainingSec));
  const barNext = $derived(getTimeBarFraction(settings.durationSec, remainingSec - 1));
  // Time mode swaps its duration select for the countdown while the test runs (spec 22.4); the
  // select is back on `ready` and `finished`, so the chosen duration is never lost or changed midway.
  const countdownShown = $derived(settings.mode === 'time' && status === 'running');
  // The other timed modes show the elapsed time next to (or, without a second select, in the place
  // of) the second control, from the start: no layout shift when the test begins. Relaxed has no
  // clock (`showsClock: false`); Own text only shows it while a text is being typed, not in its editor.
  const elapsedShown = $derived(
    settings.mode !== 'time' &&
      MODES[settings.mode].showsClock !== false &&
      (settings.mode !== 'custom' || customTarget !== null),
  );

  /*
   * Text for the polite live region (screen readers). Only the final result and a
   * coarse countdown are announced, never single keystrokes.
   */
  const announcement = $derived.by(() => {
    if (status === 'finished' && result) {
      return `${Math.round(result.wpm)} ${ui.results.wpm}, ${ui.results.accuracy} ${result.accuracy}%`;
    }
    const countdown = status === 'running' && settings.mode === 'time';
    if (countdown && remainingSec > 0 && (remainingSec % 10 === 0 || remainingSec === 5)) {
      return `${ui.test.timeLeft}: ${remainingSec}${ui.test.secondsSuffix}`;
    }
    return '';
  });
  const joinSentences = (list: readonly Sentence[]) => list.map((s) => s.text).join(' ');

  function snapshot(now: number): ProgressSnapshot {
    return {
      // With stop-on-error a wrong last character is not progress, so a test cannot end on it.
      typedLength: getProgressLength(engine, stopOnError),
      targetLength: engine.target.length,
      elapsedMs: now - startedAt,
    };
  }

  function stopTimer() {
    if (timerId !== undefined) {
      window.clearInterval(timerId);
      timerId = undefined;
    }
  }

  /**
   * Starts a new test; with `first` (a sentence of the loaded file) the test opens with that sentence.
   * `focusTypingArea: false` leaves the keyboard focus where it is (the mode select keeps it, so a
   * keyboard user can keep browsing the modes with the arrow keys).
   */
  async function startNewTest(first?: Sentence, focusTypingArea = true) {
    const token = ++startToken;

    // Practice reads the key stats first and changes nothing on screen until they arrive.
    let weakKeys: string[] = [];
    if (practiceOn && corpus && !first) {
      try {
        await pendingSave;
      } catch {
        // A failed save must not block the next test.
      }
      try {
        const stats = await loadKeyStats(getStorage(), corpus.lang);
        weakKeys = listWeakKeys(stats).map((weak) => weak.key);
      } catch {
        // Without stats the test simply picks sentences as usual.
      }
      if (token !== startToken) return;
    }

    stopTimer();
    elapsedMs = 0;
    samples = [];
    result = null;
    isPersonalBest = false;
    keyTally = {};
    stopOnError = settingsStore.current.stopOnError;
    practiceKeys = practiceOn ? weakKeys : null;

    // Custom text: the target is the user's text, not a corpus sentence. Without a chosen text
    // the editor is on screen and nothing starts.
    if (settings.mode === 'custom') {
      usedSentences = [];
      if (customTarget === null) {
        status = 'ready';
        return;
      }
      engine = createState(customTarget);
      status = 'ready';
      await tick();
      if (focusTypingArea) typingArea?.focus();
      return;
    }

    const filtered = filterSentences(corpus?.sentences ?? [], settings);
    if (filtered.length === 0) {
      status = 'empty';
      return;
    }
    const pool = weakKeys.length > 0 ? pickWeakKeySentences(filtered, weakKeys) : filtered;

    nextSentence = createSentenceQueue(pool);

    // Relaxed mode: the session component owns the typing; it only gets its first sentence.
    if (settings.mode === 'relaxed') {
      relaxedFirst = MODES.relaxed.initialSentences(nextSentence, settings)[0];
      sessionKey += 1;
      status = 'ready';
      return;
    }

    usedSentences = MODES[settings.mode].initialSentences(
      first ? () => first : nextSentence,
      settings,
    );
    engine = createState(joinSentences(usedSentences));
    status = 'ready';

    await tick();
    if (focusTypingArea) typingArea?.focus();
  }

  function updateSettings(patch: Partial<TestSettings>, focusTypingArea = true) {
    // Choosing the mode (again) opens the text editor, so another text can be picked.
    if (patch.mode === 'custom') customTarget = null;
    settings = { ...settings, ...patch };
    void startNewTest(undefined, focusTypingArea);
  }

  /**
   * Starts a Sentence test with one given sentence (the fact of the day). The filters go back to
   * "all" so the controls never claim a category the sentence is not in. The result is saved like
   * any other Sentence test (history, personal best, seen, streak).
   */
  function startWithSentence(sentence: Sentence): Promise<void> {
    settings = { ...settings, mode: 'quote', category: 'all', difficulty: 'all', focus: 'none' };
    return startNewTest(sentence);
  }

  /** Starts a test with a custom text (already normalized) and saves it among the last texts. */
  async function startCustomText(text: string) {
    customTarget = text;
    void startNewTest();
    try {
      customTexts = await saveCustomText(getStorage(), text);
    } catch {
      // Storage may be blocked; the test itself keeps working.
    }
  }

  async function removeSavedText(id: string) {
    try {
      customTexts = await removeCustomText(getStorage(), id);
    } catch {
      // Storage may be blocked; the list then keeps its previous state.
    }
  }

  /** Back to the text editor (from the typing area or from the result). */
  function changeCustomText() {
    stopTimer();
    customTarget = null;
    result = null;
    elapsedMs = 0;
    status = 'ready';
  }

  function beginRun(now: number) {
    status = 'running';
    startedAt = now;
    sampledSeconds = 0;
    lastSampleLength = 0;
    timerId = window.setInterval(onTick, TICK_INTERVAL_MS);
  }

  function onTick() {
    const now = performance.now();
    elapsedMs = now - startedAt;

    const dueSamples = Math.floor(elapsedMs / SAMPLE_INTERVAL_MS);
    while (sampledSeconds < dueSamples) {
      sampledSeconds += 1;
      const typedLength = engine.typed.length;
      samples = [...samples, instantWpm(typedLength - lastSampleLength, SAMPLE_INTERVAL_MS)];
      lastSampleLength = typedLength;
    }

    if (MODES[settings.mode].isFinished(snapshot(now), settings)) finish(now);
  }

  function handleInput(value: string) {
    if (status !== 'ready' && status !== 'running') return;

    const now = performance.now();
    if (status === 'ready') beginRun(now);

    const previous = engine;
    engine = applyInput(engine, value, { stopOnError });
    keyTally = tallyKeystrokes(
      keyTally,
      previous.target,
      previous.typed.length,
      engine.typed,
      previous.typed,
    );

    // One click per accepted character (deleting, or typing that stop-on-error refuses, is silent).
    const { sound, volume } = settingsStore.current;
    if (sound && engine.keystrokes > previous.keystrokes) typingSound.play(volume);

    const mode = MODES[settings.mode];
    while (mode.shouldAppend(snapshot(now))) {
      const sentence = nextSentence();
      usedSentences = [...usedSentences, sentence];
      engine = appendTarget(engine, ` ${sentence.text}`);
    }

    if (mode.isFinished(snapshot(now), settings)) finish(now);
  }

  function finish(now: number) {
    stopTimer();
    elapsedMs = MODES[settings.mode].effectiveElapsedMs(now - startedAt, settings);
    result = computeResult(engine, elapsedMs, samples);
    status = 'finished';
    pendingSave = persistResult(result);
  }

  async function persistResult(finished: TestResult) {
    // Unscored modes (relaxed) never reach the history or the records.
    const mode = settings.mode;
    if (mode === 'relaxed') return;
    // A custom text is scored and enters the history, but it has no corpus sentences: no ids,
    // no per-category characters and nothing for `seen` (the key statistics and the streak count).
    const isCustom = mode === 'custom';

    // Read everything that a new test could reset before the first await.
    const typedLength = engine.typed.length;
    const typedSentences = getTypedSentences(usedSentences, typedLength);
    const completedIds = getCompletedSentences(usedSentences, typedLength).map((s) => s.id);
    const categoryChars = getCategoryChars(usedSentences, typedLength);
    const tally = keyTally;
    const ranWithStopOnError = stopOnError;
    const sentenceLang = contentLang;
    const finishedAt = new Date();
    const storage = getStorage();

    const outcome = await recordResult(storage, {
      contentLang: sentenceLang,
      mode,
      durationSec: mode === 'time' ? settings.durationSec : null,
      sentenceCount: mode === 'count' ? settings.sentenceCount : null,
      ...(ranWithStopOnError ? { stopOnError: true } : {}),
      category: isCustom ? 'all' : settings.category,
      difficulty: isCustom ? 'all' : settings.difficulty,
      wpm: finished.wpm,
      rawWpm: finished.rawWpm,
      accuracy: finished.accuracy,
      consistency: finished.consistency,
      errors: finished.errors,
      ...(isCustom ? {} : { sentenceIds: typedSentences.map((s) => s.id), categoryChars }),
    });
    history = outcome.history;
    personalBests = outcome.personalBests;
    isPersonalBest = outcome.isPersonalBest;

    await Promise.all([
      isCustom ? Promise.resolve() : markSeen(storage, sentenceLang, completedIds),
      recordKeyStats(storage, sentenceLang, tally),
    ]);

    // Every finished test counts for the streak (relaxed mode counts its sessions itself).
    streak = await recordActivity(storage, finishedAt);
    today = toDayKey(finishedAt);
  }

  /**
   * A relaxed sentence was typed to the end: it goes into `seen`, and the session counts once for
   * the streak (on its first sentence). Nothing goes to the history or the personal bests.
   * Saves run one after another so two quick sentences never overwrite each other's `seen` list.
   */
  function handleRelaxedDone(sentence: Sentence, firstOfSession: boolean) {
    const sentenceLang = contentLang;
    const finishedAt = new Date();
    pendingSave = pendingSave
      .catch(() => {})
      .then(async () => {
        try {
          const storage = getStorage();
          await markSeen(storage, sentenceLang, [sentence.id]);
          if (firstOfSession) {
            streak = await recordActivity(storage, finishedAt);
            today = toDayKey(finishedAt);
          }
        } catch {
          // Storage may be blocked; the session itself keeps working.
        }
      });
  }

  function playClick() {
    const { sound, volume } = settingsStore.current;
    if (sound) typingSound.play(volume);
  }

  function fill(template: string, values: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) =>
      key in values ? String(values[key]) : match,
    );
  }

  /** Reads the collection of one sentence language (the star in the results shows it). */
  async function refreshFavorites(code: ContentLang) {
    try {
      const saved = await loadFavorites(getStorage(), code);
      // Ignore the answer when the language changed while it was loading.
      if (code === contentLang) favoriteIds = new Set(saved.map((favorite) => favorite.id));
    } catch {
      // The collection is optional: without it the stars simply start empty.
    }
  }

  async function toggleSaved(sentenceId: string) {
    const code = contentLang;
    try {
      const saved = await toggleFavorite(getStorage(), code, sentenceId);
      if (code === contentLang) favoriteIds = new Set(saved.map((favorite) => favorite.id));
    } catch {
      // Storage may be blocked; the star then keeps its previous state.
    }
  }

  async function fetchSentences(code: ContentLang): Promise<Sentence[]> {
    const cached = sentenceCache.get(code);
    if (cached) return cached;
    const response = await fetch(`/data/${code}/sentences.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const sentences = (await response.json()) as Sentence[];
    sentenceCache.set(code, sentences);
    return sentences;
  }

  /** Switches the sentence language without changing the URL, then starts a new test. */
  async function selectContentLang(code: ContentLang) {
    if (code === contentLang) return;
    const token = ++loadToken;
    stopTimer();
    status = 'loading';
    try {
      const sentences = await fetchSentences(code);
      if (token !== loadToken) return;
      corpus = { lang: code, sentences };
      favoriteIds = new Set();
      void settingsStore.update({ contentLang: code });
      void refreshFavorites(code);
      await startNewTest();
    } catch {
      if (token === loadToken) status = 'error';
    }
  }

  async function init() {
    const token = ++loadToken;
    try {
      // The saved language decides which file to fetch, so wait for the settings first
      // (init never rejects: on a storage error the defaults stay).
      await settingsStore.init();
      const code = contentLang;
      const sentences = await fetchSentences(code);
      if (token !== loadToken) return;
      corpus = { lang: code, sentences };

      const storage = getStorage();
      [history, personalBests, streak, customTexts] = await Promise.all([
        loadHistory(storage),
        loadPersonalBests(storage),
        loadStreak(storage),
        loadCustomTexts(storage),
      ]);
      today = toDayKey(new Date());

      loaded = true;
      void refreshFavorites(contentLang);
      const requested = initialSentenceId
        ? sentences.find((sentence) => sentence.id === initialSentenceId)
        : undefined;
      await (requested ? startWithSentence(requested) : startNewTest());
    } catch {
      if (token === loadToken) status = 'error';
    }
  }

  onMount(() => {
    void init();
    return stopTimer;
  });

  /*
   * Result screen shortcuts: Escape and Enter do what "Try again" does.
   * The listener exists only while a result is on screen. For custom text, "Try again" repeats
   * the same text (`customTarget` is kept); otherwise it starts a new test.
   */
  $effect(() => {
    if (status !== 'finished' || !result) return;
    const shownAt = performance.now();

    function onKeydown(event: KeyboardEvent) {
      const facts = readShortcutEvent(event);
      const handled =
        shouldHandleResultEscape(facts) ||
        shouldHandleResultEnter({ ...facts, msSinceFinished: performance.now() - shownAt });
      if (!handled) return;
      event.preventDefault();
      void startNewTest();
    }

    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  });
</script>

<section class="mx-auto flex w-full max-w-3xl flex-col gap-5 pb-10">
  <p class="sr-only" role="status" aria-live="polite" aria-atomic="true">{announcement}</p>

  {#if loaded}
    <StreakBadge {ui} view={streakView} dailyGoal={settingsStore.current.dailyGoal} />

    <div class="flex flex-col gap-3">
      <!--
        One row, in this order: sentence language, mode, duration (Time) or sentence count (Count),
        filter button. All are native selects (the phone's own picker opens) without a visible
        label; each has an aria-label. The mode always starts on Time (it is not remembered) and keeps
        the focus after a change, so the arrow keys can keep browsing. On narrow screens the row
        shrinks (language code, tighter padding, icon-only filter button) before it is ever allowed to wrap.
      -->
      <div class="controls-row" data-testid="controls-row">
        {#if selectableContentLangs.length > 1}
          <ContentLangSwitch
            compact
            codes={selectableContentLangs}
            value={contentLang}
            {lang}
            label={ui.test.contentLangLabel}
            onSelect={(code) => void selectContentLang(code)}
          />
        {/if}

        <select
          class="field field-compact"
          aria-label={ui.test.modeLabel}
          title={ui.test.modes[settings.mode]}
          value={settings.mode}
          onchange={(event) => updateSettings({ mode: event.currentTarget.value as ModeId }, false)}
        >
          {#each MODE_IDS as modeId (modeId)}
            <option value={modeId} selected={modeId === settings.mode} title={ui.test.modes[modeId]}>
              {ui.test.modesShort[modeId]}
            </option>
          {/each}
        </select>

        {#if settings.mode === 'time'}
          <!--
            The duration select and the countdown share one grid cell, so the countdown has exactly
            the size of the select and nothing moves when a test starts. While it runs the select
            stays in the layout but is hidden (visibility), out of the tab order and the
            accessibility tree; the countdown is a plain read-only timer.
          -->
          <div class="readout-slot" data-running={countdownShown}>
            <select
              class="field field-compact"
              aria-label={ui.test.durationLabel}
              value={String(settings.durationSec)}
              onchange={(event) =>
                updateSettings({ durationSec: Number(event.currentTarget.value) }, false)}
            >
              {#each TIME_DURATIONS as seconds (seconds)}
                <option value={String(seconds)} selected={seconds === settings.durationSec}>
                  {formatClock(seconds)}
                </option>
              {/each}
            </select>
            {#if countdownShown}
              <div
                class="time-readout"
                role="timer"
                aria-live="off"
                aria-label={ui.test.timeLeft}
                data-testid="time-readout"
              >
                {formatClock(remainingSec)}
              </div>
            {/if}
          </div>
        {/if}

        {#if settings.mode === 'count'}
          <select
            class="field field-compact"
            aria-label={ui.test.countLabel}
            value={String(settings.sentenceCount)}
            onchange={(event) =>
              updateSettings({ sentenceCount: Number(event.currentTarget.value) }, false)}
          >
            {#each COUNT_OPTIONS as count (count)}
              <!-- Only the number is shown (the select must stay narrow); the full text is the tooltip. -->
              <option
                value={String(count)}
                selected={count === settings.sentenceCount}
                title={fill(count === 1 ? ui.test.countOptionOne : ui.test.countOption, { count })}
              >
                {count}
              </option>
            {/each}
          </select>
        {/if}

        {#if elapsedShown && settings.mode !== 'count'}
          <div
            class="time-readout"
            role="timer"
            aria-live="off"
            aria-label={ui.test.elapsed}
            data-testid="time-readout"
          >
            {formatClock(getElapsedSeconds(elapsedMs))}
          </div>
        {/if}

        {#if filtersAvailable}
          <button
            type="button"
            class="btn btn-icon ml-auto"
            aria-expanded={filtersOpen}
            aria-controls="filter-panel"
            aria-label={activeFilterCount > 0 ? `${ui.test.filters} (${activeFilterCount})` : ui.test.filters}
            title={ui.test.filters}
            data-testid="filters-toggle"
            onclick={() => (filtersOpen = !filtersOpen)}
            onkeydown={onFiltersKeydown}
          >
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M3 4h14l-5.5 6.5V16l-3 1.5v-7z" />
            </svg>
            {#if activeFilterCount > 0}<span aria-hidden="true">{activeFilterCount}</span>{/if}
          </button>
        {/if}
      </div>

      <!--
        Count mode: the elapsed time does not fit in the row (with the count select it would wrap at
        360px and, in English, at 390px: spec 22.2 wins), so it sits in a small line right below it.
        The line exists from the start of the test, so nothing shifts when the test begins.
      -->
      {#if elapsedShown && settings.mode === 'count'}
        <div class="flex justify-end">
          <div
            class="time-readout time-readout-line"
            role="timer"
            aria-live="off"
            aria-label={ui.test.elapsed}
            data-testid="time-readout"
          >
            {formatClock(getElapsedSeconds(elapsedMs))}
          </div>
        </div>
      {/if}

      {#if filtersAvailable && filtersOpen}
        <!-- Opens in the page flow (it pushes the typing box down) and only on the user's action. -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <!-- Escape is caught here as it bubbles up from the interactive children; the div itself is not interactive. -->
        <div
          id="filter-panel"
          class="flex flex-col gap-3 rounded-container border-2 border-border bg-surface p-4"
          role="group"
          aria-label={ui.test.filters}
          tabindex="-1"
          onkeydown={onFiltersKeydown}
        >
          <div class="grid grid-cols-2 gap-3">
            <label class="flex flex-col gap-1 text-caption text-text-muted">
              <span>{ui.test.categoryLabel}</span>
              <select
                class="field"
                value={settings.category}
                onchange={(event) =>
                  updateSettings({ category: event.currentTarget.value as Category | 'all' })}
              >
                <option value="all">{ui.test.all}</option>
                {#each CATEGORIES as category}
                  <option value={category}>{ui.categories[category]}</option>
                {/each}
              </select>
            </label>
            <label class="flex flex-col gap-1 text-caption text-text-muted">
              <span>{ui.test.difficultyLabel}</span>
              <select
                class="field"
                value={settings.difficulty}
                aria-describedby={difficultyHint ? 'difficulty-hint' : undefined}
                onchange={(event) =>
                  updateSettings({ difficulty: event.currentTarget.value as Difficulty | 'all' })}
              >
                <option value="all">{ui.test.all}</option>
                {#each DIFFICULTIES as difficulty}
                  <option value={difficulty}>{ui.difficulties[difficulty]}</option>
                {/each}
              </select>
            </label>
          </div>
          {#if difficultyHint}
            <p id="difficulty-hint" class="text-caption text-text-muted" data-testid="difficulty-hint">
              {difficultyHint}
            </p>
          {/if}

          {#if canPractice}
            <div class="flex flex-col gap-2">
              <div class="flex flex-wrap gap-2">
                <button
                  type="button"
                  class="btn"
                  aria-pressed={practiceOn}
                  onclick={() => updateSettings({ focus: practiceOn ? 'none' : 'weak-keys' })}
                >
                  {ui.test.focusWeakKeys}
                </button>
              </div>
              {#if practiceOn && practiceKeys !== null && status !== 'loading'}
                <p class="text-caption text-text-muted" role="status" data-testid="practice-note">
                  {#if practiceKeys.length > 0}
                    {fill(ui.test.focusActive, { keys: practiceKeys.map(formatKey).join(', ') })}
                  {:else}
                    {fill(ui.test.focusNoData, { min: MIN_KEY_ATTEMPTS })}
                  {/if}
                </p>
              {/if}
            </div>
          {/if}
        </div>
      {/if}
    </div>
  {/if}

  {#if status === 'loading'}
    <p class="text-body-long text-text-muted" role="status">{ui.test.loading}</p>
  {:else if status === 'error'}
    <p class="text-body-long text-error" role="alert">{ui.test.loadError}</p>
  {:else if status === 'empty'}
    <p class="text-body-long text-text-muted" role="status">{ui.test.noSentences}</p>
  {:else if settings.mode === 'custom' && customTarget === null}
    <CustomTextInput
      {ui}
      saved={customTexts}
      onStart={(text) => void startCustomText(text)}
      onRemove={(id) => void removeSavedText(id)}
    />
  {:else if settings.mode === 'relaxed' && relaxedFirst}
    {#key sessionKey}
      <RelaxedSession
        {ui}
        contentLang={contentLang}
        first={relaxedFirst}
        next={() => nextSentence()}
        {repoUrl}
        {favoriteIds}
        onToggleFavorite={(sentenceId) => void toggleSaved(sentenceId)}
        onSentenceDone={handleRelaxedDone}
        onKeystroke={playClick}
        onNewSession={() => void startNewTest()}
      />
    {/key}
  {:else if status === 'finished' && result}
    {@const typedLength = engine.typed.length}
    <ResultsPanel
      {result}
      {ui}
      {isPersonalBest}
      modeLabel={getModeLabel(ui, {
        mode: settings.mode,
        durationSec: settings.mode === 'time' ? settings.durationSec : null,
        sentenceCount: settings.mode === 'count' ? settings.sentenceCount : null,
        stopOnError,
      })}
      shareFact={pickShareFact(
        getTypedSentences(usedSentences, typedLength),
        getCompletedSentences(usedSentences, typedLength),
      )}
      {repoUrl}
      {favoriteIds}
      onToggleFavorite={(sentenceId) => void toggleSaved(sentenceId)}
      sentences={getTypedSentences(usedSentences, engine.typed.length)}
      onRetry={() => void startNewTest()}
      onChangeText={settings.mode === 'custom' ? changeCustomText : undefined}
    />
  {:else}
    {#if settings.mode === 'custom'}
      <div class="flex justify-end">
        <button type="button" class="btn" data-testid="change-text" onclick={changeCustomText}>
          {ui.customText.changeText}
        </button>
      </div>
    {/if}

    <!--
      The bar sits right above the typing box, in Time mode only. It is there on `ready` as well
      (full), so nothing moves when the test starts, and it goes with the typing box when the
      result appears. Decorative: the countdown above has the numbers.
    -->
    <div class="flex flex-col gap-2">
      {#if settings.mode === 'time'}
        <div class="time-bar" aria-hidden="true" data-testid="time-bar">
          <div
            class="time-bar-fill"
            data-running={status === 'running'}
            data-testid="time-bar-fill"
            style:--bar-now={barNow}
            style:--bar-next={barNext}
          ></div>
        </div>
      {/if}
      <TypingArea
        bind:this={typingArea}
        typingState={engine}
        {ui}
        lang={contentLang}
        onInput={handleInput}
        onEscape={() => void startNewTest()}
      />
    </div>

    <ModeDescription {ui} mode={settings.mode} />

    <!-- After the typing area in the DOM, so Tab from the field lands on Restart, then Enter works. -->
    <div class="flex flex-wrap items-center gap-3">
      <button type="button" class="btn btn-primary" onclick={() => void startNewTest()}>
        {ui.test.restart}
      </button>
      <p class="shortcut-hint text-caption text-text-muted" data-testid="shortcut-hint-restart">
        <kbd class="kbd">Esc</kbd>: {ui.test.shortcutRestart}
      </p>
    </div>

    <p class="text-caption text-text-muted">{ui.test.hint}</p>
    {#if settings.mode === 'custom'}
      <p class="text-caption text-text-muted">{ui.customText.hint}</p>
    {/if}
    {#if stopOnError}
      <p class="text-caption text-text-muted" data-testid="stop-on-error-note">
        {ui.test.stopOnErrorNote}
      </p>
    {/if}
  {/if}

  {#if loaded && dailyFact}
    <DailyFact {ui} sentence={dailyFact} onType={(sentence) => void startWithSentence(sentence)} />
  {/if}

  <HistoryList {history} {personalBests} {ui} {lang} />
</section>
