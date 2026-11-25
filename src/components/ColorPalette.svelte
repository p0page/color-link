<script lang="ts">
  import { PIECE_COLORS } from '../lib/colors';

  interface Props {
    colorCounts: Map<number, number>;
    pendingColorIds: Set<number>;
    selectedColorId: number | null;
    turnFull: boolean;
    onSelectColor: (colorId: number) => void;
    onHoverColor: (colorId: number | null) => void;
  }

  let {
    colorCounts,
    pendingColorIds,
    selectedColorId,
    turnFull,
    onSelectColor,
    onHoverColor,
  }: Props = $props();
</script>

<div class="palette-wrap">
  <div class="palette-header">
    <span class="palette-title">棋子颜色（A–Z）</span>
    <span class="palette-legend">数字 = 剩余可放枚数</span>
    <span class="palette-scroll-hint">左右滑动选子</span>
  </div>

  <div class="palette-grid">
    {#each PIECE_COLORS as color (color.id)}
      {@const placed = colorCounts.get(color.id) ?? 0}
      {@const remaining = Math.max(0, 2 - placed)}
      {@const usedThisTurn = pendingColorIds.has(color.id)}
      {@const disabled = remaining === 0 || usedThisTurn || turnFull}
      {@const isSelected = selectedColorId === color.id && !disabled}
      <button
        type="button"
        class="color-chip"
        class:selected={isSelected}
        class:singleton={remaining === 1 && !usedThisTurn}
        class:used-turn={usedThisTurn}
        class:exhausted={remaining === 0}
        style="--piece-bg: {color.hex}; --piece-fg: {color.textColor};"
        aria-pressed={isSelected}
        {disabled}
        title="{color.letter}：棋盘已有 {placed}/2 枚{usedThisTurn ? '（本回合已使用）' : ''}"
        onclick={() => onSelectColor(color.id)}
        onpointerenter={(event) => {
          if (event.pointerType === 'mouse') onHoverColor(color.id);
        }}
        onpointerleave={() => onHoverColor(null)}
      >
        <span class="letter">{color.letter}</span>
        <span class="badge">{usedThisTurn ? '本轮' : remaining}</span>
      </button>
    {/each}
  </div>
</div>

<style>
  .palette-wrap {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .palette-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .palette-title {
    font-size: 0.95rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .palette-legend {
    font-size: 0.74rem;
    color: var(--text-muted);
  }

  .palette-scroll-hint {
    display: none;
  }

  .palette-grid {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 7px;
  }

  .color-chip {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 7px 3px 6px;
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    border: 1px solid transparent;
    transition:
      transform 0.1s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      background-color 0.15s ease;
  }

  .color-chip:hover:not(:disabled) {
    border-color: var(--piece-bg);
    background: var(--bg-surface);
  }

  .color-chip.selected {
    border-color: var(--piece-bg);
    background: color-mix(in srgb, var(--piece-bg) 10%, white);
  }

  .color-chip.singleton:not(.selected) {
    background: var(--player-p0-tint);
  }

  .color-chip.exhausted {
    opacity: 0.34;
    background: #f8fafc;
  }

  .color-chip.used-turn {
    opacity: 0.58;
    border-style: dashed;
    border-color: var(--piece-bg);
  }

  .letter {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: var(--piece-bg);
    color: var(--piece-fg);
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.9rem;
    box-shadow: 0 1px 2px rgb(17 19 24 / 10%);
  }

  .badge {
    font-size: 0.68rem;
    font-weight: 700;
    color: var(--text-secondary);
    line-height: 1;
  }

  .color-chip.singleton .badge {
    color: var(--player-p0-ink);
  }

  .color-chip.used-turn .badge {
    color: #2563eb;
  }

  @media (max-width: 680px) {
    .palette-legend {
      display: none;
    }

    .palette-scroll-hint {
      display: inline;
      font-size: 0.74rem;
      color: var(--text-muted);
    }

    .palette-grid {
      grid-template: repeat(2, auto) / none;
      grid-auto-flow: column;
      grid-auto-columns: 44px;
      gap: 5px;
      overflow-x: auto;
      padding: 3px 3px 7px;
    }

    .color-chip {
      min-height: 44px;
      gap: 2px;
      padding-block: 4px;
    }

    .letter {
      width: 24px;
      height: 24px;
    }
  }
</style>
