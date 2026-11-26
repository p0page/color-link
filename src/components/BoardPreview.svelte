<script lang="ts">
  import { getPieceColor } from '../lib/colors';
  import { cellKey, coordKey } from '../lib/engine';
  import type { BoardBlueprint, CellKey } from '../lib/types';

  interface Props {
    blueprint: BoardBlueprint;
    size?: number | string;
    detailed?: boolean;
    label?: string;
    onOpen?: () => void;
  }

  let { blueprint, size = 68, detailed = false, label, onOpen }: Props = $props();
  const frameSize = $derived(typeof size === 'number' ? `${size}px` : size);

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

{#snippet frame()}
  <div class="preview-frame" class:detailed style:width={frameSize} aria-hidden="true">
    <div
      class="preview-grid"
      style:--cell-font="{46 / Math.max(blueprint.rows, blueprint.cols)}cqw"
      style:width="{Math.min(1, blueprint.cols / blueprint.rows) * 100}%"
      style:height="{Math.min(1, blueprint.rows / blueprint.cols) * 100}cqw"
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
              {@const color = getPieceColor(presetColorId)}
              <span class="p-dot" style:background={color.hex} style:color={color.textColor}>
                {#if detailed}{color.letter}{/if}
              </span>
            {/if}
          </div>
        {/each}
      {/each}
    </div>
  </div>
{/snippet}

{#if onOpen}
  <button type="button" class="preview-trigger" aria-label={label} aria-haspopup="dialog" onclick={onOpen}>
    {@render frame()}
  </button>
{:else}
  {@render frame()}
{/if}

<style>
  .preview-trigger {
    flex-shrink: 0;
    align-self: flex-start;
    padding: 0;
    border-radius: 10px;
  }

  .preview-trigger:hover .preview-frame,
  .preview-trigger:focus-visible .preview-frame {
    border-color: var(--text-muted);
  }

  .preview-frame {
    container-type: inline-size;
    max-width: 100%;
    aspect-ratio: 1;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 4px;
    border-radius: 10px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    box-shadow: var(--shadow-sm);
  }

  .preview-frame.detailed {
    padding: 8px;
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    box-shadow: none;
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
    background: #181c24;
  }

  .p-dot {
    display: grid;
    place-items: center;
    width: 72%;
    height: 72%;
    border-radius: 50%;
    font-size: var(--cell-font);
    font-weight: 750;
    line-height: 1;
  }
</style>
