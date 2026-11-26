<script lang="ts">
  import { boardHasRoom, boardOptionLabel } from '../lib/round-boards';
  import type { MatchBoard } from '../lib/types';
  import BoardInfo from './BoardInfo.svelte';
  import BoardPreview from './BoardPreview.svelte';

  interface Props {
    boards: MatchBoard[];
    minimum?: number;
    selectedId?: string;
    onPreview: (board: MatchBoard) => void;
    onSelect?: (board: MatchBoard) => void;
  }

  let { boards, minimum = 2, selectedId, onPreview, onSelect }: Props = $props();
</script>

<ul class="gallery">
  {#each boards as board (board.id)}
    {@const available = boardHasRoom(board, minimum)}
    <li class="map-tile" class:selected={selectedId === board.id}>
      <BoardPreview blueprint={board.blueprint} size={44} label={`预览 ${boardOptionLabel(board)}`}
        onOpen={() => onPreview(board)} />
      {#if onSelect}
        <button type="button" class="map-select" aria-label={`选用 ${boardOptionLabel(board)}`}
          aria-pressed={selectedId === board.id} disabled={!available} onclick={() => onSelect?.(board)}>
          <BoardInfo {board} />
          {#if !available}<span class="unavailable">格数不足</span>{/if}
        </button>
      {:else}
        <BoardInfo {board} />
      {/if}
    </li>
  {/each}
</ul>

<style>
  .gallery {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 166px), 1fr));
    gap: 8px;
    padding: 0;
    margin: 0;
    list-style: none;
  }

  .map-tile {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 8px;
    padding: 8px;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    font-size: 0.82rem;
    text-align: start;
  }

  .map-tile.selected {
    background: #edf4fe;
    border-color: #a7c2ea;
  }

  .map-select {
    flex: 1;
    min-width: 0;
    min-height: 44px;
    padding: 4px;
    border-radius: 6px;
    text-align: start;
    -webkit-tap-highlight-color: transparent;
  }

  @media (hover: hover) {
    .map-select:hover:not(:disabled) {
      background: var(--bg-surface);
    }
  }

  .map-select:disabled {
    opacity: 1;
  }

  .unavailable {
    color: var(--text-muted);
    font-size: 0.7rem;
  }

  @media (360px <= width <= 640px) {
    .gallery {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
