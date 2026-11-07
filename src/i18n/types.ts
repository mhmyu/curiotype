import type { Difficulty } from '@/lib/taxonomy';
import type { DataKind } from '@/features/data-tools/data-schema';
import type { ImportErrorCode } from '@/features/data-tools/data-transfer';
import type { CaretStyle, FontSize, Theme } from '@/features/settings/settings';
import type { ModeId } from '@/lib/types';

/**
 * Shape of the UI dictionary. Every language file must satisfy it, so a missing
 * translation (including a new category, difficulty or mode) fails type checking.
 */
export interface Dictionary {
  meta: {
    siteName: string;
    /** Title of the home page (and fallback when a page has none): name plus a short keyword phrase, under 60 characters. */
    homeTitle: string;
    /** Visible `h1` of the home page: the keyword phrase of `homeTitle` without the site name. */
    homeHeading: string;
    tagline: string;
    /** Meta and Open Graph description, 140 to 155 characters. */
    description: string;
    /** Alt text of the Open Graph image: what the picture shows. */
    ogImageAlt: string;
  };
  nav: {
    language: string;
    /** Accessible name of the main navigation. */
    main: string;
    /** Accessible name of the button that opens the menu on small screens. */
    menu: string;
    /** Text of the skip link (first focusable element of every page). */
    skipToContent: string;
    /** Shown only when JavaScript is off: the typing test needs it. */
    noscript: string;
    home: string;
    stats: string;
    collection: string;
    settings: string;
  };
  /** Toast shown when a new version of the site is ready (T30). */
  pwa: {
    updateAvailable: string;
    reload: string;
    later: string;
    /** Descriptions of the install-dialog screenshots (the manifest `label`). */
    screenshotNarrow: string;
    screenshotWide: string;
  };
  footer: {
    /** Accessible name of the footer links. */
    label: string;
    privacy: string;
    /** Lead-in of the sentence license line ("Sentences: CC BY-SA 4.0, ..."). */
    sentences: string;
  };
  settings: {
    title: string;
    description: string;
    themeLabel: string;
    themes: Record<Theme, string>;
    fontSizeLabel: string;
    fontSizes: Record<FontSize, string>;
    fontSizePreview: string;
    caretLabel: string;
    caretStyles: Record<CaretStyle, string>;
    caretHelp: string;
    /** Shared by the on/off choices (stop-on-error, sound). */
    on: string;
    off: string;
    stopOnErrorLabel: string;
    stopOnErrorHelp: string;
    soundLabel: string;
    soundHelp: string;
    volumeLabel: string;
    /** Button that plays one click at the chosen volume. */
    soundTest: string;
    contentLangHelp: string;
    dailyGoalLabel: string;
    dailyGoalHelp: string;
    dailyGoalOff: string;
    /** A goal of several tests a day. `{count}` = the number. */
    dailyGoalTests: string;
    savedNote: string;
  };
  streak: {
    /** Accessible name of the streak and goal badge on the home page. */
    label: string;
    /** `{count}` = days in a row. */
    days: string;
    /** `{done}` of `{goal}` tests finished today. */
    todayProgress: string;
    goalReached: string;
  };
  dailyFact: {
    /** Heading of the fact-of-the-day card on the home page. */
    title: string;
    /** Button that starts a Sentence test with that sentence. */
    typeIt: string;
  };
  dataTools: {
    title: string;
    description: string;
    exportTitle: string;
    exportHelp: string;
    exportButton: string;
    exportDone: string;
    importTitle: string;
    importHelp: string;
    importButton: string;
    /** Shown when a file passed every check. `{tests}` = number of tests in the history of the file. */
    importReady: string;
    importModeLabel: string;
    importModeMerge: string;
    importModeOverwrite: string;
    importMergeHelp: string;
    importOverwriteHelp: string;
    importConfirm: string;
    importDone: string;
    cancel: string;
    /** Why a file was rejected. `{key}` (where present) = the stored key that failed. Nothing is changed. */
    importErrors: Record<ImportErrorCode, string>;
    readFailed: string;
    saveFailed: string;
    overwriteConfirmTitle: string;
    overwriteConfirmBody: string;
    overwriteConfirmButton: string;
    clearTitle: string;
    clearHelp: string;
    clearButton: string;
    clearConfirmTitle: string;
    clearConfirmBody: string;
    clearConfirmButton: string;
    clearDone: string;
    privacyLink: string;
  };
  privacy: {
    title: string;
    description: string;
    localTitle: string;
    localBody: string;
    storedTitle: string;
    storedIntro: string;
    /** What each kind of stored data holds (the list of kinds lives in features/data-tools). */
    data: Record<DataKind, string>;
    noCookiesTitle: string;
    noCookiesBody: string;
    analyticsTitle: string;
    /** Shown when no analytics provider is configured in the build. */
    analyticsOff: string;
    /** Shown when analytics is configured; must describe the provider and what it collects. */
    analyticsOn: string;
    thirdPartyTitle: string;
    thirdPartyBody: string;
    controlTitle: string;
    controlBody: string;
    controlLink: string;
  };
  collection: {
    title: string;
    description: string;
    /** Shown when nothing is saved yet. */
    empty: string;
    /** Shown when the chosen category has no saved sentence. */
    emptyFilter: string;
    /** Number of saved sentences in the current sentence language. `{count}` = the number. */
    count: string;
    remove: string;
    /** Shown in the status row after a sentence was removed (next to the "Undo" button). */
    removed: string;
    /** Button in that row; puts the last removed sentence back. */
    undo: string;
  };
  stats: {
    title: string;
    description: string;
    /** Shown instead of the trend and accuracy when the chosen sentence language has no test yet. */
    emptyHistory: string;
    totalsTitle: string;
    totalTests: string;
    totalTime: string;
    sentencesLearned: string;
    /** Where the totals come from. `{limit}` = the most tests the history keeps. */
    historyNote: string;
    trendTitle: string;
    bucketLabel: string;
    /** Caption of the chart. `{count}` = number of tests in it. */
    trendCaption: string;
    /** Text alternative of the chart. `{count}`, `{latest}`, `{average}`, `{best}` = WPM numbers. */
    trendAria: string;
    latest: string;
    average: string;
    best: string;
    accuracyTitle: string;
    /** Explains that the accuracy of a mixed test is shared over its categories. */
    accuracyNote: string;
    /** Characters an accuracy is based on. `{count}` = the number. */
    accuracyChars: string;
    noData: string;
    coverageTitle: string;
    /** `{seen}` of `{total}` sentences, `{percent}` = whole percentage. */
    coverageTotal: string;
    /** Per category. `{seen}` of `{total}`. */
    coverageRow: string;
    /** A category without sentences in the corpus. */
    noSentences: string;
    noBests: string;
    keysTitle: string;
    /** Intro of the weak-keys section. `{min}` = attempts a key needs before it is judged. */
    keysIntro: string;
    /** Accessible name of the keyboard heat map. */
    keysHeatmapLabel: string;
    /** Explains the numbers and the dashed keys. `{min}` = minimum attempts. */
    keysLegend: string;
    /** Text alternative of one key. `{key}`, `{percent}` (error rate), `{attempts}`. */
    keyCellAria: string;
    /** Same for a key with too few attempts. `{key}`, `{attempts}`, `{min}`. */
    keyCellAriaNoData: string;
    keysWeakTitle: string;
    /** One weak key. `{errors}` mistakes in `{attempts}` attempts. */
    keysWeakRow: string;
    /** Shown when no key qualifies. `{min}` = minimum attempts. */
    keysWeakEmpty: string;
    keysNote: string;
  };
  notFound: {
    title: string;
    message: string;
    home: string;
  };
  test: {
    modeLabel: string;
    modes: Record<ModeId, string>;
    /** Shorter mode names for the one-row controls on narrow screens (the select is as wide as its longest option). */
    modesShort: Record<ModeId, string>;
    /** One short sentence per mode, always shown under the typing box (what the mode does). */
    modeDescriptions: Record<ModeId, string>;
    durationLabel: string;
    countLabel: string;
    /** Option of the sentence-count select ("{count} sentences"). */
    countOption: string;
    /** Same for one sentence ("{count} sentence"; Indonesian has no plural, so it repeats countOption). */
    countOptionOne: string;
    /** Button that opens the filter panel; `(n)` is appended while `n` filters are active. */
    filters: string;
    /** Toggle that makes the test draw sentences heavy in the user's weak keys. */
    focusWeakKeys: string;
    /** Shown while it is on. `{keys}` = the keys being practiced, e.g. "Q, Z". */
    focusActive: string;
    /** Shown while it is on but no key is weak yet. `{min}` = attempts a key needs. */
    focusNoData: string;
    secondsSuffix: string;
    categoryLabel: string;
    difficultyLabel: string;
    /** Under the difficulty select while "Easy" is chosen: what the level means. */
    difficultyEasyHint: string;
    /** Under the difficulty select while "Hard" is chosen: what the level means. */
    difficultyHardHint: string;
    all: string;
    restart: string;
    loading: string;
    loadError: string;
    noSentences: string;
    contentLangLabel: string;
    inputLabel: string;
    hint: string;
    /** Action word after "Esc:" in the keyboard hint under the typing area (shown on devices with a mouse). */
    shortcutRestart: string;
    /** Shown under the hint while stop-on-error is on. */
    stopOnErrorNote: string;
    /** Short tag after the mode in the history and statistics: its records are separate. */
    stopOnErrorTag: string;
    focusLost: string;
    timeLeft: string;
    elapsed: string;
  };
  /** Relaxed mode: one sentence at a time, no clock and no score. */
  relaxed: {
    /** Label above the sentence being typed. `{n}` = its number in the session. */
    sentenceNumber: string;
    /** Under the typing area; says that nothing is timed or scored. */
    hint: string;
    /** Button that shows the next sentence. */
    next: string;
    /** Button that ends the session. */
    finish: string;
    /** Announced (polite) when a sentence is finished and its card appeared. */
    done: string;
    summaryTitle: string;
    /** `{count}` = sentences finished in the session. */
    summaryCount: string;
    summaryEmpty: string;
    /** Button on the summary that starts a new session. */
    newSession: string;
  };
  /** Custom text mode: the user pastes or writes the text to type. */
  customText: {
    title: string;
    textareaLabel: string;
    placeholder: string;
    /** Character counter. `{count}` = typed so far, `{max}` = the limit. */
    counter: string;
    previewLabel: string;
    /** Shown under the preview when the text was changed to be typeable. `{count}` = characters changed. */
    changed: string;
    /** The text is empty (or has nothing typeable left after the changes). */
    empty: string;
    /** The changed text is longer than the limit. `{max}` = the limit. */
    tooLong: string;
    start: string;
    savedTitle: string;
    /** Button on a saved text that starts typing it. */
    useSaved: string;
    removeSaved: string;
    /** Button next to Restart (and on the result) that goes back to the text editor. */
    changeText: string;
    hint: string;
  };
  difficulties: Record<Difficulty, string>;
  results: {
    title: string;
    wpm: string;
    rawWpm: string;
    accuracy: string;
    consistency: string;
    errors: string;
    personalBest: string;
    chartTitle: string;
    learnedTitle: string;
    sourceLabel: string;
    reportFact: string;
    /** Label of the star toggle under each sentence; the saved state is in `aria-pressed`. */
    saveToCollection: string;
    tryAgain: string;
    /** Action word after "Enter:" in the keyboard hint under the result buttons (shown on devices with a mouse). */
    shortcutRetry: string;
    /** Button that shares the result as an image (or downloads it when sharing is not supported). */
    share: string;
    /** Label of the Share button while the image is still being drawn (the button is `aria-disabled`). */
    shareBusy: string;
    /** Announced after the image was saved as a file because the browser cannot share files. */
    shareSaved: string;
    shareFailed: string;
  };
  /** Static text of the home page under the test (see components/HomeContent.astro). */
  home: {
    /** Accessible name of the whole block. */
    sectionLabel: string;
    howTitle: string;
    /** Three steps, in order. */
    steps: { title: string; body: string }[];
    categoriesTitle: string;
    categoriesIntro: string;
    examplesTitle: string;
    examplesIntro: string;
    whyTitle: string;
    whyBody: string;
  };
  history: {
    title: string;
    personalBests: string;
    recent: string;
    empty: string;
  };
}
