<script lang="ts">
  import { untrack } from 'svelte';
  import { sanitizeBlueprint } from '../lib/storage';
  import type { BoardBlueprint, GameConfig, SavedBoard } from '../lib/types';
  import BoardPreview from './BoardPreview.svelte';
  import BrandTitle from './BrandTitle.svelte';

  interface Props {
    initialConfig: GameConfig;
    activeBlueprint: BoardBlueprint;
    activeBoardId: string | null;
    activeBoardName: string;
    savedBoards: SavedBoard[];
    historyCount: number;
    onUpdateBlueprint: (blueprint: BoardBlueprint, boardName: string, boardId: string | null) => void;
    onOpenEditor: () => void;
    onOpenHistory: () => void;
    onStart: (config: GameConfig) => void;
  }

  let {
    initialConfig,
    activeBlueprint,
    activeBoardId,
    activeBoardName,
    savedBoards,
    historyCount,
    onUpdateBlueprint,
    onOpenEditor,
    onOpenHistory,
    onStart,
  }: Props = $props();

  const seed = untrack(() => initialConfig);

  let minPathLength = $state(seed.minPathLength);
  let targetWins = $state(seed.targetWins);
  let moveUnlimited = $state(seed.moveTimeLimitSec === null);
  let moveSeconds = $state(seed.moveTimeLimitSec ?? 90);
  let verifyUnlimited = $state(seed.verifyTimeLimitSec === null);
  let verifyMinutes = $state(
    seed.verifyTimeLimitSec ? Math.max(1, Math.round(seed.verifyTimeLimitSec / 60)) : 5,
  );
  let player1Name = $state(seed.playerNames[0]);
  let player2Name = $state(seed.playerNames[1]);

  const rows = $derived(activeBlueprint.rows);
  const cols = $derived(activeBlueprint.cols);
  const blockedCount = $derived(activeBlueprint.blockedCells.length);
  const presetCount = $derived(activeBlueprint.presetPieces.length);
  const isCustomBoard = $derived(blockedCount > 0 || presetCount > 0);
  const playableCells = $derived(Math.max(2, rows * cols - blockedCount));
  const maxPossiblePath = $derived(playableCells);
  const safeMinPath = $derived(Math.min(Math.max(2, minPathLength ?? 6), maxPossiblePath));

  function applyBoardPreset(r: number, c: number) {
    const nextBp = sanitizeBlueprint({
      ...activeBlueprint,
      rows: r,
      cols: c,
    });
    const blank = nextBp.blockedCells.length === 0 && nextBp.presetPieces.length === 0;
    onUpdateBlueprint(nextBp, blank ? '空白棋盘' : activeBoardName, blank ? null : activeBoardId);
  }

  function handleSelectSaved(board: SavedBoard) {
    onUpdateBlueprint(sanitizeBlueprint(board.blueprint), board.name, board.id);
  }

  function handleResetBlank() {
    onUpdateBlueprint(
      { rows, cols, blockedCells: [], presetPieces: [] },
      '空白棋盘',
      null,
    );
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    const clampedRows = Math.min(20, Math.max(4, Math.floor(rows) || 10));
    const clampedCols = Math.min(20, Math.max(4, Math.floor(cols) || 10));
    const clampedMinPath = Math.min(
      Math.max(2, clampedRows * clampedCols - blockedCount),
      Math.max(2, Math.floor(minPathLength) || 6),
    );
    const clampedTargetWins = Math.min(20, Math.max(1, Math.floor(targetWins) || 3));
    const clampedMoveSec = moveUnlimited
      ? null
      : Math.min(3600, Math.max(5, Math.floor(moveSeconds) || 90));
    const clampedVerifySec = verifyUnlimited
      ? null
      : Math.min(7200, Math.max(10, Math.round((Number(verifyMinutes) || 5) * 60)));

    onStart({
      rows: clampedRows,
      cols: clampedCols,
      minPathLength: clampedMinPath,
      targetWins: clampedTargetWins,
      moveTimeLimitSec: clampedMoveSec,
      verifyTimeLimitSec: clampedVerifySec,
      playerNames: [player1Name.trim() || '玩家 1', player2Name.trim() || '玩家 2'],
    });
  }
