<script lang="ts">
  import type { Snippet } from 'svelte';

  let { rows, cols, children }: { rows: number; cols: number; children: Snippet } = $props();
  let zoomed = $state(false);
</script>

<div
  class="board-viewport"
  class:zoomed
  style:--fit-width="calc({60 * cols / rows}svh + 24px)"
  style:--zoom-width="{40 * cols + 26}px"
>
  <div class="zoom-tools">
    <button
      type="button"
      class="btn btn-ghost zoom-button"
      aria-pressed={zoomed}
      onclick={() => (zoomed = !zoomed)}
    >
      {zoomed ? '适应屏幕' : '放大棋盘'}
    </button>
    {#if zoomed}
      <span>滑动查看棋盘，轻点操作</span>
    {/if}
  </div>
  <div class="board-scroll">
    <div class="board-content">
      {@render children()}
    </div>
  </div>
</div>

<style>
  .board-viewport {
    min-width: 0;
  }

  .zoom-tools {
    display: none;
  }

  @media (max-width: 680px), (hover: none) and (pointer: coarse) and (max-width: 960px) {
    .zoom-tools {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 4px;
      font-size: 0.75rem;
      color: var(--text-secondary);
    }

    .zoom-button {
      min-height: 36px;
      flex-shrink: 0;
      padding: 5px 12px;
      font-size: 0.78rem;
    }

    .board-content {
      width: min(100%, var(--fit-width));
      margin-inline: auto;
    }

    .zoomed .board-scroll {
      overflow: auto;
      max-block-size: 55dvh;
      border: 1px solid var(--border-subtle);
      border-radius: var(--radius-sm);
    }

    .zoomed .board-content {
      width: max(min(100%, var(--fit-width)), var(--zoom-width));
    }
  }
</style>
