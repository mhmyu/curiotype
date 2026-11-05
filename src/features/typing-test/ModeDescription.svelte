<script lang="ts">
  import type { ModeId } from '@/lib/types';
  import type { Dictionary } from '@/i18n/types';

  interface Props {
    ui: Dictionary;
    mode: ModeId;
  }

  let { ui, mode }: Props = $props();
</script>

<!-- Always visible, not live: it only changes when the mode does, and the select already announces that. -->
<p class="text-caption text-text-muted" data-testid="mode-description">
  {ui.test.modeDescriptions[mode]}
</p>
