<script lang="ts">
  import { onMount } from 'svelte';
  import ContentLangSwitch from '@/features/settings/ContentLangSwitch.svelte';
  import { CARET_STYLES, DAILY_GOALS, FONT_SIZES, THEMES } from '@/features/settings/settings';
  import { settingsStore } from '@/features/settings/settings.svelte';
  import { applyTheme } from '@/features/settings/theme';
  import { createTypingSound } from '@/features/sound/typing-sound';
  import type { ContentLang, Language } from '@/i18n/config';
  import type { Dictionary } from '@/i18n/types';
  import { resolveContentLang } from '@/lib/content-langs';
  import { listSelectableContentLangs } from '@/config/languages';

  interface Props {
    lang: Language;
    ui: Dictionary;
    /** Sentence languages found under src/content/sentences/. */
    contentLangs: readonly ContentLang[];
    /** Sentence language used until the user chooses one (decided at build time). */
    initialContentLang: ContentLang;
  }

  let { lang, ui, contentLangs, initialContentLang }: Props = $props();

  // Full class names, so Tailwind finds them. Same scale as the typing area (1 / 1.25 / 1.5rem).
  const PREVIEW_CLASS = {
    sm: 'text-typing-sm',
    md: 'text-typing-md',
    lg: 'text-typing-lg',
  } as const;

  // The characters of the caret sample that count as already typed; the caret sits on the next one.
  const CARET_SAMPLE_TYPED = 9;

  // Volume as a percentage while the slider moves; the setting is saved when the slider is released.
  let volumeDraft = $state<number | null>(null);
  // Plays the sample click. Its audio context starts on the first press of the sound button.
  const sampleSound = createTypingSound();

  const settings = $derived(settingsStore.current);
  const volumePercent = $derived(volumeDraft ?? Math.round(settings.volume * 100));
  const caretSample = $derived(
    ui.settings.fontSizePreview.split('').map((ch, index) => ({
      ch,
      typed: index < CARET_SAMPLE_TYPED,
      caret: index === CARET_SAMPLE_TYPED,
    })),
  );

  function saveVolume(percent: number) {
    volumeDraft = null;
    void settingsStore.update({ volume: percent / 100 });
    sampleSound.play(percent / 100);
  }

  const contentLang = $derived<ContentLang>(
    resolveContentLang(settings.contentLang ?? initialContentLang, contentLangs),
  );
  // The select lists the launched languages (and every language in `pnpm dev`); a draft language
  // that is in use stays listed. `contentLangs` stays complete: it is what resolution accepts.
  const selectableContentLangs = $derived(
    listSelectableContentLangs(contentLangs, { dev: import.meta.env.DEV, active: contentLang }),
  );

  onMount(() => {
    void settingsStore.init();
  });

  // Wait for the saved values: until then the store holds defaults, and applying them would
  // undo the theme the inline script in <head> already set.
  $effect(() => {
    if (settingsStore.ready) applyTheme(settings.theme);
  });
</script>

