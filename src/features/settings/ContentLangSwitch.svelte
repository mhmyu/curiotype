<script lang="ts">
  import type { ContentLang, Language } from '@/i18n/config';
  import { getLanguageDisplayName } from '@/lib/language-names';

  interface Props {
    /** Sentence languages to choose from (the caller hides the switch when there is only one). */
    codes: readonly ContentLang[];
    /** The language in use. */
    value: ContentLang;
    /** Interface language: the names are written in it ("Inggris" on /id/). */
    lang: Language;
    /** Name of the select (`test.contentLangLabel`). */
    label: string;
    onSelect: (code: ContentLang) => void;
    /** Show the label above the select; pages that already have a heading with it turn this off. */
    showLabel?: boolean;
    /**
     * One-row layout (home page): no visible label, the option text is the short code ("ID", "EN");
     * the full name stays in the `aria-label` and `title`.
     */
    compact?: boolean;
    /** Greys the select out (compact variant; the home page does this until its sentences have loaded). */
    disabled?: boolean;
  }

  let { codes, value, lang, label, onSelect, showLabel = true, compact = false, disabled = false }: Props = $props();

  const currentName = $derived(getLanguageDisplayName(value, lang));
  /** "pt-br" -> "PT": the part before the region. */
  const shortCode = (code: string) => code.split('-')[0].toUpperCase();
</script>

<!--
  Native select, one option per sentence language: the phone's own picker opens and the control
  stays tidy when languages are added. Shared by the home, collection, statistics and settings pages.
-->
{#if compact}
  <select
    class="field field-compact"
    aria-label={label}
    title={currentName}
    {disabled}
    {value}
    onchange={(event) => onSelect(event.currentTarget.value)}
  >
    {#each codes as code}
      <option value={code} selected={code === value} title={getLanguageDisplayName(code, lang)}>
        {shortCode(code)}
      </option>
    {/each}
  </select>
{:else}
<label class="flex w-fit max-w-full flex-col gap-1 text-caption text-text-muted">
  {#if showLabel}<span>{label}</span>{/if}
  <select
    class="field w-auto max-w-full"
    aria-label={showLabel ? undefined : label}
    {value}
    onchange={(event) => onSelect(event.currentTarget.value)}
  >
    {#each codes as code}
      <option value={code} selected={code === value}>{getLanguageDisplayName(code, lang)}</option>
    {/each}
  </select>
</label>
{/if}
