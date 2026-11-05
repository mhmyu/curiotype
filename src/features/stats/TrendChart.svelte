<script lang="ts">
  import { getTrendMax } from './stats';
  import type { TrendPoint } from './stats';

  interface Props {
    /** Oldest first. */
    points: readonly TrendPoint[];
    /** Caption above the chart. */
    caption: string;
    /** Text alternative of the picture (the numbers it shows). */
    description: string;
  }

  let { points, caption, description }: Props = $props();

  // Drawing area in viewBox units. The axis labels are HTML, not SVG text, so they keep the
  // 14px minimum size when the SVG scales down on a phone.
  const WIDTH = 300;
  const HEIGHT = 120;
  const PADDING_X = 8;
  const PADDING_Y = 8;
  const LAST_RADIUS = 4;
  const RADIUS = 2.5;

  const max = $derived(getTrendMax(points));
  const top = PADDING_Y;
  const bottom = HEIGHT - PADDING_Y;

  const coordinates = $derived(
    points.map((point, index) => {
      // A single test sits in the middle; more are spread over the full width.
      const x =
        points.length === 1
          ? WIDTH / 2
          : PADDING_X + (index * (WIDTH - PADDING_X * 2)) / (points.length - 1);
      const y = bottom - (point.wpm / max) * (bottom - top);
      return { id: point.id, x, y };
    }),
  );
  const line = $derived(coordinates.map(({ x, y }) => `${x.toFixed(1)},${y.toFixed(1)}`).join(' '));
</script>

<figure class="flex flex-col gap-2">
  <figcaption class="text-caption text-text-muted">{caption}</figcaption>
  <div class="relative pl-10">
    <span
      class="text-caption absolute left-0 -translate-y-1/2 tabular-nums text-text-muted"
      style:top="{(top / HEIGHT) * 100}%"
      aria-hidden="true">{max}</span
    >
    <span
      class="text-caption absolute left-0 -translate-y-1/2 tabular-nums text-text-muted"
      style:top="{(bottom / HEIGHT) * 100}%"
      aria-hidden="true">0</span
    >
    <svg viewBox="0 0 {WIDTH} {HEIGHT}" class="block h-auto w-full text-accent" role="img" aria-label={description}>
      <!-- Top and bottom of the axis in the border color (3:1 against the card). -->
      <line x1={PADDING_X} x2={WIDTH - PADDING_X} y1={top} y2={top} stroke="var(--border)" stroke-width="1" />
      <line
        x1={PADDING_X}
        x2={WIDTH - PADDING_X}
        y1={bottom}
        y2={bottom}
        stroke="var(--border)"
        stroke-width="1"
      />
      {#if coordinates.length > 1}
        <polyline
          points={line}
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
      {/if}
      {#each coordinates as point, index (point.id)}
        <circle
          cx={point.x}
          cy={point.y}
          r={index === coordinates.length - 1 ? LAST_RADIUS : RADIUS}
          fill="currentColor"
        />
      {/each}
    </svg>
  </div>
</figure>