<div class="flex flex-col gap-8">
  {#if settingsStore.ready}
    <section class="flex flex-col gap-3" aria-labelledby="settings-theme">
      <h2 id="settings-theme">{ui.settings.themeLabel}</h2>
      <div class="flex flex-wrap gap-2" role="group" aria-labelledby="settings-theme">
        {#each THEMES as theme}
          <button
            type="button"
            class="btn"
            aria-pressed={settings.theme === theme}
            onclick={() => void settingsStore.update({ theme })}
          >
            {ui.settings.themes[theme]}
          </button>
        {/each}
      </div>
    </section>

    <section class="flex flex-col gap-3" aria-labelledby="settings-font-size">
      <h2 id="settings-font-size">{ui.settings.fontSizeLabel}</h2>
      <div class="flex flex-wrap gap-2" role="group" aria-labelledby="settings-font-size">
        {#each FONT_SIZES as fontSize}
          <button
            type="button"
            class="btn"
            aria-pressed={settings.fontSize === fontSize}
            onclick={() => void settingsStore.update({ fontSize })}
          >
            {ui.settings.fontSizes[fontSize]}
          </button>
        {/each}
      </div>
      <p class="card p-5 font-typing text-typing-correct {PREVIEW_CLASS[settings.fontSize]}" {lang}>
        {ui.settings.fontSizePreview}
      </p>
    </section>

    <section class="flex flex-col gap-3" aria-labelledby="settings-caret">
      <h2 id="settings-caret">{ui.settings.caretLabel}</h2>
      <div class="flex flex-wrap gap-2" role="group" aria-labelledby="settings-caret">
        {#each CARET_STYLES as caretStyle}
          <button
            type="button"
            class="btn"
            aria-pressed={settings.caretStyle === caretStyle}
            onclick={() => void settingsStore.update({ caretStyle })}
          >
            {ui.settings.caretStyles[caretStyle]}
          </button>
        {/each}
      </div>
      <!-- A picture of the setting: the typing area itself is the real thing, so screen readers skip this. -->
      <div
        class="card typing-text p-5 font-typing break-words whitespace-pre-wrap {PREVIEW_CLASS[settings.fontSize]}"
        data-testid="caret-preview"
        data-caret-style={settings.caretStyle}
        aria-hidden="true"
        {lang}
      >
        {#each caretSample as char}
          <span
            class={char.typed ? 'text-typing-correct' : 'text-typing-pending'}
            class:caret={char.caret}>{char.ch}</span
          >
        {/each}
      </div>
      <p class="text-caption text-text-muted">{ui.settings.caretHelp}</p>
    </section>

    <section class="flex flex-col gap-3" aria-labelledby="settings-stop-on-error">
      <h2 id="settings-stop-on-error">{ui.settings.stopOnErrorLabel}</h2>
      <div class="flex flex-wrap gap-2" role="group" aria-labelledby="settings-stop-on-error">
        {#each [false, true] as stopOnError}
          <button
            type="button"
            class="btn"
            aria-pressed={settings.stopOnError === stopOnError}
            onclick={() => void settingsStore.update({ stopOnError })}
          >
            {stopOnError ? ui.settings.on : ui.settings.off}
          </button>
        {/each}
      </div>
      <p class="text-caption text-text-muted">{ui.settings.stopOnErrorHelp}</p>
    </section>

    <section class="flex flex-col gap-3" aria-labelledby="settings-sound">
      <h2 id="settings-sound">{ui.settings.soundLabel}</h2>
      <div class="flex flex-wrap gap-2" role="group" aria-labelledby="settings-sound">
        {#each [false, true] as sound}
          <button
            type="button"
            class="btn"
            aria-pressed={settings.sound === sound}
            onclick={() => void settingsStore.update({ sound })}
          >
            {sound ? ui.settings.on : ui.settings.off}
          </button>
        {/each}
      </div>
      {#if settings.sound}
        <label class="flex flex-col gap-1 text-caption text-text-muted">
          <span>
            {ui.settings.volumeLabel}:
            <span class="tabular-nums" data-testid="volume-value">{volumePercent}%</span>
          </span>
          <input
            type="range"
            class="min-h-11 w-full accent-accent"
            min="0"
            max="100"
            step="5"
            value={volumePercent}
            aria-valuetext="{volumePercent}%"
            oninput={(event) => (volumeDraft = Number(event.currentTarget.value))}
            onchange={(event) => saveVolume(Number(event.currentTarget.value))}
          />
        </label>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn" onclick={() => sampleSound.play(settings.volume)}>
            {ui.settings.soundTest}
          </button>
        </div>
      {/if}
      <p class="text-caption text-text-muted">{ui.settings.soundHelp}</p>
    </section>

    <section class="flex flex-col gap-3" aria-labelledby="settings-daily-goal">
      <h2 id="settings-daily-goal">{ui.settings.dailyGoalLabel}</h2>
      <div class="flex flex-wrap gap-2" role="group" aria-labelledby="settings-daily-goal">
        {#each DAILY_GOALS as dailyGoal}
          <button
            type="button"
            class="btn"
            aria-pressed={settings.dailyGoal === dailyGoal}
            onclick={() => void settingsStore.update({ dailyGoal })}
          >
            {dailyGoal === 0
              ? ui.settings.dailyGoalOff
              : ui.settings.dailyGoalTests.replace('{count}', String(dailyGoal))}
          </button>
        {/each}
      </div>
      <p class="text-caption text-text-muted">{ui.settings.dailyGoalHelp}</p>
    </section>

    {#if selectableContentLangs.length > 1}
      <section class="flex flex-col gap-3" aria-labelledby="settings-content-lang">
        <h2 id="settings-content-lang">{ui.test.contentLangLabel}</h2>
        <ContentLangSwitch
          codes={selectableContentLangs}
          value={contentLang}
          {lang}
          label={ui.test.contentLangLabel}
          showLabel={false}
          onSelect={(code) => void settingsStore.update({ contentLang: code })}
        />
        <p class="text-caption text-text-muted">{ui.settings.contentLangHelp}</p>
      </section>
    {/if}

    <p class="text-caption text-text-muted">{ui.settings.savedNote}</p>
  {/if}
</div>
