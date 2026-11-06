<script lang="ts">
  import type { Dictionary } from '@/i18n/types';
  import type { Sentence } from '@/lib/types';

  interface Props {
    ui: Dictionary;
    /** Label of the sentence's category in the interface language. */
    categoryLabel: (id: string) => string;
    /** The fact of the day (chosen by `pickDailyFact`). */
    sentence: Sentence;
    /** Starts a Sentence test with this sentence. */
    onType: (sentence: Sentence) => void;
  }

  let { ui, categoryLabel, sentence, onType }: Props = $props();
</script>

<!-- Fact of the day on the home page: the sentence, its explanation and source, and a button to type it. -->
<section
  class="card flex flex-col gap-3 p-5"
  aria-labelledby="daily-fact-title"
  data-testid="daily-fact"
  data-sentence-id={sentence.id}
>
  <h2 id="daily-fact-title" class="font-heading text-h3 font-semibold">{ui.dailyFact.title}</h2>
  <p class="text-body-long font-semibold" lang={sentence.lang}>{sentence.text}</p>
  <p class="text-body-long text-text-muted">{sentence.explanation}</p>
  <p class="text-caption text-text-muted">
    {categoryLabel(sentence.category)} · {ui.difficulties[sentence.difficulty]} ·
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
  <div>
    <button type="button" class="btn btn-primary" onclick={() => onType(sentence)}>
      {ui.dailyFact.typeIt}
    </button>
  </div>
</section>
