<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { settingsStore } from '@/features/settings/settings.svelte';
  import type { Dictionary } from '@/i18n/types';
  import { getStorage } from '@/lib/storage';
  import {
    applyImport,
    buildExport,
    clearAllData,
    exportFileName,
    isImportSizeAllowed,
    parseImport,
    summarizeImport,
  } from './data-transfer';
  import type { ImportMode, ImportParse } from './data-transfer';

  interface Props {
    ui: Dictionary;
  }

  let { ui }: Props = $props();
  const text = $derived(ui.dataTools);

  type Notice = { kind: 'success' | 'error'; message: string };
  type Confirm = 'overwrite' | 'clear';

  // The controls render after mount, so a click can never arrive before the code is ready.
  let mounted = $state(false);
  let busy = $state(false);
  let notice = $state<Notice | null>(null);
  // A file that passed every check and waits for the user to pick a method and confirm.
  let pending = $state<{ data: Record<string, unknown>; tests: number } | null>(null);
  let mode = $state<ImportMode>('merge');
  let confirming = $state<Confirm | null>(null);
  let fileInput = $state<HTMLInputElement>();
  let dialog = $state<HTMLDialogElement>();

  onMount(() => {
    mounted = true;
  });

  function describeError(result: Extract<ImportParse, { ok: false }>): string {
    return text.importErrors[result.error].replace('{key}', result.key ?? '');
  }

  async function exportData() {
    notice = null;
    try {
      const file = await buildExport(getStorage());
      const blob = new Blob([JSON.stringify(file, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = exportFileName(new Date());
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      notice = { kind: 'success', message: text.exportDone };
    } catch {
      notice = { kind: 'error', message: text.readFailed };
    }
  }

  async function onFileChosen(event: Event) {
    const input = event.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    pending = null;
    notice = null;
    if (!file) return;

    if (!isImportSizeAllowed(file.size)) {
      notice = { kind: 'error', message: text.importErrors['too-large'] };
      input.value = '';
      return;
    }
    let content: string;
    try {
      content = await file.text();
    } catch {
      notice = { kind: 'error', message: text.readFailed };
      return;
    } finally {
      // Lets the same file be chosen again after a fix.
      input.value = '';
    }

    const result = parseImport(content);
    if (!result.ok) {
      notice = { kind: 'error', message: describeError(result) };
      return;
    }
    mode = 'merge';
    pending = { data: result.data, tests: summarizeImport(result.data).tests };
  }

  function cancelImport() {
    pending = null;
  }

  async function openConfirm(kind: Confirm) {
    confirming = kind;
    await tick();
    dialog?.showModal();
  }

  async function runImport() {
    if (!pending) return;
    if (mode === 'overwrite') {
      await openConfirm('overwrite');
      return;
    }
    await doImport();
  }

  async function doImport() {
    const current = pending;
    if (!current) return;
    busy = true;
    try {
      await applyImport(getStorage(), current.data, mode);
      // The settings store keeps its own copy: reload it so the page shows (and applies) the new values.
      await settingsStore.reload();
      pending = null;
      notice = { kind: 'success', message: text.importDone };
    } catch {
      notice = { kind: 'error', message: text.saveFailed };
    } finally {
      busy = false;
    }
  }

  async function doClear() {
    busy = true;
    try {
      await clearAllData(getStorage());
      await settingsStore.reload();
      pending = null;
      notice = { kind: 'success', message: text.clearDone };
    } catch {
      notice = { kind: 'error', message: text.saveFailed };
    } finally {
      busy = false;
    }
  }

  async function confirmAction() {
    const kind = confirming;
    dialog?.close();
    if (kind === 'overwrite') await doImport();
    if (kind === 'clear') await doClear();
  }
</script>

<div class="flex flex-col gap-8">
  <section class="flex flex-col gap-3" aria-labelledby="data-tools-title">
    <h2 id="data-tools-title">{text.title}</h2>
    <p class="text-caption text-text-muted">{text.description}</p>
  </section>

  {#if mounted}
    <section class="flex flex-col gap-3" aria-labelledby="data-export-title">
      <h3 id="data-export-title">{text.exportTitle}</h3>
      <p class="text-caption text-text-muted">{text.exportHelp}</p>
      <div>
        <button type="button" class="btn" onclick={() => void exportData()}>{text.exportButton}</button>
      </div>
    </section>

    <section class="flex flex-col gap-3" aria-labelledby="data-import-title">
      <h3 id="data-import-title">{text.importTitle}</h3>
      <p class="text-caption text-text-muted">{text.importHelp}</p>
      <div>
        <button type="button" class="btn" onclick={() => fileInput?.click()}>{text.importButton}</button>
        <input
          bind:this={fileInput}
          type="file"
          accept="application/json,.json"
          hidden
          data-testid="import-file"
          onchange={(event) => void onFileChosen(event)}
        />
      </div>

      {#if pending}
        <div class="card flex flex-col gap-3 p-5">
          <p class="text-body-long">{text.importReady.replace('{tests}', String(pending.tests))}</p>
          <div class="flex flex-wrap gap-2" role="group" aria-label={text.importModeLabel}>
            <button type="button" class="btn" aria-pressed={mode === 'merge'} onclick={() => (mode = 'merge')}>
              {text.importModeMerge}
            </button>
            <button
              type="button"
              class="btn"
              aria-pressed={mode === 'overwrite'}
              onclick={() => (mode = 'overwrite')}
            >
              {text.importModeOverwrite}
            </button>
          </div>
          <p class="text-caption text-text-muted">
            {mode === 'merge' ? text.importMergeHelp : text.importOverwriteHelp}
          </p>
          <div class="flex flex-wrap gap-2">
            <button type="button" class="btn btn-primary" disabled={busy} onclick={() => void runImport()}>
              {text.importConfirm}
            </button>
            <button type="button" class="btn" disabled={busy} onclick={cancelImport}>{text.cancel}</button>
          </div>
        </div>
      {/if}
    </section>

    <section class="flex flex-col gap-3" aria-labelledby="data-clear-title">
      <h3 id="data-clear-title">{text.clearTitle}</h3>
      <p class="text-caption text-text-muted">{text.clearHelp}</p>
      <div>
        <button
          type="button"
          class="btn border-error text-error"
          disabled={busy}
          onclick={() => void openConfirm('clear')}
        >
          {text.clearButton}
        </button>
      </div>
    </section>

    <!-- Shared by "overwrite on import" and "delete all data". Esc and Cancel close it without effect. -->
    <dialog
      bind:this={dialog}
      aria-labelledby="data-confirm-title"
      class="card m-auto w-[calc(100%-2rem)] max-w-md border-2 border-border p-5 text-text backdrop:bg-background/80"
      onclose={() => (confirming = null)}
    >
      <div class="flex flex-col gap-3">
        <h2 id="data-confirm-title">
          {confirming === 'clear' ? text.clearConfirmTitle : text.overwriteConfirmTitle}
        </h2>
        <p class="text-body-long">
          {confirming === 'clear' ? text.clearConfirmBody : text.overwriteConfirmBody}
        </p>
        <div class="flex flex-wrap gap-2">
          <button type="button" class="btn" onclick={() => dialog?.close()}>{text.cancel}</button>
          <button type="button" class="btn border-error text-error" onclick={() => void confirmAction()}>
            {confirming === 'clear' ? text.clearConfirmButton : text.overwriteConfirmButton}
          </button>
        </div>
      </div>
    </dialog>
  {/if}

  <div aria-live="polite" role="status">
    {#if notice?.kind === 'success'}
      <p class="text-body-long">{notice.message}</p>
    {/if}
  </div>
  {#if notice?.kind === 'error'}
    <p role="alert" class="text-body-long font-semibold text-error">{notice.message}</p>
  {/if}
</div>
