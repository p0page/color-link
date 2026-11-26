<script lang="ts">
  import { untrack } from 'svelte';
  import {
    boardHasRoom, boardOptionLabel, createBoardLibrary, CURRENT_BOARD_ID, planRoundBoards, randomBoardPool,
    type BoardMode, type BoardPlan,
  } from '../lib/round-boards';
  import { sanitizeBlueprint } from '../lib/storage';
  import type { BoardBlueprint, GameConfig, MatchBoard, SavedBoard } from '../lib/types';
  import BoardInfo from './BoardInfo.svelte';
  import BoardPreview from './BoardPreview.svelte';
  import BoardPreviewDialog from './BoardPreviewDialog.svelte';
  import BrandTitle from './BrandTitle.svelte';

  interface Props {
    initialConfig: GameConfig;
    initialBoardPlan: BoardPlan;
    activeBlueprint: BoardBlueprint;
    activeBoardId: string | null;
    activeBoardName: string;
    savedBoards: SavedBoard[];
    historyCount: number;
    onUpdateBlueprint: (blueprint: BoardBlueprint, boardName: string, boardId: string | null) => void;
    onOpenEditor: () => void;
    onOpenHistory: () => void;
    onStart: (config: GameConfig, plan: BoardPlan, schedule: MatchBoard[], pool: MatchBoard[]) => void;
  }

  let {
    initialConfig,
    initialBoardPlan,
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
  const planSeed = untrack(() => ({ ...initialBoardPlan, selections: [...initialBoardPlan.selections] }));
  const formats = [
    { wins: 1, label: '一局定胜负' },
    { wins: 2, label: '三局两胜' },
    { wins: 3, label: '五局三胜' },
  ];
  const modes: { id: BoardMode; label: string }[] = [
    { id: 'random', label: '每局随机' },
    { id: 'per-round', label: '逐局指定' },
    { id: 'same', label: '全程同一张' },
  ];
  let plan = $state<BoardPlan>(planSeed);
  let creativeRevision = $state(0);
  let previewBoard = $state.raw<MatchBoard | undefined>();

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
  const safeMinPath = $derived(Math.min(400, Math.max(2, Math.floor(minPathLength ?? 6))));
  const totalRounds = $derived(targetWins * 2 - 1);
  const builtIn = $derived.by(() => {
    void creativeRevision;
    return createBoardLibrary(safeMinPath);
  });
  const currentBoard: MatchBoard = $derived({
    id: CURRENT_BOARD_ID,
    name: activeBoardName,
    blueprint: activeBlueprint,
  });
  const choices: MatchBoard[] = $derived([currentBoard, ...builtIn, ...savedBoards]);
  const pool = $derived(randomBoardPool(builtIn, plan.includeCustom ? savedBoards : [], safeMinPath));
  const selectedBoards = $derived(Array.from({ length: plan.mode === 'same' ? 1 : totalRounds }, (_, index) => {
    if (plan.mode === 'random') return undefined;
    const id = plan.selections[index] || (plan.mode === 'same' ? CURRENT_BOARD_ID : '');
    return choices.find((board) => board.id === id) ?? (plan.mode === 'same' ? currentBoard : undefined);
  }));
  const invalidSelection = $derived(selectedBoards.some((board) => board && !boardHasRoom(board, safeMinPath)));

  function selectRoundBoard(index: number, id: string) {
    plan.selections[index] = id;
  }

  function applyBoardPreset(r: number, c: number) {
    const nextBp = sanitizeBlueprint({
      ...activeBlueprint,
      rows: r,
      cols: c,
    });
    const blank = nextBp.blockedCells.length === 0 && nextBp.presetPieces.length === 0;
    onUpdateBlueprint(nextBp, blank ? '空白棋盘' : activeBoardName, blank ? null : activeBoardId);
  }

  function changeBoardDimension(input: HTMLInputElement, dimension: 'rows' | 'cols') {
    const value = Math.min(20, Math.max(4, Math.floor(input.valueAsNumber || activeBlueprint[dimension])));
    input.value = String(value);
    applyBoardPreset(dimension === 'rows' ? value : rows, dimension === 'cols' ? value : cols);
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
    if (invalidSelection) return;
    const schedule = plan.mode === 'same'
      ? Array<MatchBoard>(totalRounds).fill(selectedBoards[0] ?? currentBoard)
      : planRoundBoards(totalRounds, selectedBoards, pool);
    const first = schedule[0].blueprint;
    const clampedMoveSec = moveUnlimited
      ? null
      : Math.min(3600, Math.max(5, Math.floor(moveSeconds) || 90));
    const clampedVerifySec = verifyUnlimited
      ? null
      : Math.min(7200, Math.max(10, Math.round((Number(verifyMinutes) || 5) * 60)));

    onStart({
      rows: first.rows,
      cols: first.cols,
      minPathLength: safeMinPath,
      targetWins,
      moveTimeLimitSec: clampedMoveSec,
      verifyTimeLimitSec: clampedVerifySec,
      playerNames: [player1Name.trim() || '玩家 1', player2Name.trim() || '玩家 2'],
    }, { ...plan, selections: [...plan.selections] }, schedule, pool);
  }
</script>

<div class="setup-page">
  <form class="setup-card" onsubmit={handleSubmit}>
    <header class="setup-header">
      <div class="header-top-row">
        <BrandTitle size="lg" />
        <button type="button" class="btn btn-ghost history-entry-btn" onclick={onOpenHistory}>
          <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2" />
          </svg>
          历史对决
          <span class="count-badge tabular">{historyCount}</span>
        </button>
      </div>
      <h1>创建对局</h1>
      <p class="subtitle">双人同屏对弈，设定棋盘与比赛规则。</p>
    </header>

    <div class="form-grid">
      <section class="field-group schedule" aria-labelledby="match-format">
        <div class="schedule-controls">
          <div>
            <h2 id="match-format">比赛赛制</h2>
            <div class="preset-row" role="group" aria-labelledby="match-format">
              {#each formats as format (format.wins)}
                <button type="button" class="chip" class:active={targetWins === format.wins}
                  aria-pressed={targetWins === format.wins} onclick={() => (targetWins = format.wins)}>
                  {format.label}
                </button>
              {/each}
            </div>
          </div>
          <div>
            <h2 id="board-mode">地图安排</h2>
            <div class="preset-row" role="group" aria-labelledby="board-mode">
              {#each modes as mode (mode.id)}
                <button type="button" class="chip" class:active={plan.mode === mode.id}
                  aria-pressed={plan.mode === mode.id} onclick={() => (plan.mode = mode.id)}>
                  {mode.label}
                </button>
              {/each}
            </div>
          </div>
        </div>
        {#if plan.mode === 'random'}
          <div class="schedule-note-row">
            <p class="schedule-note">开赛前安排最多 {totalRounds} 局地图。优先使用不同地图，选先手时可换图。</p>
            <button type="button" class="chip" onclick={() => (creativeRevision += 1)}>
              换一批创意图
            </button>
          </div>
          <details class="board-pool">
            <summary>查看随机地图池（{pool.length} 张）</summary>
            <div class="pool-grid">
              {#each pool as board (board.id)}
                <div class="pool-board">
                  <BoardPreview blueprint={board.blueprint} size={46} label={`预览 ${boardOptionLabel(board)}`}
                    onOpen={() => (previewBoard = board)} />
                  <BoardInfo {board} />
                </div>
              {/each}
            </div>
          </details>
        {:else}
          <div class="round-board-list">
            {#each selectedBoards as board, index (index)}
              <div class="board-choice">
                <div class="board-choice-heading">
                  <label class="round-label" for={`schedule-board-${index}`}>
                    {plan.mode === 'same' ? '全程使用' : `第 ${index + 1} 局`}
                  </label>
                  {#if board?.original}<span class="board-origin">原版</span>{/if}
                </div>
                <div class="board-choice-body">
                  {#if board}
                    <BoardPreview blueprint={board.blueprint} size={46} label={`预览 ${boardOptionLabel(board)}`}
                      onOpen={() => (previewBoard = board)} />
                  {/if}
                  <div class="board-picker">
                    <div class="board-picker-label" aria-hidden="true">
                      {#if board}<BoardInfo {board} showOrigin={false} />{:else}<strong>随机选图</strong>{/if}
                    </div>
                    <select id={`schedule-board-${index}`} value={board?.id ?? ''}
                      onchange={(event) => selectRoundBoard(index, event.currentTarget.value)}>
                      {#if plan.mode === 'per-round'}<option value="">随机选图</option>{/if}
                      {#each choices as option (option.id)}
                        <option value={option.id} disabled={!boardHasRoom(option, safeMinPath)}>
                          {option.id === CURRENT_BOARD_ID ? '当前棋盘 · ' : ''}{boardOptionLabel(option)}
                        </option>
                      {/each}
                    </select>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {/if}
        {#if invalidSelection}
          <p class="schedule-note caution" role="status">所选棋盘不支持当前最小连接格数，请换图或调小格数。</p>
        {/if}
        <details class="custom-settings">
          <summary>自定义棋盘</summary>
          <div class="custom-content">
            <div class="label-row">
              <span class="field-label">棋盘尺寸</span>
              <div class="preset-row">
                <button type="button" class="chip" class:active={rows === 8 && cols === 8} onclick={() => applyBoardPreset(8, 8)}>8×8</button>
                <button type="button" class="chip" class:active={rows === 10 && cols === 10} onclick={() => applyBoardPreset(10, 10)}>10×10</button>
                <button type="button" class="chip" class:active={rows === 12 && cols === 12} onclick={() => applyBoardPreset(12, 12)}>12×12</button>
              </div>
            </div>
            <div class="board-editor-bar">
              <BoardPreview blueprint={activeBlueprint} size={82} label={`预览 ${boardOptionLabel(currentBoard)}`}
                onOpen={() => (previewBoard = currentBoard)} />
              <div class="board-summary">
                <strong class="board-summary-title">{activeBoardName}</strong>
                <div class="board-summary-meta tabular">
                  <span>{rows}×{cols}</span>
                  <span>{playableCells} 个可用格</span>
                  {#if isCustomBoard}
                    <span>{blockedCount} 个黑块 · {presetCount} 枚预设棋子</span>
                  {/if}
                </div>
                <div class="board-summary-actions">
                  <button type="button" class="btn btn-ghost editor-btn" onclick={onOpenEditor}>编辑棋盘</button>
                  <button type="button" class="reset-link" onclick={() => {
                    plan.mode = 'same';
                    selectRoundBoard(0, CURRENT_BOARD_ID);
                  }}>全程使用此图</button>
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
                  inputmode="numeric"
                  onchange={(event) => changeBoardDimension(event.currentTarget, 'rows')}
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
                  inputmode="numeric"
                  onchange={(event) => changeBoardDimension(event.currentTarget, 'cols')}
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
            {#if plan.mode !== 'same' && savedBoards.some(({ blueprint }) => blueprint.presetPieces.length === 0 && blueprint.blockedCells.length === 0)}
              <label class="toggle">
                <input type="checkbox" bind:checked={plan.includeCustom} />
                随机时也使用符合格数的自建空白棋盘
              </label>
            {/if}
          </div>
        </details>
      </section>

      <section class="field-group match-settings">
        <h2>比赛规则</h2>
        <div class="match-settings-grid">
          <label class="sub-field">
            <span class="field-label">最小连接格数</span>
            <input type="number" min="2" max="400" bind:value={minPathLength} />
            <span class="meta-hint">每局都采用这个格数，包含起点和终点。</span>
          </label>
          <div class="player-settings" role="group" aria-labelledby="player-settings-title">
            <h3 id="player-settings-title">对阵玩家</h3>
            <div class="paired-fields">
              <label class="sub-field">
                <span class="player-label"><span class="player-dot orange"></span>橙方名称</span>
                <input class="player-input p0" type="text" maxlength="16" placeholder="玩家 1" bind:value={player1Name} />
              </label>
              <label class="sub-field">
                <span class="player-label"><span class="player-dot blue"></span>蓝方名称</span>
                <input class="player-input p1" type="text" maxlength="16" placeholder="玩家 2" bind:value={player2Name} />
              </label>
            </div>
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
      <button type="submit" class="btn btn-primary submit-btn" disabled={invalidSelection}>
        开始对局 <span aria-hidden="true">→</span>
      </button>
    </footer>
  </form>
</div>

{#if previewBoard}
  <BoardPreviewDialog board={previewBoard} onClose={() => (previewBoard = undefined)} />
{/if}

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

  .btn-icon {
    width: 15px;
    height: 15px;
    flex-shrink: 0;
    fill: none;
    stroke: currentColor;
    stroke-width: 1.9;
    stroke-linecap: round;
    stroke-linejoin: round;
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

  .schedule {
    grid-column: 1 / -1;
  }

  .schedule-controls {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(min(100%, 260px), 1fr));
    gap: 14px 24px;
  }

  .schedule-controls h2 {
    margin-bottom: 9px;
  }

  .round-board-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 171px), 1fr));
    gap: 10px;
  }

  .board-choice {
    display: grid;
    align-content: flex-start;
    gap: 6px;
    padding: 10px;
    min-width: 0;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
  }

  .board-choice-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    min-height: 18px;
  }

  .round-label {
    margin-inline-start: 2px;
    font-size: 0.75rem;
    color: var(--text-muted);
    font-weight: 600;
  }

  .board-choice-body,
  .pool-board {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .board-picker {
    position: relative;
    display: flex;
    align-items: center;
    flex: 1;
    min-width: 0;
    min-height: 44px;
    padding: 5px 16px 5px 5px;
    border-radius: 8px;
    font-size: 0.83rem;
  }

  .board-picker:hover {
    background: var(--bg-surface);
  }

  .board-picker:has(select:focus-visible) {
    outline: 2px solid var(--text-secondary);
    outline-offset: 2px;
  }

  .board-picker-label {
    min-width: 0;
  }

  .board-picker select {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    cursor: pointer;
    font-size: 16px;
  }

  .board-picker::after,
  .custom-settings summary::after {
    content: '';
    width: 6px;
    height: 6px;
    border: solid var(--text-secondary);
    border-width: 0 1px 1px 0;
    transform: rotate(45deg);
  }

  .board-picker::after {
    position: absolute;
    right: 6px;
    top: calc(50% - 5px);
    pointer-events: none;
  }

  .schedule-note {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.82rem;
  }

  .schedule-note-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 8px 12px;
  }

  .board-pool summary {
    cursor: pointer;
    color: var(--text-primary);
    font-size: 0.82rem;
    font-weight: 600;
  }

  .pool-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(min(100%, 158px), 1fr));
    gap: 8px;
    margin-top: 9px;
  }

  .pool-board {
    padding: 10px;
    border-radius: var(--radius-sm);
    background: var(--bg-elevated);
    font-size: 0.82rem;
  }

  .custom-settings {
    border-top: 1px solid var(--border-subtle);
  }

  .custom-settings summary {
    display: flex;
    align-items: center;
    gap: 10px;
    width: fit-content;
    min-height: 44px;
    padding-inline: 2px 10px;
    list-style: none;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 650;
    color: var(--text-secondary);
  }

  .custom-settings summary::-webkit-details-marker {
    display: none;
  }

  .custom-settings[open] summary::after {
    transform: translateY(3px) rotate(225deg);
  }

  .custom-content {
    display: grid;
    gap: 12px;
    max-width: 560px;
    padding-top: 4px;
  }

  .match-settings {
    grid-column: 1 / -1;
  }

  .match-settings-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1.4fr);
    gap: 18px;
    align-items: start;
  }

  .caution {
    color: #a04b12;
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
    border-color: var(--border-strong);
  }

  .player-input.p0:focus {
    border-color: color-mix(in srgb, var(--accent-p0) 60%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-p0) 14%, transparent);
    outline: none;
  }

  .player-input.p1:focus {
    border-color: color-mix(in srgb, var(--accent-p1) 60%, transparent);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--accent-p1) 14%, transparent);
    outline: none;
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
    transition: background-color 0.14s ease, color 0.14s ease;
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
    padding-inline-start: 18px;
    border-inline-start: 1px solid var(--border-subtle);
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
    border: 1px solid var(--border-subtle);
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
    .setup-page {
      padding-inline: max(14px, env(safe-area-inset-left)) max(14px, env(safe-area-inset-right));
      padding-bottom: max(24px, env(safe-area-inset-bottom));
    }

    .form-grid {
      grid-template-columns: 1fr;
    }

    input[type='number'],
    input[type='text'] {
      font-size: 16px;
      min-height: 44px;
    }

    .chip,
    .editor-btn,
    .reset-link {
      min-height: 36px;
    }

    .setup-footer {
      align-items: stretch;
      flex-direction: column;
      gap: 14px;
    }
  }

  @media (max-width: 540px) {
    .round-board-list,
    .pool-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .board-choice,
    .pool-board {
      padding: 8px;
    }

    .board-picker {
      padding-inline-start: 2px;
    }

    .match-settings-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .player-settings {
      padding: 14px 0 0;
      border-inline-start: 0;
      border-top: 1px solid var(--border-subtle);
    }
  }

  @media (max-width: 360px) {
    .round-board-list,
    .pool-grid {
      grid-template-columns: minmax(0, 1fr);
    }

    .inline-input {
      width: 88px;
    }
  }
</style>
