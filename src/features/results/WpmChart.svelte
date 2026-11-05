<script lang="ts">
  interface Props {
    samples: readonly number[];
    label: string;
  }

  let { samples, label }: Props = $props();

  const WIDTH = 300;
  const HEIGHT = 100;
  const PADDING = 6;

  const points = $derived.by(() => {
    if (samples.length < 2) return '';
    const max = Math.max(...samples, 1);
    const stepX = (WIDTH - PADDING * 2) / (samples.length - 1);
    return samples
      .map((value, index) => {
        const x = PADDING + index * stepX;
        const y = HEIGHT - PADDING - (value / max) * (HEIGHT - PADDING * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  });
</script>

{#if points}
  <figure class="flex flex-col gap-1">
    <figcaption class="text-caption text-text-muted">{label}</figcaption>
    <svg viewBox="0 0 {WIDTH} {HEIGHT}" class="w-full text-accent" role="img" aria-label={label}>
      <!-- Baseline in the border color (3:1 against the card). -->
      <line
        x1={PADDING}
        x2={WIDTH - PADDING}
        y1={HEIGHT - PADDING}
        y2={HEIGHT - PADDING}
        stroke="var(--border)"
        stroke-width="1"
      />
      <polyline
        {points}
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </figure>
{/if}
