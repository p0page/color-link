<script lang="ts">
  import { getPieceColor } from '../lib/colors';
  import { cellKey, coordKey } from '../lib/engine';
  import type { BoardBlueprint, CellKey } from '../lib/types';

  interface Props {
    blueprint: BoardBlueprint;
    size?: number;
  }

  let { blueprint, size = 68 }: Props = $props();

  const blockedSet = $derived(new Set(blueprint.blockedCells.map((c) => coordKey(c))));
  const presetMap = $derived.by(() => {
    const map = new Map<CellKey, number>();
    for (const item of blueprint.presetPieces) {
      map.set(coordKey(item.coord), item.colorId);
    }
    return map;
  });
  const rowIndices = $derived(Array.from({ length: blueprint.rows }, (_, i) => i));
  const colIndices = $derived(Array.from({ length: blueprint.cols }, (_, i) => i));
</script>

<div
  class="preview-frame"
  style="width: {size}px; height: {size}px;"
  aria-hidden="true"
>
  <div
    class="preview-grid"
    style:width="{Math.min(1, blueprint.cols / blueprint.rows) * 100}%"
    style:height="{Math.min(1, blueprint.rows / blueprint.cols) * 100}%"
    style:grid-template-columns="repeat({blueprint.cols}, minmax(0, 1fr))"
    style:grid-template-rows="repeat({blueprint.rows}, minmax(0, 1fr))"
  >
    {#each rowIndices as row (row)}
      {#each colIndices as col (col)}
        {@const key = cellKey(row, col)}
        {@const isBlocked = blockedSet.has(key)}
        {@const presetColorId = presetMap.get(key)}
        <div class="p-cell" class:blocked={isBlocked}>
          {#if presetColorId !== undefined}
            <span class="p-dot" style="background: {getPieceColor(presetColorId).hex};"></span>
          {/if}
        </div>
      {/each}
    {/each}
  </div>
</div>

<style>
  .preview-frame {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border-radius: 10px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
  }

  .preview-grid {
    display: grid;
    background: #ffffff;
    border: 1px solid var(--border-strong);
    border-radius: 4px;
    overflow: hidden;
  }

  .p-cell {
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: inset -1px -1px 0 var(--border-subtle);
  }

  .p-cell.blocked {
    background: #111827;
  }

  .p-dot {
    width: 72%;
    height: 72%;
    border-radius: 50%;
  }
</style>
