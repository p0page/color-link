<script lang="ts">
  import type { MatchBoard } from '../lib/types';

  let { board, showOrigin = true }: { board: MatchBoard; showOrigin?: boolean } = $props();
</script>

<span class="board-info">
  <span class="title">{board.name}</span>
  <span class="metadata tabular">
    <span>{board.blueprint.rows}×{board.blueprint.cols}</span>
    {#if showOrigin && board.original}<span class="board-origin">原版</span>{/if}
  </span>
</span>

<style>
  .board-info {
    display: grid;
    gap: 4px;
    min-width: 0;
  }

  .title {
    color: var(--text-primary);
    font-weight: 650;
    overflow-wrap: anywhere;
  }

  .metadata {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 3px 6px;
    color: var(--text-muted);
    font-size: 0.75rem;
    font-weight: 500;
  }
</style>
