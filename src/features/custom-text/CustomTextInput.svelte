<script lang="ts">
  import ModeDescription from '@/features/typing-test/ModeDescription.svelte';
  import type { Dictionary } from '@/i18n/types';
  import type { CustomText } from './custom-texts';
  import { MAX_CUSTOM_TEXT_LENGTH, normalizeCustomText } from './normalize';

  interface Props {
    ui: Dictionary;
    /** Saved texts, newest first. */
    saved: readonly CustomText[];
    /** Start a test with this (already normalized) text. */
    onStart: (text: string) => void;
    onRemove: (id: string) => void;
  }

  let { ui, saved, onStart, onRemove }: Props = $props();

  let raw = $state('');

  // Everything shown below the textarea comes from the same pure function the test uses.
  const normalized = $derived(normalizeCustomText(raw));

  function fill(template: string, values: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) =>
      key in values ? String(values[key]) : match,
    );
  }

  function start() {
    if (normalized.ok) onStart(normalized.text);
  }
</script>

<section class="flex flex-col gap-4" aria-labelledby="custom-text-title">
  <h2 id="custom-text-title" class="text-h2">{ui.customText.title}</h2>

  <div class="flex flex-col gap-2">
    <label class="flex flex-col gap-1 text-caption text-text-muted">
      <span>{ui.customText.textareaLabel}</span>
      <!-- 16px keeps iOS Safari from zooming in when the field gets focus. -->
      <textarea
        class="field min-h-40 w-full resize-y font-typing text-base text-text"
        data-testid="custom-text-input"
        rows="6"
        maxlength={MAX_CUSTOM_TEXT_LENGTH}
        placeholder={ui.customText.placeholder}
        autocomplete="off"
        autocapitalize="off"
        spellcheck="false"
        bind:value={raw}
      ></textarea>
    </label>
    <p class="text-caption text-text-muted tabular-nums" data-testid="custom-text-counter">
      {fill(ui.customText.counter, { count: raw.length, max: MAX_CUSTOM_TEXT_LENGTH })}
    </p>
  </div>

  {#if raw.length > 0}
    <div class="flex flex-col gap-2">
      {#if normalized.ok}
        <p class="text-caption text-text-muted">{ui.customText.previewLabel}</p>
        <p
          class="card max-h-48 overflow-y-auto break-words p-4 font-typing text-typing-sm text-typing-correct"
          data-testid="custom-text-preview"
        >
          {normalized.text}
        </p>
        {#if normalized.changedChars > 0}
          <p class="text-caption text-text-muted" role="status" data-testid="custom-text-changed">
            {fill(ui.customText.changed, { count: normalized.changedChars })}
          </p>
        {/if}
      {:else}
        <p class="text-caption text-error" role="alert" data-testid="custom-text-error">
          {normalized.reason === 'too-long'
            ? fill(ui.customText.tooLong, { max: MAX_CUSTOM_TEXT_LENGTH })
            : ui.customText.empty}
        </p>
      {/if}
    </div>
  {/if}

  <div class="flex flex-wrap items-center gap-3">
    <button
      type="button"
      class="btn btn-primary"
      data-testid="custom-text-start"
      disabled={!normalized.ok}
      onclick={start}
    >
      {ui.customText.start}
    </button>
  </div>

  <ModeDescription {ui} mode="custom" />
  <p class="text-caption text-text-muted">{ui.customText.hint}</p>

  {#if saved.length > 0}
    <div class="flex flex-col gap-3 border-t-2 border-border pt-4">
      <h3 class="text-h3">{ui.customText.savedTitle}</h3>
      <ul class="flex flex-col gap-3" data-testid="custom-text-saved">
        {#each saved as entry (entry.id)}
          <li class="card flex flex-col gap-3 p-4">
            <p class="line-clamp-2 break-words font-typing text-typing-sm text-typing-correct">
              {entry.text}
            </p>
            <div class="flex flex-wrap gap-2">
              <button type="button" class="btn btn-primary" onclick={() => onStart(entry.text)}>
                {ui.customText.useSaved}
              </button>
              <button type="button" class="btn" onclick={() => onRemove(entry.id)}>
                {ui.customText.removeSaved}
              </button>
            </div>
          </li>
        {/each}
      </ul>
    </div>
  {/if}
</section>
