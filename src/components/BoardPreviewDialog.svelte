<script lang="ts">
  import { onMount } from 'svelte';
  import type { MatchBoard } from '../lib/types';
  import BoardInfo from './BoardInfo.svelte';
  import BoardPreview from './BoardPreview.svelte';

  let { board, onClose }: { board: MatchBoard; onClose: () => void } = $props();
  const titleId = $props.id();
  let dialog: HTMLDialogElement;

  onMount(() => dialog.showModal());
</script>

<dialog bind:this={dialog} aria-labelledby={titleId} onclose={onClose}>
  <div class="dialog-header">
    <h2 id={titleId}><BoardInfo {board} /></h2>
    <button type="button" class="btn btn-ghost close" aria-label="关闭棋盘预览" onclick={() => dialog.close()}>
      <span aria-hidden="true">×</span>
    </button>
  </div>
  <BoardPreview blueprint={board.blueprint} size="100%" detailed />
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
    font-size: 1.4rem;
    line-height: 1;
  }
</style>
