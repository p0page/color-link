<script lang="ts">
  import { MediaQuery } from 'svelte/reactivity';
  import type { Snippet } from 'svelte';

  let { id, title, onClose, children }: {
    id: string;
    title: string;
    onClose: () => void;
    children: Snippet;
  } = $props();

  const narrow = new MediaQuery('(max-width: 640px)');
  const titleId = $props.id();
  let modal = $state<HTMLDialogElement>();
  let heading = $state<HTMLHeadingElement>();
  let pressedBackdrop = false;

  function isBackdrop(event: MouseEvent) {
    if (!modal || event.target !== modal) return false;
    const { top } = modal.getBoundingClientRect();
    return event.clientY < top;
  }

  $effect(() => {
    modal?.showModal();
    heading?.focus();
  });
</script>

{#snippet header()}
  <header>
    <h3 id={titleId} tabindex="-1" bind:this={heading}>{title}</h3>
    <button type="button" class="close" aria-label="收起地图库" onclick={onClose}>
      <span aria-hidden="true">×</span>
    </button>
  </header>
{/snippet}

{#if narrow.current}
  <dialog class="picker-sheet" {id} bind:this={modal} aria-labelledby={titleId}
    onpointerdown={(event) => (pressedBackdrop = isBackdrop(event))}
    onclick={(event) => { if (pressedBackdrop && isBackdrop(event)) onClose(); }}
    oncancel={(event) => { event.preventDefault(); onClose(); }}>
    {@render header()}
    <div class="sheet-content">
      {@render children()}
    </div>
  </dialog>
{:else}
  <section class="picker-panel" {id} aria-labelledby={titleId}>
    {@render header()}
    {@render children()}
  </section>
{/if}

<style>
  .picker-panel {
    display: grid;
    gap: 12px;
    padding: 12px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    background: var(--bg-surface);
    text-align: start;
  }

  header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  h3 {
    margin: 0;
    font-size: 0.95rem;
  }

  h3:focus {
    outline: none;
  }

  .close {
    flex-shrink: 0;
    width: 44px;
    height: 44px;
    padding: 0;
    border-radius: var(--radius-pill);
    background: var(--bg-elevated);
    font-size: 1.25rem;
  }

  .picker-sheet {
    position: fixed;
    inset: auto 0 0;
    width: 100%;
    max-width: none;
    max-height: 78dvh;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    background: var(--bg-surface);
    color: var(--text-primary);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    text-align: start;
  }

  .picker-sheet[open] {
    display: flex;
    flex-direction: column;
  }

  .picker-sheet::backdrop {
    background: var(--modal-overlay);
  }

  .picker-sheet header {
    flex-shrink: 0;
    padding: 10px 14px;
    border-bottom: 1px solid var(--border-subtle);
  }

  .sheet-content {
    min-height: 0;
    padding: 12px 14px max(16px, env(safe-area-inset-bottom));
    overflow: auto;
    overscroll-behavior: contain;
  }
</style>
