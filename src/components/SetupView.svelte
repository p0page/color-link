<script lang="ts">
  import { tick, untrack } from 'svelte';
  import { createBlueprint } from '../lib/engine';
  import { boardHasRoom, boardOptionLabel, createBoardLibrary, drawRoundBoards, SHOW_BOARD_IDS } from '../lib/round-boards';
  import type { GameConfig, MatchBoard, SavedBoard } from '../lib/types';
  import BoardEditorModal from './BoardEditorModal.svelte';
  import BoardGallery from './BoardGallery.svelte';
  import BoardInfo from './BoardInfo.svelte';
  import BoardPicker from './BoardPicker.svelte';
  import BoardPreview from './BoardPreview.svelte';
  import BoardPreviewDialog from './BoardPreviewDialog.svelte';
  import BrandTitle from './BrandTitle.svelte';

  interface Props {
    initialConfig: GameConfig;
    initialSelections: string[];
    savedBoards: SavedBoard[];
    historyCount: number;
    onSaveBoard: (board: SavedBoard) => void;
    onDeleteBoard: (id: string) => void;
    onOpenHistory: () => void;
    onStart: (config: GameConfig, schedule: MatchBoard[], selections: string[]) => void;
  }

  let { initialConfig, initialSelections, savedBoards, historyCount, onSaveBoard, onDeleteBoard, onOpenHistory, onStart }: Props = $props();

  const seed = untrack(() => initialConfig);
  const formats = [
    { wins: 1, label: '一局定胜负' },
    { wins: 2, label: '三局两胜' },
    { wins: 3, label: '五局三胜' },
  ];
  let selections = $state.raw<string[]>(untrack(() => [...initialSelections]));
  let preview = $state.raw<{ board: MatchBoard; slot?: number }>();
  let openSlot = $state<number | null>(null);
  let editorSlot = $state<number | null>(null);
  let editorSeed = $state.raw<MatchBoard>();
  let pickerTrigger: HTMLButtonElement | undefined;

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

  const safeMinPath = $derived(Math.min(400, Math.max(2, Math.floor(minPathLength ?? 6))));
  const totalRounds = $derived(targetWins * 2 - 1);
  const builtIn = createBoardLibrary();
  const groups = [
    { title: '节目原版地图', boards: builtIn.filter((board) => board.original) },
    { title: '创意地图', boards: builtIn.filter((board) => !board.original && !board.id.startsWith('built-in:')) },
    { title: '空白地图', boards: builtIn.filter((board) => board.id.startsWith('built-in:')) },
  ];
  const pool = $derived([...builtIn, ...savedBoards].filter((board) => boardHasRoom(board, safeMinPath)));
  const selectedBoards = $derived(Array.from({ length: totalRounds }, (_, index): MatchBoard | undefined => {
    const selection = selections[index] ?? SHOW_BOARD_IDS[index];
    return savedBoards.find((board) => board.id === selection) ?? builtIn.find((board) => board.id === selection);
  }));
  const invalidRounds = $derived(selectedBoards.flatMap((board, index) =>
    board && boardHasRoom(board, safeMinPath) ? [] : [index + 1]));
  const blankSize = $derived(Math.max(10, Math.ceil(Math.sqrt(safeMinPath))));
  const editorBlueprint = $derived(editorSeed?.blueprint ?? createBlueprint(blankSize, blankSize));

  function setSelection(index: number, selection: string) {
    const next = [...selections];
    next[index] = selection;
    selections = next;
  }

  function togglePicker(index: number, trigger: HTMLButtonElement) {
    pickerTrigger = trigger;
    openSlot = openSlot === index ? null : index;
  }

  async function closePicker() {
    openSlot = null;
    await tick();
    pickerTrigger?.focus({ preventScroll: true });
  }

  function chooseBoard(index: number, board: MatchBoard) {
    setSelection(index, board.id);
    preview = undefined;
    void closePicker();
  }

  function drawBoardForRound(index: number) {
    const current = selectedBoards[index];
    const [board] = drawRoundBoards(pool, [current]);
    if (board && board.id !== current?.id) chooseBoard(index, board);
  }

  function refreshSchedule() {
    const drawn = drawRoundBoards(pool, selectedBoards);
    if (drawn.length === 0) return;
    selections = [...drawn.map(({ id }) => id), ...selections.slice(totalRounds)];
    openSlot = null;
  }

  function openEditor(index: number, board?: MatchBoard) {
    editorSeed = board;
    editorSlot = index;
    openSlot = null;
  }

  async function closeEditor(reopenPicker: boolean) {
    const slot = editorSlot;
    editorSlot = null;
    editorSeed = undefined;
    await tick();
    if (reopenPicker) openSlot = slot;
    else pickerTrigger?.focus({ preventScroll: true });
  }

  function saveAndUseBoard(index: number, board: SavedBoard) {
    onSaveBoard(board);
    setSelection(index, board.id);
    void closeEditor(false);
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (invalidRounds.length > 0 || editorSlot !== null || preview) return;
    const schedule = selectedBoards.filter((board): board is MatchBoard => board !== undefined)
      .map((board) => ({ ...board, blueprint: createBlueprint(
        board.blueprint.rows, board.blueprint.cols, board.blueprint.blockedCells, board.blueprint.presetPieces,
      ) }));
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
    }, schedule, [...selections]);
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
                  aria-pressed={targetWins === format.wins} onclick={() => {
                    openSlot = null;
                    targetWins = format.wins;
                  }}>
                  {format.label}
                </button>
              {/each}
            </div>
          </div>
        </div>
        <div class="map-heading">
          <div>
            <h2>逐局选图</h2>
            <p class="schedule-note">开赛后按此顺序使用地图。</p>
          </div>
          <button type="button" class="chip shuffle-button" disabled={pool.length === 0}
            onclick={refreshSchedule}>随机换一组</button>
        </div>
        <div class="round-board-list">
          {#each selectedBoards as board, index (index)}
            {@const unavailable = !board || !boardHasRoom(board, safeMinPath)}
            <div class="board-choice" class:choosing={openSlot === index} class:unavailable>
              <div class="board-choice-heading">
                <span class="round-label">第 {index + 1} 局</span>
                {#if board?.original}<span class="board-origin">原版</span>{/if}
              </div>
              <div class="board-choice-body">
                {#if board}
                  <BoardPreview blueprint={board.blueprint} size={46} label={`预览 ${boardOptionLabel(board)}`}
                    onOpen={() => (preview = { board })} />
                {/if}
                <button type="button" class="board-picker" class:expanded={openSlot === index}
                  aria-label={`更换第 ${index + 1} 局地图${board ? `，${boardOptionLabel(board)}` : ''}`}
                  aria-expanded={openSlot === index} aria-controls={openSlot === index ? 'schedule-board-gallery' : undefined}
                  onclick={(event) => togglePicker(index, event.currentTarget)}>
                  {#if board}<BoardInfo {board} showOrigin={false} />{:else}<strong>选择地图</strong>{/if}
                </button>
              </div>
              {#if unavailable}
                <span class="schedule-note caution">{board ? '不符合连线格数' : '地图已移除，请重新选择'}</span>
              {/if}
            </div>
          {/each}
        </div>
        {#if openSlot !== null}
          {@const index = openSlot}
          {@const selected = selectedBoards[index]}
          <BoardPicker id="schedule-board-gallery" title={`选择第 ${index + 1} 局地图`} onClose={closePicker}>
            <div class="picker-actions">
              <button type="button" class="btn picker-create" onclick={() => openEditor(index)}>
                <svg class="btn-icon" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                新建自定义地图
              </button>
              <button type="button" class="picker-draw" disabled={!pool.some(({ id }) => id !== selected?.id)}
                onclick={() => drawBoardForRound(index)}>随机选一张</button>
              {#if savedBoards.some(({ id }) => id === selected?.id)}
                <button type="button" class="chip" onclick={() => openEditor(index, selected)}>编辑本局地图</button>
              {/if}
            </div>
            {#if savedBoards.length > 0}
              <h4>自定义地图</h4>
              <BoardGallery boards={savedBoards} minimum={safeMinPath} selectedId={selected?.id}
                onPreview={(board) => (preview = { board, slot: index })}
                onSelect={(board) => chooseBoard(index, board)} />
            {/if}
            {#each groups as group (group.title)}
              <h4>{group.title}</h4>
              <BoardGallery boards={group.boards} minimum={safeMinPath} selectedId={selected?.id}
                onPreview={(board) => (preview = { board, slot: index })}
                onSelect={(board) => chooseBoard(index, board)} />
            {/each}
          </BoardPicker>
        {/if}
        {#if invalidRounds.length > 0}
          <p class="schedule-note caution" role="status">请检查第 {invalidRounds.join('、')} 局的地图和最小连线格数。</p>
        {/if}
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
      <button type="submit" class="btn btn-primary submit-btn" disabled={invalidRounds.length > 0}>
        开始对局 <span aria-hidden="true">→</span>
      </button>
    </footer>
  </form>
</div>

{#if preview}
  {@const { board, slot } = preview}
  <BoardPreviewDialog {board} onClose={() => (preview = undefined)}
    onSelect={slot !== undefined && boardHasRoom(board, safeMinPath) ? () => chooseBoard(slot, board) : undefined} />
{/if}

{#if editorSlot !== null}
  {@const slot = editorSlot}
  <BoardEditorModal initialBlueprint={editorBlueprint} initialBoard={editorSeed} roundNumber={slot + 1}
    minimum={safeMinPath} {savedBoards} {onSaveBoard} {onDeleteBoard}
    onApply={(board) => saveAndUseBoard(slot, board)} onClose={() => closeEditor(true)} />
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

  .board-choice.choosing {
    border-color: var(--player-p1-ink);
    background: var(--player-p1-tint);
  }

  .board-choice.unavailable {
    border-color: #e9a76f;
  }

  .map-heading {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px 12px;
  }

  .map-heading .schedule-note {
    margin-top: 4px;
  }

  .shuffle-button {
    min-height: 44px;
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

  .board-choice-body {
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
    text-align: start;
  }

  .board-picker:hover,
  .board-picker.expanded {
    background: var(--bg-surface);
  }

  .board-picker::after {
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

  .board-picker.expanded::after {
    transform: translateY(3px) rotate(225deg);
  }

  .schedule-note {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.82rem;
  }

  .picker-actions {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
  }

  .picker-actions button {
    min-height: 44px;
  }

  .picker-create {
    padding: 8px 12px;
    border: 1px solid var(--border-strong);
    background: var(--bg-elevated);
    font-size: 0.82rem;
  }

  .picker-create:hover {
    background: var(--bg-subtle);
  }

  .picker-draw {
    padding: 8px 10px;
    border-radius: 8px;
    color: var(--player-p1-ink);
    font-size: 0.82rem;
    font-weight: 650;
  }

  .picker-draw:hover:not(:disabled) {
    background: var(--player-p1-tint);
  }

  h4 {
    margin: 10px 0 6px;
    color: var(--text-secondary);
    font-size: 0.8rem;
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

    .chip {
      min-height: 44px;
    }

    .setup-footer {
      align-items: stretch;
      flex-direction: column;
      gap: 14px;
    }
  }

  @media (max-width: 540px) {
    .round-board-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .board-choice {
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
    .round-board-list {
      grid-template-columns: minmax(0, 1fr);
    }

  }
</style>
