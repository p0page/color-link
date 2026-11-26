<script lang="ts">
  import { onMount } from 'svelte';
  import type { MatchBoard } from '../lib/types';
  import BoardInfo from './BoardInfo.svelte';
  import BoardPreview from './BoardPreview.svelte';

  let { board, onClose, onSelect }: { board: MatchBoard; onClose: () => void; onSelect?: () => void } = $props();
  const titleId = $props.id();
  let dialog: HTMLDialogElement;
  let pressedBackdrop = false;

  function isBackdrop(event: MouseEvent) {
    if (event.target !== dialog) return false;
    const { left, right, top, bottom } = dialog.getBoundingClientRect();
    return event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom;
  }

  onMount(() => dialog.showModal());
</script>

<dialog bind:this={dialog} aria-labelledby={titleId} onclose={onClose}
  onpointerdown={(event) => (pressedBackdrop = isBackdrop(event))}
  onclick={(event) => { if (pressedBackdrop && isBackdrop(event)) dialog.close(); }}>
  <div class="dialog-header">
    <h2 id={titleId}><BoardInfo {board} /></h2>
    <button type="button" class="close" aria-label="关闭棋盘预览" onclick={() => dialog.close()}>
      <span aria-hidden="true">×</span>
    </button>
  </div>
  <BoardPreview blueprint={board.blueprint} size="100%" detailed />
  {#if onSelect}
    <button type="button" class="btn btn-primary select-board" onclick={() => {
      dialog.close();
      onSelect?.();
    }}>选用此地图</button>
  {/if}
</dialog>

<style>
  dialog {
    width: min(526px, max(286px, calc(70dvh + 46px)));
    max-width: calc(100% - 24px);
    max-height: calc(100% - 24px);
    margin: auto;
    padding: clamp(14px, 4vw, 22px);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    background: var(--bg-surface);
    color: var(--text-primary);
    box-shadow: var(--shadow-lg);
    overflow: auto;
  }

  dialog::backdrop {
    background: var(--modal-overlay);
    backdrop-filter: blur(4px);
  }

  .dialog-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 14px;
    margin-bottom: 14px;
  }

  h2 {
    margin: 0;
    font-size: 1.15rem;
    line-height: 1.4;
  }

  .close {
    min-width: 44px;
    min-height: 44px;
    padding: 0;
    border-radius: var(--radius-pill);
    background: var(--bg-elevated);
    font-size: 1.4rem;
    line-height: 1;
  }

  .select-board {
    width: 100%;
    min-height: 44px;
    margin-top: 12px;
  }
</style>
