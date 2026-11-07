<script lang="ts">
  import { tick } from 'svelte';
  import type { TypingState } from '@/features/typing-engine/engine';
  import { settingsStore } from '@/features/settings/settings.svelte';
  import { TYPING_SIZE_CLASS } from './sizes';
  import type { Dictionary } from '@/i18n/types';
  import { isComposingKey, shouldDeferInput } from './composition';
  import { lockCaretToEnd, shouldBlockKey } from './caret-lock';

  interface Props {
    /** Current target and typed text. The parent owns it; this component only displays it. */
    typingState: TypingState;
    ui: Dictionary;
    /** Language of the target text (may differ from the interface language). */
    lang: string;
    /** Called with the full value of the input after every change. */
    onInput: (value: string) => void;
    /** Called when the user presses Escape (the parent restarts the test). */
    onEscape: () => void;
    disabled?: boolean;
  }

  let { typingState, ui, lang, onInput, onEscape, disabled = false }: Props = $props();

  /** The overlay waits this long, so a click on a nearby button (which blurs the input briefly) does not flash it. */
  const OVERLAY_DELAY_MS = 150;

  let inputEl: HTMLInputElement | undefined = $state();
  let textEl: HTMLDivElement | undefined = $state();
  let overlayEl: HTMLButtonElement | undefined = $state();
  let overlayVisible = $state(false);

  // Runtime values that never drive the UI
  let focusLost = false;
  /** True between compositionstart and compositionend (dead key or input method). */
  let composing = false;
  let overlayTimer: number | undefined;

  /** Moves keyboard focus to the input (opens the virtual keyboard on phones). */
  export function focus() {
    inputEl?.focus();
  }

  const chars = $derived(
    typingState.target.split('').map((ch, index) => ({
      ch,
      state:
        index < typingState.typed.length
          ? typingState.typed[index] === ch
            ? ('correct' as const)
            : ('incorrect' as const)
          : ('pending' as const),
    })),
  );

  /*
   * Character states (design palette). A wrong
   * character is never shown by color alone: it also gets an underline and a tint,
   * which makes a mistyped space visible too.
   */
  const STATE_CLASS = {
    pending: 'text-typing-pending',
    correct: 'text-typing-correct',
    incorrect: 'bg-error/15 text-error underline decoration-2 underline-offset-4',
  } as const;

  // Size comes from the fontSize setting (classes in ./sizes, shared with the loading placeholder).
  const sizeClass = $derived(
    `${TYPING_SIZE_CLASS[settingsStore.current.fontSize].text} ${TYPING_SIZE_CLASS[settingsStore.current.fontSize].height}`,
  );
  const caretStyle = $derived(settingsStore.current.caretStyle);

  function clearOverlayTimer() {
    if (overlayTimer !== undefined) {
      window.clearTimeout(overlayTimer);
      overlayTimer = undefined;
    }
  }

  function handleFocus() {
    focusLost = false;
    clearOverlayTimer();
    overlayVisible = false;
  }

  function handleBlur() {
    focusLost = true;
    clearOverlayTimer();
    overlayTimer = window.setTimeout(() => {
      overlayVisible = true;
    }, OVERLAY_DELAY_MS);
  }

  /*
   * While the input has lost focus, a key press brings it back, but only when nothing
   * else is focused (the page body). A keyboard user who tabbed to a chip or a select
   * keeps full control of it: their keys are never taken over.
   */
  function handleWindowKeydown(event: KeyboardEvent) {
    if (!focusLost || disabled || event.isComposing) return;
    if (event.key === 'Tab' || event.ctrlKey || event.metaKey || event.altKey) return;
    const active = document.activeElement;
    if (active && active !== document.body && active !== overlayEl) return;
    focus();
  }

  /** Sends the field's value to the parent, then keeps the field equal to the (NFC) typed text. */
  function commitInput(input: HTMLInputElement) {
    onInput(input.value);
    // The parent may have shortened the text (typing past the end is ignored) or normalised it
    // (e + U+0301 becomes one character): keep the field in sync so lengths never drift.
    if (input.value !== typingState.typed) input.value = typingState.typed;
  }

  /*
   * The engine only works while the caret is at the end of the input (see caret-lock.ts). Anything
   * that moves it (a click, a tap, a drag, a script) is undone here. It is never touched during a
   * composition, because changing the selection would cancel it.
   */
  function keepCaretAtEnd(event: Event & { currentTarget: HTMLInputElement }) {
    if (!composing) lockCaretToEnd(event.currentTarget);
  }

  function handleInput(event: Event & { currentTarget: HTMLInputElement }) {
    // Provisional text of a dead key or input method: neither counted nor rewritten.
    if (shouldDeferInput(composing, event as InputEvent)) return;
    commitInput(event.currentTarget);
  }

  // The final text arrives with compositionend (Safari may also fire one more `input` after it;
  // the engine ignores the repeated value, because only characters beyond the old length count).
  function handleCompositionEnd(event: CompositionEvent & { currentTarget: HTMLInputElement }) {
    composing = false;
    commitInput(event.currentTarget);
  }

  // A reset from the parent (new test, restart) clears the field.
  $effect(() => {
    if (inputEl && inputEl.value !== typingState.typed) inputEl.value = typingState.typed;
  });

  // Never leave a pending timer behind when the component goes away.
  $effect(() => clearOverlayTimer);

  // Keep the caret inside the scrollable text area.
  $effect(() => {
    void typingState.typed;
    void tick().then(() => {
      const caret = textEl?.querySelector<HTMLElement>('[data-caret]');
      if (!textEl || !caret) return;
      textEl.scrollTop = Math.max(0, caret.offsetTop - textEl.clientHeight / 2);
    });
  });