</script>

<div class="setup-page">
  <form class="setup-card" onsubmit={handleSubmit}>
    <header class="setup-header">
      <div class="header-top-row">
        <BrandTitle size="lg" />
        <button type="button" class="btn btn-ghost history-entry-btn" onclick={onOpenHistory}>
          历史对决
          <span class="count-badge tabular">{historyCount}</span>
        </button>
      </div>
      <h1>创建对局</h1>
      <p class="subtitle">双人同屏对弈，设定棋盘与比赛规则。</p>
    </header>

    <div class="form-grid">
      <section class="field-group">
        <div class="label-row">
          <h2>棋盘布局</h2>
          <div class="preset-row">
            <button type="button" class="chip" class:active={rows === 8 && cols === 8} onclick={() => applyBoardPreset(8, 8)}>8×8</button>
            <button type="button" class="chip" class:active={rows === 10 && cols === 10} onclick={() => applyBoardPreset(10, 10)}>10×10</button>
            <button type="button" class="chip" class:active={rows === 12 && cols === 12} onclick={() => applyBoardPreset(12, 12)}>12×12</button>
          </div>
        </div>
        <div class="board-editor-bar">
          <BoardPreview blueprint={activeBlueprint} size={128} />
          <div class="board-summary">
            <strong class="board-summary-title">{activeBoardName}</strong>
            <div class="board-summary-meta tabular">
              <strong class="board-size">{rows} × {cols}</strong>
              <span>{playableCells} 个可用格</span>
              {#if isCustomBoard}
                <span>{blockedCount} 个黑块 · {presetCount} 枚预设棋子</span>
              {/if}
            </div>
            <div class="board-summary-actions">
              <button type="button" class="btn btn-ghost editor-btn" onclick={onOpenEditor}>编辑棋盘</button>
              {#if isCustomBoard}
                <button type="button" class="reset-link" onclick={handleResetBlank}>恢复空白棋盘</button>
              {/if}
            </div>
          </div>
        </div>

        <div class="size-inputs">
          <label class="inline-input">
            <span>行</span>
            <input
              type="number"
              min="4"
              max="20"
              value={rows}
              onchange={(e) => applyBoardPreset(Number((e.currentTarget as HTMLInputElement).value), cols)}
            />
          </label>
          <span class="times">×</span>
          <label class="inline-input">
            <span>列</span>
            <input
              type="number"
              min="4"
              max="20"
              value={cols}
              onchange={(e) => applyBoardPreset(rows, Number((e.currentTarget as HTMLInputElement).value))}
            />
          </label>
          <span class="meta-hint">每边 4–20 格</span>
        </div>

        {#if savedBoards.length > 0}
          <div class="saved-picker">
            <span class="saved-picker-label">已存棋盘：</span>
            <button
              type="button"
              class="chip"
              class:active={!isCustomBoard && activeBoardId === null}
              onclick={handleResetBlank}
            >
              空白棋盘
            </button>
            {#each savedBoards as board (board.id)}
              <button
                type="button"
                class="chip"
                class:active={activeBoardId === board.id}
                onclick={() => handleSelectSaved(board)}
              >
                {board.name} ({board.blueprint.rows}×{board.blueprint.cols})
              </button>
            {/each}
          </div>
        {/if}
      </section>

      <section class="field-group">
        <h2>比赛规则</h2>
        <div class="paired-fields">
          <label class="sub-field">
            <span class="field-label">最小连接格数</span>
            <input type="number" min="2" max={maxPossiblePath} bind:value={minPathLength} />
            <span class="meta-hint">包含起点和终点</span>
          </label>
          <label class="sub-field">
            <span class="field-label">获胜所需局数</span>
            <input type="number" min="1" max="20" bind:value={targetWins} />
            <span class="meta-hint">先达到该分数者获胜</span>
          </label>
        </div>
        <div class="player-settings" role="group" aria-labelledby="player-settings-title">
          <h3 id="player-settings-title">对阵玩家</h3>
          <div class="paired-fields">
            <label class="sub-field">
              <span class="player-label"><span class="player-dot orange"></span>橙方名称</span>
              <input type="text" maxlength="16" placeholder="玩家 1" bind:value={player1Name} />
            </label>
            <label class="sub-field">
              <span class="player-label"><span class="player-dot blue"></span>蓝方名称</span>
              <input type="text" maxlength="16" placeholder="玩家 2" bind:value={player2Name} />
            </label>
          </div>
        </div>
      </section>

      <section class="field-group">
        <div class="label-row">
          <h2>每回合落子限时</h2>
          <label class="toggle">
            <input type="checkbox" bind:checked={moveUnlimited} />
            <span>不限制</span>
          </label>
        </div>
        <div class="input-with-unit">
          <input
            type="number"
            aria-label="每回合落子限时（秒）"
            min="5"
            max="3600"
            bind:value={moveSeconds}
            disabled={moveUnlimited}
          />
          <span class="unit">秒</span>
        </div>
        <div class="preset-row">
          <button type="button" class="chip" class:active={!moveUnlimited && moveSeconds === 60} onclick={() => { moveUnlimited = false; moveSeconds = 60; }}>60秒</button>
          <button type="button" class="chip" class:active={!moveUnlimited && moveSeconds === 90} onclick={() => { moveUnlimited = false; moveSeconds = 90; }}>90秒</button>
          <button type="button" class="chip" class:active={!moveUnlimited && moveSeconds === 180} onclick={() => { moveUnlimited = false; moveSeconds = 180; }}>3分钟</button>
        </div>
        <span class="meta-hint">单回合内落完所有棋子（首步 1 枚 / 之后 2 枚）的总计时</span>
      </section>

      <section class="field-group">
        <div class="label-row">
          <h2>连线验证限时</h2>
          <label class="toggle">
            <input type="checkbox" bind:checked={verifyUnlimited} />
            <span>无限制</span>
          </label>
        </div>
        <div class="input-with-unit">
          <input
            type="number"
            aria-label="连线验证限时（分钟）"
            min="1"
            max="120"
            step="1"
            bind:value={verifyMinutes}
            disabled={verifyUnlimited}
          />
          <span class="unit">分钟</span>
        </div>
        <div class="preset-row">
          <button type="button" class="chip" class:active={!verifyUnlimited && verifyMinutes === 3} onclick={() => { verifyUnlimited = false; verifyMinutes = 3; }}>3分钟</button>
          <button type="button" class="chip" class:active={!verifyUnlimited && verifyMinutes === 5} onclick={() => { verifyUnlimited = false; verifyMinutes = 5; }}>5分钟</button>
          <button type="button" class="chip" class:active={!verifyUnlimited && verifyMinutes === 10} onclick={() => { verifyUnlimited = false; verifyMinutes = 10; }}>10分钟</button>
        </div>
      </section>

    </div>

    <footer class="setup-footer">
      <div class="rules-summary">
        <strong>规则速览</strong>
        <p>先手放 1 枚，之后每回合放 2 枚不同色棋子。发起「认定不可能」后，上一手落子方需补齐配对，画出至少 {safeMinPath} 格且互不交叉、重叠的正交路径。全部连线合法即得分。</p>
      </div>
      <button type="submit" class="btn btn-primary submit-btn">
        开始对局 <span aria-hidden="true">→</span>
      </button>
    </footer>
  </form>
</div>

<style>
  .setup-page {
    min-height: 100vh;
    padding: clamp(20px, 4vw, 46px) clamp(14px, 4vw, 42px) 36px;
  }

  .setup-card {
    max-width: 1040px;
    margin-inline: auto;
  }

  .setup-header {
    margin-bottom: 26px;
  }

  .header-top-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
    margin-bottom: clamp(24px, 5vw, 44px);
  }

  .history-entry-btn {
    min-height: 40px;
    white-space: nowrap;
  }

  .count-badge {
    min-width: 22px;
    height: 22px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--bg-subtle);
    color: var(--text-secondary);
    font-size: 0.72rem;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .setup-header h1 {
    margin: 0;
    font-size: clamp(2rem, 4vw, 3rem);
    line-height: 1.12;
    font-weight: 680;
    letter-spacing: -0.045em;
  }

  .subtitle {
    margin: 9px 0 0;
    color: var(--text-secondary);
    font-size: 0.92rem;
  }

  .form-grid {
    display: grid;
    grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
    gap: 16px;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 15px;
    min-width: 0;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: clamp(16px, 2.5vw, 24px);
    box-shadow: var(--shadow-card);
  }

  .field-group h2 {
    margin: 0;
    font-size: 1rem;
    font-weight: 700;
  }

  .paired-fields {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 14px;
  }

  .sub-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .label-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .field-label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-primary);
  }

  input[type='number'],
  input[type='text'] {
    width: 100%;
    min-width: 0;
    min-height: 40px;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-subtle);
    background: var(--bg-elevated);
    color: var(--text-primary);
    font-size: 0.95rem;
  }

  input:focus {
    background: var(--bg-surface);
  }

  input:disabled {
    opacity: 0.4;
  }

  .size-inputs {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .inline-input {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 108px;
    color: var(--text-secondary);
    font-size: 0.85rem;
  }

  .times {
    color: var(--text-muted);
    font-weight: 700;
  }

  .input-with-unit {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .unit {
    color: var(--text-secondary);
    font-size: 0.85rem;
    white-space: nowrap;
  }

  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.8rem;
    color: var(--text-secondary);
    cursor: pointer;
  }

  .toggle input {
    accent-color: var(--ink-dark);
  }

  .preset-row {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .chip {
    padding: 6px 12px;
    border-radius: var(--radius-pill);
    font-size: 0.8rem;
    font-weight: 600;
    background: var(--bg-elevated);
    overflow-wrap: anywhere;
    color: var(--text-secondary);
  }

  .chip:hover {
    background: var(--bg-subtle);
    color: var(--text-primary);
  }

  .chip.active {
    background: var(--ink-dark);
    color: #ffffff;
  }

  .player-settings {
    display: grid;
    gap: 10px;
    padding-top: 14px;
    border-top: 1px solid var(--border-subtle);
  }

  .player-settings h3 {
    margin: 0;
    font-size: 0.85rem;
    font-weight: 650;
  }

  .player-label {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--text-secondary);
  }

  .player-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .player-dot.orange {
    background: var(--accent-p0);
  }

  .player-dot.blue {
    background: var(--accent-p1);
  }

  .meta-hint {
    font-size: 0.76rem;
    color: var(--text-muted);
  }

  .setup-footer {
    margin-top: 16px;
    padding: 18px clamp(16px, 2.5vw, 24px);
    border-radius: var(--radius-lg);
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    box-shadow: var(--shadow-card);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }

  .rules-summary {
    max-width: 68ch;
    font-size: 0.84rem;
    line-height: 1.6;
  }

  .rules-summary p {
    margin: 4px 0 0;
    color: var(--text-secondary);
  }

  .submit-btn {
    flex-shrink: 0;
    min-height: 44px;
    padding-inline: 24px;
  }

  .board-editor-bar {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 16px;
    padding: 14px;
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
  }

  .board-summary {
    flex: 1 1 120px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .board-summary-title {
    font-size: 0.85rem;
    overflow-wrap: anywhere;
  }

  .board-summary-meta {
    display: flex;
    flex-direction: column;
    gap: 3px;
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  .board-size {
    font-size: 1.75rem;
    line-height: 1.1;
    letter-spacing: -0.04em;
    color: var(--text-primary);
  }

  .board-summary-actions {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
    margin-top: 2px;
  }

  .editor-btn {
    padding: 5px 11px;
    font-size: 0.78rem;
  }

  .reset-link {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--text-muted);
    text-decoration: underline;
  }

  .reset-link:hover {
    color: var(--text-primary);
  }

  .saved-picker {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
    padding-top: 2px;
  }

  .saved-picker-label {
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--text-secondary);
  }

  @media (max-width: 720px) {
    .form-grid {
      grid-template-columns: 1fr;
    }

    .setup-footer {
      align-items: stretch;
      flex-direction: column;
      gap: 14px;
    }
  }

  @media (max-width: 360px) {
    .inline-input {
      width: 88px;
    }
  }
</style>
