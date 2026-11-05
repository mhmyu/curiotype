<script lang="ts">
  import { onMount } from 'svelte';
  import type { Dictionary } from '@/i18n/types';
  import { applyUpdate, registerServiceWorker } from './register';
  import type { ServiceWorkerLike } from './register';

  interface Props {
    /** Only the three strings of the toast, so the page does not carry the whole dictionary. */
    text: Dictionary['pwa'];
  }

  let { text }: Props = $props();

  let waitingWorker = $state.raw<ServiceWorkerLike | null>(null);
  let dismissed = $state(false);

  onMount(() => {
    void registerServiceWorker((worker) => {
      waitingWorker = worker;
      dismissed = false;
    });
  });

  function reload() {
    if (waitingWorker) {
      applyUpdate(waitingWorker, navigator.serviceWorker, () => window.location.reload());
    }
  }
</script>

<!-- The toast sits at the TOP of the screen: at the bottom it covered the typing field on a 390x844 phone (T34).
     Registers the service worker and offers an update. The live region exists before the toast, so
     screen readers announce it. Nothing here reloads the page without a tap on the button. -->
<div
  role="status"
  class="pointer-events-none fixed inset-x-0 top-0 z-50 px-4 pt-[max(1rem,env(safe-area-inset-top))]"
>
  {#if waitingWorker && !dismissed}
    <div
      class="card pointer-events-auto mx-auto flex w-full max-w-3xl flex-wrap items-center justify-between gap-x-4 gap-y-3 border-2 border-border px-4 py-3"
      data-testid="update-toast"
    >
      <p class="text-ui">{text.updateAvailable}</p>
      <div class="flex gap-2">
        <button type="button" class="btn" onclick={() => (dismissed = true)}>{text.later}</button>
        <button type="button" class="btn btn-primary" onclick={reload}>{text.reload}</button>
      </div>
    </div>
  {/if}
</div>