</script>

<svelte:window onkeydown={handleWindowKeydown} />

<!--
  The transparent input sits on top of the text, so a tap anywhere opens the mobile keyboard.
  The input is invisible (opacity 0), so its own focus outline would be invisible too: the
  ring is drawn on the box with focus-within.
-->
<div
  class="relative rounded-container border-2 border-border bg-surface p-5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent"
>
  <div
    bind:this={textEl}
    {lang}
    data-caret-style={caretStyle}
    class="typing-text relative overflow-hidden font-typing break-words whitespace-pre-wrap {sizeClass}"
    class:is-blurred={overlayVisible && !disabled}
  >
    {#each chars as char, index}
      {@const isCaret = index === typingState.typed.length}
      <span
        class={STATE_CLASS[char.state]}
        class:caret={isCaret}
        data-caret={isCaret ? '' : undefined}>{char.ch}</span
      >
    {/each}
  </div>
  <input
    bind:this={inputEl}
    type="text"
    class="absolute inset-0 h-full w-full cursor-text rounded-container text-base opacity-0"
    aria-label={ui.test.inputLabel}
    autocomplete="off"
    autocapitalize="off"
    autocorrect="off"
    spellcheck="false"
    {disabled}
    onfocus={(event) => {
      handleFocus();
      keepCaretAtEnd(event);
    }}
    onblur={handleBlur}
    onbeforeinput={keepCaretAtEnd}
    oninput={handleInput}
    onselect={keepCaretAtEnd}
    onpointerup={keepCaretAtEnd}
    onclick={keepCaretAtEnd}
    onpaste={(event) => event.preventDefault()}
    ondrop={(event) => event.preventDefault()}
    oncompositionstart={() => (composing = true)}
    oncompositionend={handleCompositionEnd}
    onkeydown={(event) => {
      // Escape during a composition cancels the composition, not the test.
      if (isComposingKey(event)) return;
      // Keys that move the caret or select text would shift the typed text against the target.
      if (shouldBlockKey(event)) {
        event.preventDefault();
        return;
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        onEscape();
      }
    }}
  />
  {#if overlayVisible && !disabled}
    <button
      bind:this={overlayEl}
      type="button"
      class="absolute inset-0 z-10 flex cursor-pointer items-center justify-center rounded-container bg-surface/60"
      onclick={() => focus()}
    >
      <span class="rounded-container border-2 border-border bg-surface px-5 py-3 text-ui text-text">
        {ui.test.focusLost}
      </span>
    </button>
  {/if}
</div>

<style>
  /* The blur only hides the text while the input has no focus; reduced motion makes it instant. */
  .typing-text {
    transition: filter 300ms ease;
  }

  .typing-text.is-blurred {
    filter: blur(6px);
  }

  /* The caret itself (`.caret`, shaped by `data-caret-style`) is styled in global.css, so the settings preview shares it. */
</style>
