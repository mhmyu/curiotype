<script lang="ts">
  interface Props {
    /** True when the sentence is in the collection. */
    saved: boolean;
    /** Visible label (`results.saveToCollection`); the saved state is also in `aria-pressed`. */
    label: string;
    onToggle: () => void;
  }

  let { saved, label, onToggle }: Props = $props();
</script>

<!-- Star toggle. The filled and outlined shapes differ, so the state never depends on color alone. -->
<button
  type="button"
  class="-my-2 inline-flex min-h-11 items-center gap-2 text-caption font-semibold text-accent"
  aria-pressed={saved}
  onclick={onToggle}
>
  <svg
    viewBox="0 0 24 24"
    width="20"
    height="20"
    aria-hidden="true"
    fill={saved ? 'currentColor' : 'none'}
    stroke="currentColor"
    stroke-width="2"
    stroke-linejoin="round"
  >
    <path d="M12 2.5l2.94 5.96 6.58.96-4.76 4.64 1.12 6.55L12 17.52l-5.88 3.09 1.12-6.55L2.48 9.42l6.58-.96L12 2.5z" />
  </svg>
  {label}
</button>
