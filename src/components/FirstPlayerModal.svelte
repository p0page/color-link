<script lang="ts">
  import { boardOptionLabel } from '../lib/round-boards';
  import type { MatchBoard, PlayerId } from '../lib/types';
  import BoardInfo from './BoardInfo.svelte';
  import BoardPreview from './BoardPreview.svelte';
  import BoardPreviewDialog from './BoardPreviewDialog.svelte';
  import Modal from './Modal.svelte';

  interface Props {
    roundNumber: number;
    playerNames: [string, string];
    scores: [number, number];
    targetWins: number;
    currentRoundBoard: MatchBoard | undefined;
    onSelect: (player: PlayerId) => void;
    onBackToSetup: () => void;
  }

  let {
    roundNumber, playerNames, scores, targetWins, currentRoundBoard,
    onSelect, onBackToSetup,
  }: Props = $props();
  let previewBoard = $state.raw<MatchBoard | undefined>();
  const titleId = $props.id();
</script>

<Modal labelledBy={titleId}>
  <div class="modal-card">
    <div class="round-tag">第 {roundNumber} 局 · 先得 {targetWins} 分获胜</div>
    <h2 id={titleId}>请选择本局先手玩家</h2>
    <p class="desc">先手首回合放置 <strong>1 枚</strong> 棋子，之后双方轮流每回合放置 <strong>2 枚不同颜色</strong> 的棋子。</p>

    <div class="match-context">
      <div class="score-strip tabular" aria-label="当前比分">
        <span class="context-label">当前比分</span>
        <div class="score-row">
          <div class="score-side p0">
            <span class="score-dot" aria-hidden="true"></span>
            <span class="score-name">{playerNames[0]}</span>
            <span class="score-value">{scores[0]}</span>
          </div>
          <span class="score-sep" aria-hidden="true">:</span>
          <div class="score-side p1">
            <span class="score-value">{scores[1]}</span>
            <span class="score-name">{playerNames[1]}</span>
            <span class="score-dot" aria-hidden="true"></span>
          </div>
        </div>
      </div>

      {#if currentRoundBoard}
        {@const board = currentRoundBoard}
        <div class="round-board">
          <BoardPreview
            blueprint={board.blueprint}
            size={44}
            label={`预览 ${boardOptionLabel(board)}`}
            onOpen={() => (previewBoard = board)}
          />
          <div class="round-board-name">
            <span class="board-caption">本局棋盘</span>
            <BoardInfo {board} />
          </div>
          <button type="button" class="board-preview-link" onclick={() => (previewBoard = board)}>
            <span>查看大图</span>
            <svg class="preview-link-icon" viewBox="0 0 16 16" aria-hidden="true">
              <path d="M5.25 10.75 10.75 5.25m0 0H6.25m4.5 0v4.5" />
            </svg>
          </button>
        </div>
      {/if}
    </div>

    <div class="choice-grid">
      {#each [0, 1] as const as player (player)}
        <button type="button" class="choice-btn" class:p1-choice={player === 1} onclick={() => onSelect(player)}>
          <span class="choice-top">
            <span class="choice-token" aria-hidden="true">
              <span class="choice-dot"></span>
            </span>
            <span class="choice-arrow-badge" aria-hidden="true">
              <svg class="choice-arrow" viewBox="0 0 16 16">
                <path d="M3.5 8h9m0 0-3.25-3.25M12.5 8l-3.25 3.25" />
              </svg>
            </span>
          </span>
          <span class="choice-body">
            <span class="choice-name">
              {playerNames[player]}{#if playerNames[0] === playerNames[1]}（{player + 1} 号）{/if}
            </span>
            <span class="choice-action">选为先手</span>
          </span>
        </button>
      {/each}
    </div>

    {#if roundNumber === 1}
      <div class="footer-actions">
        <button type="button" class="back-btn" onclick={onBackToSetup}>返回开赛设置</button>
      </div>
    {/if}
  </div>
</Modal>

{#if previewBoard}
  <BoardPreviewDialog board={previewBoard} onClose={() => (previewBoard = undefined)} />
{/if}

<style>
  .modal-card {
    width: 100%;
    max-width: 520px;
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: clamp(16px, 5vw, 30px);
    text-align: center;
    box-shadow: var(--shadow-lg);
  }

  .round-tag {
    display: inline-block;
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-secondary);
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    padding: 5px 12px;
    border-radius: var(--radius-pill);
    margin-bottom: 12px;
  }

  h2 {
    margin: 0;
    font-size: 1.48rem;
    font-weight: 680;
    letter-spacing: -0.03em;
    color: var(--text-primary);
  }

  .desc {
    margin: 8px 0 16px;
    color: var(--text-secondary);
    font-size: 0.84rem;
    line-height: 1.55;
  }

  .desc strong {
    color: var(--text-primary);
    font-weight: 600;
  }

  .match-context {
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    margin-bottom: 18px;
    overflow: hidden;
  }

  .score-strip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 13px 16px;
  }

  .context-label {
    font-size: 0.71rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--text-muted);
  }

  .score-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    width: 100%;
  }

  .score-side {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .score-side.p0 {
    justify-content: flex-end;
    text-align: end;
  }

  .score-side.p1 {
    justify-content: flex-start;
    text-align: start;
  }

  .score-dot {
    flex-shrink: 0;
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .score-side.p0 .score-dot {
    background: var(--accent-p0);
  }

  .score-side.p1 .score-dot {
    background: var(--accent-p1);
  }

  .score-name {
    font-size: 0.84rem;
    font-weight: 600;
    color: var(--text-secondary);
    overflow-wrap: anywhere;
  }

  .score-value {
    flex-shrink: 0;
    font-size: 1.2rem;
    font-weight: 750;
    letter-spacing: -0.02em;
    color: var(--text-primary);
    line-height: 1;
  }

  .score-sep {
    font-size: 0.95rem;
    font-weight: 700;
    color: #cbd5e1;
  }

  .round-board {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 10px;
    padding: 12px 14px;
    text-align: start;
    border-top: 1px solid var(--border-subtle);
  }

  .round-board-name {
    flex: 1;
    min-width: 80px;
    display: grid;
    gap: 2px;
    overflow-wrap: anywhere;
    font-size: 0.84rem;
  }

  .board-caption {
    font-size: 0.7rem;
    color: var(--text-muted);
    font-weight: 600;
  }

  .board-preview-link {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    min-height: 32px;
    padding: 5px 11px;
    border-radius: var(--radius-pill);
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    box-shadow: var(--shadow-sm);
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--text-primary);
    transition:
      border-color 0.14s ease,
      background-color 0.14s ease,
      box-shadow 0.14s ease;
  }

  .preview-link-icon {
    width: 12px;
    height: 12px;
    flex-shrink: 0;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
    color: var(--text-secondary);
  }

  @media (hover: hover) {
    .board-preview-link:hover {
      border-color: var(--border-strong);
      background: #ffffff;
      box-shadow: 0 2px 6px rgba(15, 23, 42, 0.06);
    }
  }

  .choice-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .choice-btn {
    --choice-accent: var(--accent-p0);
    --choice-tint: var(--player-p0-tint);
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: space-between;
    gap: 16px;
    min-width: 0;
    min-height: 112px;
    padding: 15px 16px 16px;
    border-radius: var(--radius-md);
    background: var(--bg-surface);
    border: 1px solid var(--border-strong);
    box-shadow:
      0 1px 2px rgba(15, 23, 42, 0.04),
      0 6px 16px -6px rgba(15, 23, 42, 0.08);
    color: var(--text-primary);
    text-align: left;
    transition:
      transform 0.14s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease;
  }

  .p1-choice {
    --choice-accent: var(--accent-p1);
    --choice-tint: var(--player-p1-tint);
  }

  .choice-btn:focus-visible {
    outline: 2px solid var(--ink-dark);
    outline-offset: 3px;
  }

  @media (hover: hover) {
    .choice-btn:hover {
      transform: translateY(-2px);
      border-color: color-mix(in srgb, var(--choice-accent) 52%, rgba(15, 23, 42, 0.08));
      box-shadow:
        0 10px 24px -8px rgba(15, 23, 42, 0.12),
        0 0 0 3px color-mix(in srgb, var(--choice-accent) 10%, transparent);
    }

    .choice-btn:hover .choice-action {
      color: var(--text-primary);
    }
  }

  .choice-btn:active {
    transform: translateY(0) scale(0.99);
    box-shadow:
      0 2px 6px rgba(15, 23, 42, 0.08);
  }

  .choice-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
  }

  .choice-token {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: var(--choice-tint);
    border: 1px solid color-mix(in srgb, var(--choice-accent) 18%, transparent);
  }

  .choice-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: var(--choice-accent);
  }

  .choice-arrow-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--bg-base);
    border: 1px solid var(--border-subtle);
    color: var(--text-primary);
  }

  .choice-arrow {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    fill: none;
    stroke: currentColor;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .choice-body {
    display: flex;
    flex-direction: column;
    gap: 3px;
    min-width: 0;
  }

  .choice-name {
    font-size: 1.05rem;
    font-weight: 700;
    letter-spacing: -0.02em;
    line-height: 1.25;
    overflow-wrap: anywhere;
    max-width: 100%;
  }

  .choice-action {
    font-size: 0.78rem;
    font-weight: 500;
    color: var(--text-secondary);
    line-height: 1.3;
    transition: color 0.15s ease;
  }

  .footer-actions {
    margin-top: 16px;
  }

  .back-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-height: 38px;
    padding: 7px 16px;
    border-radius: var(--radius-pill);
    background: var(--bg-subtle);
    border: 1px solid var(--border-subtle);
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--text-primary);
    transition: background-color 0.14s ease, border-color 0.14s ease;
  }

  @media (hover: hover) {
    .back-btn:hover {
      background: #e5e8ee;
      border-color: var(--border-strong);
    }
  }

  @media (max-width: 360px) {
    .choice-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
