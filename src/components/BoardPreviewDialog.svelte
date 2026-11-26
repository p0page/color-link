<script lang="ts">
  import type { MatchBoard } from '../lib/types';
  import BoardInfo from './BoardInfo.svelte';
  import BoardPreview from './BoardPreview.svelte';
  import Modal from './Modal.svelte';

  let { board, onClose, onSelect }: { board: MatchBoard; onClose: () => void; onSelect?: () => void } = $props();
  const titleId = $props.id();
</script>

<Modal layout="preview" labelledBy={titleId} dismissOnBackdrop onDismiss={onClose}>
  <div class="dialog-header">
    <h2 id={titleId}><BoardInfo {board} /></h2>
    <button type="button" class="close" aria-label="关闭棋盘预览" onclick={onClose}>
      <span aria-hidden="true">×</span>
    </button>
  </div>
  <BoardPreview blueprint={board.blueprint} size="100%" detailed />
  {#if onSelect}
    <button type="button" class="btn btn-primary select-board" onclick={onSelect}>选用此地图</button>
  {/if}
</Modal>

<style>
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
