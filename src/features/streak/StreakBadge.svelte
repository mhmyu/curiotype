<script lang="ts">
  import type { Dictionary } from '@/i18n/types';
  import { getGoalProgress } from './streak';
  import type { StreakView } from './streak';

  interface Props {
    ui: Dictionary;
    view: StreakView;
    /** Daily goal in tests; 0 = off. */
    dailyGoal: number;
  }

  let { ui, view, dailyGoal }: Props = $props();

  const progress = $derived(getGoalProgress(view.todayCount, dailyGoal));

  function fill(template: string, values: Record<string, string | number>): string {
    return template.replace(/\{(\w+)\}/g, (match, key: string) =>
      key in values ? String(values[key]) : match,
    );
  }
</script>

<!-- Streak (days in a row) and progress toward the daily goal. Shown only when there is something to say. -->
{#if view.current > 0 || progress}
  <div
    class="card flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3"
    role="group"
    aria-label={ui.streak.label}
    data-testid="streak-badge"
  >
    {#if view.current > 0}
      <p class="flex items-center gap-2 text-ui" data-testid="streak-days">
        <svg
          class="size-5 shrink-0 text-accent"
          viewBox="0 0 24 24"
          fill="currentColor"
          aria-hidden="true"
          focusable="false"
        >
          <path
            d="M12 2c.4 3.1-1.2 4.9-2.8 6.6C7.6 10.3 6 12 6 14.8 6 18.2 8.7 21 12 21s6-2.8 6-6.2c0-2.3-1-4-2.2-5.4-.4 1.3-1.1 2.2-2.1 2.8.3-3.6-.5-7.5-1.7-10.2Z"
          />
        </svg>
        <span>{fill(ui.streak.days, { count: view.current })}</span>
      </p>
    {/if}

    {#if progress}
      <div class="flex min-w-48 flex-1 flex-col gap-1" data-testid="goal-progress">
        <p class="flex flex-wrap items-baseline justify-between gap-x-3 text-caption text-text-muted">
          <span class="tabular-nums">
            {fill(ui.streak.todayProgress, { done: progress.done, goal: progress.goal })}
          </span>
          {#if progress.reached}
            <span class="font-semibold text-text">✓ {ui.streak.goalReached}</span>
          {/if}
        </p>
        <div class="h-2 overflow-hidden rounded-full bg-border" aria-hidden="true">
          <div
            class="h-full rounded-full bg-accent"
            style:width="{(progress.done / progress.goal) * 100}%"
          ></div>
        </div>
      </div>
    {/if}
  </div>
{/if}
