<script lang="ts">
  import BoardCanvas from './components/BoardCanvas.svelte';
  import BoardEditorModal from './components/BoardEditorModal.svelte';
  import BrandTitle from './components/BrandTitle.svelte';
  import ColorPalette from './components/ColorPalette.svelte';
  import FirstPlayerModal from './components/FirstPlayerModal.svelte';
  import MatchHistoryModal from './components/MatchHistoryModal.svelte';
  import RoundResultModal from './components/RoundResultModal.svelte';
  import SetupView from './components/SetupView.svelte';
  import VerifyPanel from './components/VerifyPanel.svelte';
  import { getPieceColor } from './lib/colors';
  import {
    canCompleteCurrentTurn,
    canConfirmTurn,
    canDeclareImpossibility,
    canPlaceTurnPiece,
    canPlaceVerifyPiece,
    cleanupSingleCellStub,
    clearAllPaths,
    clearColorPath,
    clearPendingPieces,
    confirmTurn,
    coordKey,
    createBlueprint,
    createMatchState,
    declareImpossibility,
    DEFAULT_CONFIG,
    eraseAtCell,
    evaluateVerification,
    extendPathTo,
    getColorCounts,
    getPathCellOwnerMap,
    getPendingColorIds,
    getReachableLineCells,
    handleMoveTimeout,
    handleVerifyResign,
    handleVerifyTimeout,
    isPathCompleteForColor,
    placeTurnPiece,
    placeVerifyPiece,
    prepareNextRound,
    removePendingPiece,
    requiredPlacementsForTurn,
    resetAllVerifyPieces,
    startRoundWithFirstPlayer,
    undoLastPendingPiece,
  } from './lib/engine';
  import {
    appendMatchHistory,
    clearMatchHistory,
    deleteMatchHistoryItem,
    deleteSavedBoard,
    generateId,
    loadMatchHistory,
    loadSavedBoards,
    sanitizeBlueprint,
    upsertSavedBoard,
  } from './lib/storage';
  import type {
    BoardBlueprint,
    Coord,
    GameConfig,
    GameState,
    MatchHistoryRecord,
    PlayerId,
    SavedBoard,
  } from './lib/types';

  let savedConfig = $state<GameConfig>({ ...DEFAULT_CONFIG, playerNames: [...DEFAULT_CONFIG.playerNames] });
  let activeBlueprint = $state<BoardBlueprint>(createBlueprint(DEFAULT_CONFIG.rows, DEFAULT_CONFIG.cols));
  let activeBoardId = $state<string | null>(null);
  let activeBoardName = $state<string>('空白棋盘');

  let savedBoards = $state<SavedBoard[]>(loadSavedBoards());
  let matchHistory = $state<MatchHistoryRecord[]>(loadMatchHistory());
  let showBoardEditor = $state(false);
  let showHistory = $state(false);
  let currentMatchId = $state<string>(generateId('match'));
  let recordedMatchId = $state<string | null>(null);

  let game = $state<GameState>({
    ...createMatchState(DEFAULT_CONFIG),
    phase: 'setup',
  });

  let selectedColorId = $state<number | null>(null);
  let verifyTool = $state<'draw' | 'erase'>('draw');
  let activeDrawColorId = $state<number | null>(null);
  let placingSingletonColorId = $state<number | null>(null);
  let highlightedColorId = $state<number | null>(null);
  let toastMessage = $state<string | null>(null);
  let toastTimer: ReturnType<typeof setTimeout> | null = null;

  let remainingSec = $state<number | null>(null);

  function showToast(msg: string) {
    toastMessage = msg;
    if (toastTimer) {
      clearTimeout(toastTimer);
    }
    toastTimer = setTimeout(() => {
      toastMessage = null;
    }, 2600);
  }

  function formatTime(sec: number | null): string {
    if (sec === null) {
      return '不限时';
    }
    const clamped = Math.max(0, sec);
    const mins = Math.floor(clamped / 60);
    const rem = clamped % 60;
    return `${String(mins).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
  }

  const colorCounts = $derived(getColorCounts(game.pieces));
  const pendingColorIds = $derived(getPendingColorIds(game));
  const requiredNow = $derived(requiredPlacementsForTurn(game.turnIndex));
  const turnFull = $derived(game.pendingCoords.length >= requiredNow);
  const canConfirm = $derived(canConfirmTurn(game));
  const canDeclare = $derived(canDeclareImpossibility(game));
  const canFinishTurn = $derived(canCompleteCurrentTurn(game));
  const evaluation = $derived(evaluateVerification(game));
  const hasVerifyPieces = $derived(
    Object.values(game.pieces).some((piece) => piece.source === 'verify'),
  );
  const hasAnyPath = $derived(Object.keys(game.paths).length > 0);

  const activeOperatorName = $derived(game.config.playerNames[game.currentPlayer]);
  const isTimerDanger = $derived(remainingSec !== null && remainingSec <= 15);
  const timerPhase = $derived(game.phase);
  const timerTurnKey = $derived(
    game.phase === 'playing'
      ? `playing:${game.roundNumber}:${game.turnIndex}`
      : game.phase === 'verifying'
        ? `verifying:${game.roundNumber}`
        : 'idle',
  );
  const activeTimerLimit = $derived(
    game.phase === 'playing'
      ? game.config.moveTimeLimitSec
      : game.phase === 'verifying'
        ? game.config.verifyTimeLimitSec
        : null,
  );

  $effect(() => {
    void timerTurnKey;
    remainingSec = activeTimerLimit;
  });

  $effect(() => {
    if (timerPhase !== 'playing' && timerPhase !== 'verifying') {
      return;
    }
    if (activeTimerLimit === null) {
      return;
    }

    const interval = setInterval(() => {
      if (remainingSec === null) {
        return;
      }
      if (remainingSec <= 1) {
        remainingSec = 0;
        if (game.phase === 'playing') {
          game = handleMoveTimeout(game);
        } else if (game.phase === 'verifying') {
          activeDrawColorId = null;
          placingSingletonColorId = null;
          game = handleVerifyTimeout(game);
        }
      } else {
        remainingSec -= 1;
      }
    }, 1000);

    return () => clearInterval(interval);
  });

  $effect(() => {
    if (
      game.phase === 'match_over' &&
      game.lastRoundResult !== null &&
      recordedMatchId !== currentMatchId
    ) {
      recordedMatchId = currentMatchId;
      const record: MatchHistoryRecord = {
        id: currentMatchId,
        playedAt: new Date().toISOString(),
        playerNames: [game.config.playerNames[0], game.config.playerNames[1]],
        scores: [game.scores[0], game.scores[1]],
        winner: game.lastRoundResult.winner,
        targetWins: game.config.targetWins,
        boardName: activeBoardName,
        rows: game.blueprint.rows,
        cols: game.blueprint.cols,
        minPathLength: game.config.minPathLength,
        colorCount: game.config.colorCount,
        blockedCount: game.blueprint.blockedCells.length,
        presetCount: game.blueprint.presetPieces.length,
        rounds: game.history.map((item) => ({ ...item })),
      };
      matchHistory = appendMatchHistory(record);
    }
  });

  function resetTransientUi() {
    selectedColorId = null;
    verifyTool = 'draw';
    activeDrawColorId = null;
    placingSingletonColorId = null;
    highlightedColorId = null;
  }

  function handleUpdateBlueprint(blueprint: BoardBlueprint, name: string, boardId: string | null) {
    activeBlueprint = sanitizeBlueprint(blueprint);
    activeBoardName = name;
    activeBoardId = boardId;
    savedConfig = {
      ...savedConfig,
      rows: activeBlueprint.rows,
      cols: activeBlueprint.cols,
    };
  }

  function handleSaveBoardToStorage(board: SavedBoard) {
    savedBoards = upsertSavedBoard(board);
    if (activeBoardId === board.id) {
      activeBoardName = board.name;
    }
  }

  function handleDeleteBoardFromStorage(id: string) {
    savedBoards = deleteSavedBoard(id);
    if (activeBoardId === id) {
      activeBoardId = null;
    }
  }

  function handleApplyEditorBoard(blueprint: BoardBlueprint, name: string, boardId: string | null) {
    handleUpdateBlueprint(blueprint, name, boardId);
    showBoardEditor = false;
  }

  function handleDeleteHistoryItem(id: string) {
    matchHistory = deleteMatchHistoryItem(id);
  }

  function handleClearHistory() {
    matchHistory = clearMatchHistory();
  }

  function handleStartMatch(config: GameConfig) {
    const cleanBp = sanitizeBlueprint({
      ...activeBlueprint,
      rows: config.rows,
      cols: config.cols,
    });
    activeBlueprint = cleanBp;
    savedConfig = { ...config, playerNames: [...config.playerNames] };
    currentMatchId = generateId('match');
    recordedMatchId = null;
    game = createMatchState(savedConfig, cleanBp);
    resetTransientUi();
  }

  function handleSelectFirstPlayer(player: PlayerId) {
    game = startRoundWithFirstPlayer(game, player);
    resetTransientUi();
  }

  function handleSelectColor(colorId: number) {
    if (selectedColorId === colorId) {
      selectedColorId = null;
    } else {
      selectedColorId = colorId;
    }
  }

  function handlePlayingCellClick(coord: Coord) {
    const key = coordKey(coord);
    if (game.pendingCoords.includes(key)) {
      const piece = game.pieces[key];
      game = removePendingPiece(game, coord);
      if (piece) {
        selectedColorId = piece.colorId;
      }
      return;
    }

    if (selectedColorId === null) {
      showToast('请先在右侧选择一个字母颜色，再点击棋盘空格落子');
      return;
    }

    const check = canPlaceTurnPiece(game, coord, selectedColorId);
    if (!check.ok) {
      if (check.reason) {
        showToast(check.reason);
      }
      return;
    }

    game = placeTurnPiece(game, coord, selectedColorId);
    selectedColorId = null;
  }

  function handleUndoPending() {
    if (game.pendingCoords.length === 0) {
      return;
    }
    const lastKey = game.pendingCoords[game.pendingCoords.length - 1];
    const piece = game.pieces[lastKey];
    game = undoLastPendingPiece(game);
    if (piece) {
      selectedColorId = piece.colorId;
    }
  }

  function handleClearPending() {
    game = clearPendingPieces(game);
    selectedColorId = null;
  }

  function handleConfirmTurn() {
    if (!canConfirmTurn(game)) {
      return;
    }
    game = confirmTurn(game);
    selectedColorId = null;
  }

  function handleDeclareImpossibility() {
    if (!canDeclareImpossibility(game)) {
      return;
    }
    game = declareImpossibility(game);
    resetTransientUi();
    showToast(`进入连线验证模式！由 ${game.config.playerNames[game.currentPlayer]} 进行证明`);
  }

  function cancelActiveDraw() {
    if (activeDrawColorId !== null) {
      game = cleanupSingleCellStub(game, activeDrawColorId);
      activeDrawColorId = null;
    }
  }

  function handleSetVerifyTool(tool: 'draw' | 'erase') {
    cancelActiveDraw();
    placingSingletonColorId = null;
    verifyTool = tool;
  }

  function handleTogglePlaceSingleton(colorId: number) {
    cancelActiveDraw();
    if (placingSingletonColorId === colorId) {
      placingSingletonColorId = null;
    } else {
      verifyTool = 'draw';
      placingSingletonColorId = colorId;
    }
  }

  function handleVerifyCellClick(coord: Coord) {
    if (game.phase !== 'verifying') {
      return;
    }

    if (placingSingletonColorId !== null) {
      const check = canPlaceVerifyPiece(game, coord, placingSingletonColorId);
      if (!check.ok) {
        if (check.reason) {
          showToast(check.reason);
        }
        return;
      }
      game = placeVerifyPiece(game, coord, placingSingletonColorId);
      placingSingletonColorId = null;
      if (game.phase !== 'verifying') {
        activeDrawColorId = null;
      }
      return;
    }

    if (verifyTool === 'erase') {
      cancelActiveDraw();
      game = eraseAtCell(game, coord);
      return;
    }

    const key = coordKey(coord);
    const piece = game.pieces[key];
    const pathOwners = getPathCellOwnerMap(game.paths);
    const owner = pathOwners.get(key);

    if (activeDrawColorId === null) {
      if (piece) {
        const colorId = piece.colorId;
        const existing = game.paths[colorId];
        if (
          existing &&
          existing.length >= 2 &&
          coordKey(existing[existing.length - 1]) === key &&
          !isPathCompleteForColor(game, colorId)
        ) {
          activeDrawColorId = colorId;
        } else {
          game = {
            ...game,
            paths: {
              ...game.paths,
              [colorId]: [coord],
            },
          };
          activeDrawColorId = colorId;
        }
        return;
      }

      if (owner !== undefined) {
        const existing = game.paths[owner] ?? [];
        const idx = existing.findIndex((cell) => coordKey(cell) === key);
        if (idx >= 0) {
          game = {
            ...game,
            paths: {
              ...game.paths,
              [owner]: existing.slice(0, idx + 1),
            },
          };
          activeDrawColorId = owner;
        }
        return;
      }

      showToast('请先点击一个棋子或已有连线作为起点');
      return;
    }

    const currentColor = activeDrawColorId;
    const currentPath = game.paths[currentColor] ?? [];
    const tip = currentPath[currentPath.length - 1];

    if (tip && coordKey(tip) === key) {
      cancelActiveDraw();
      return;
    }

    const selfIdx = currentPath.findIndex((cell) => coordKey(cell) === key);
    if (selfIdx >= 0 && selfIdx < currentPath.length - 1) {
      game = {
        ...game,
        paths: {
          ...game.paths,
          [currentColor]: currentPath.slice(0, selfIdx + 1),
        },
      };
      return;
    }

    const reachable = getReachableLineCells(game, currentColor);
    if (reachable.has(key)) {
      game = extendPathTo(game, currentColor, coord);
      if (game.phase !== 'verifying' || isPathCompleteForColor(game, currentColor)) {
        activeDrawColorId = null;
      }
      return;
    }

    if (piece && piece.colorId !== currentColor) {
      game = cleanupSingleCellStub(game, currentColor);
      const nextColor = piece.colorId;
      const existing = game.paths[nextColor];
      if (
        existing &&
        existing.length >= 2 &&
        coordKey(existing[existing.length - 1]) === key &&
        !isPathCompleteForColor(game, nextColor)
      ) {
        activeDrawColorId = nextColor;
      } else {
        game = {
          ...game,
          paths: {
            ...game.paths,
            [nextColor]: [coord],
          },
        };
        activeDrawColorId = nextColor;
      }
      return;
    }

    if (owner !== undefined && owner !== currentColor) {
      game = cleanupSingleCellStub(game, currentColor);
      const existing = game.paths[owner] ?? [];
      const idx = existing.findIndex((cell) => coordKey(cell) === key);
      if (idx >= 0) {
        game = {
          ...game,
          paths: {
            ...game.paths,
            [owner]: existing.slice(0, idx + 1),
          },
        };
        activeDrawColorId = owner;
      }
      return;
    }

    showToast('请点击当前端点同行/同列的高亮格折线延伸，或再次点击端点/按 Esc 取消');
  }

  function handleVerifyCellRightClick(coord: Coord) {
    if (game.phase !== 'verifying') {
      return;
    }
    cancelActiveDraw();
    placingSingletonColorId = null;
    game = eraseAtCell(game, coord);
  }

  function handleClearColorPath(colorId: number) {
    if (activeDrawColorId === colorId) {
      activeDrawColorId = null;
    }
    game = clearColorPath(game, colorId);
  }

  function handleClearAllPaths() {
    activeDrawColorId = null;
    game = clearAllPaths(game);
  }

  function handleResetVerifyPieces() {
    cancelActiveDraw();
    placingSingletonColorId = null;
    game = resetAllVerifyPieces(game);
  }

  function handleResign() {
    activeDrawColorId = null;
    placingSingletonColorId = null;
    game = handleVerifyResign(game);
  }

  function handleNextRound() {
    game = prepareNextRound(game);
    resetTransientUi();
  }

  function handleRematch() {
    currentMatchId = generateId('match');
    recordedMatchId = null;
    game = createMatchState(savedConfig, sanitizeBlueprint(activeBlueprint));
    resetTransientUi();
  }

  function handleBackToSetup() {
    game = {
      ...createMatchState(savedConfig),
      phase: 'setup',
    };
    resetTransientUi();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      if (showBoardEditor) {
        showBoardEditor = false;
        return;
      }
      if (showHistory) {
        showHistory = false;
        return;
      }
      if (game.phase === 'playing') {
        selectedColorId = null;
      } else if (game.phase === 'verifying') {
        cancelActiveDraw();
        placingSingletonColorId = null;
        if (verifyTool === 'erase') {
          verifyTool = 'draw';
        }
      }
    } else if (event.key === 'Enter' && game.phase === 'playing' && canConfirm) {
      handleConfirmTurn();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />

{#if game.phase === 'setup'}
  <SetupView
    initialConfig={savedConfig}
    {activeBlueprint}
    {activeBoardId}
    {activeBoardName}
    {savedBoards}
    historyCount={matchHistory.length}
    onUpdateBlueprint={handleUpdateBlueprint}
    onOpenEditor={() => (showBoardEditor = true)}
    onOpenHistory={() => (showHistory = true)}
    onStart={handleStartMatch}
  />
{:else}
  <div class="game-layout">
    <header class="top-bar">
      <div class="brand-group">
        <BrandTitle size="sm" />
        <span class="round-pill">第 {game.roundNumber} 局</span>
        <span class="rule-pill">
          {game.config.rows}×{game.config.cols} · 最短 {game.config.minPathLength} 格 · {game.config.targetWins} 胜
          {#if game.blueprint.blockedCells.length > 0}
            · {game.blueprint.blockedCells.length} 黑块
          {/if}
          {#if game.blueprint.presetPieces.length > 0}
            · {game.blueprint.presetPieces.length} 预设子
          {/if}
        </span>
      </div>

      <div class="top-actions">
        <button type="button" class="btn btn-ghost small" onclick={() => (showHistory = true)}>
          历史对决 ({matchHistory.length})
        </button>
        <button type="button" class="btn btn-ghost small" onclick={handleBackToSetup}>配置 / 新赛</button>
      </div>
    </header>

    <section class="match-score" aria-label="当前比分">
      <h1>当前比分</h1>
      <div class="scoreboard tabular">
        <div class="player-score p0" class:active={game.currentPlayer === 0 && (game.phase === 'playing' || game.phase === 'verifying')}>
          <div class="p-meta">
            <span class="p-name">{game.config.playerNames[0]}</span>
            {#if game.config.targetWins <= 10}
              <span class="p-pips">
                {#each Array(game.config.targetWins) as _, idx}
                  <span class="pip" class:filled={idx < game.scores[0]}></span>
                {/each}
              </span>
            {/if}
          </div>
          <span class="p-num">{game.scores[0]}</span>
        </div>

        <span class="score-colon" aria-hidden="true">:</span>

        <div class="player-score p1" class:active={game.currentPlayer === 1 && (game.phase === 'playing' || game.phase === 'verifying')}>
          <span class="p-num">{game.scores[1]}</span>
          <div class="p-meta">
            <span class="p-name">{game.config.playerNames[1]}</span>
            {#if game.config.targetWins <= 10}
              <span class="p-pips">
                {#each Array(game.config.targetWins) as _, idx}
                  <span class="pip" class:filled={idx < game.scores[1]}></span>
                {/each}
              </span>
            {/if}
          </div>
        </div>
      </div>
    </section>

    <main class="workspace">
      <section class="board-column">
        <div
          class="operator-bar"
          class:p0={game.currentPlayer === 0}
          class:p1={game.currentPlayer === 1}
          class:verifying={game.phase === 'verifying'}
        >
          <div class="operator-left">
            <span class="op-label">
              {#if game.phase === 'verifying'}
                连线验证操作人
              {:else if game.phase === 'playing'}
                当前落子操作人
              {:else}
                当前状态
              {/if}
            </span>
            <strong class="op-name">{activeOperatorName}</strong>
            {#if game.phase === 'playing'}
              <span class="op-step">
                {#if game.turnIndex === 0}
                  先手首步 · 放 1 枚 ({game.pendingCoords.length}/1)
                {:else}
                  放 2 枚不同色 ({game.pendingCoords.length}/2)
                {/if}
              </span>
            {:else if game.phase === 'verifying' && activeDrawColorId !== null}
              {@const activeColor = getPieceColor(activeDrawColorId)}
              <span class="drawing-pill">
                正在划线 <strong>{activeColor.letter}</strong>（{game.paths[activeDrawColorId]?.length ?? 1} 格）
                <button type="button" class="cancel-inline" onclick={cancelActiveDraw}>取消选中</button>
              </span>
            {/if}
          </div>

          <div class="timer-box tabular" class:danger={isTimerDanger}>
            <span class="timer-label">
              {game.phase === 'verifying' ? '验证剩余' : '本回合剩余'}
            </span>
            <span class="timer-value">{formatTime(remainingSec)}</span>
          </div>
        </div>

        <BoardCanvas
          {game}
          {evaluation}
          {selectedColorId}
          {activeDrawColorId}
          {verifyTool}
          {placingSingletonColorId}
          {highlightedColorId}
          onPlayingCellClick={handlePlayingCellClick}
          onVerifyCellClick={handleVerifyCellClick}
          onVerifyCellRightClick={handleVerifyCellRightClick}
        />

        {#if toastMessage}
          <div class="toast" role="status">{toastMessage}</div>
        {/if}
      </section>

      <aside class="side-panel">
        {#if game.phase === 'verifying' && game.verifier !== null && game.declarer !== null}
          <VerifyPanel
            verifierName={game.config.playerNames[game.verifier]}
            declarerName={game.config.playerNames[game.declarer]}
            minPathLength={game.config.minPathLength}
            {evaluation}
            {verifyTool}
            {placingSingletonColorId}
            {hasVerifyPieces}
            {hasAnyPath}
            onSetTool={handleSetVerifyTool}
            onTogglePlaceSingleton={handleTogglePlaceSingleton}
            onClearColorPath={handleClearColorPath}
            onClearAllPaths={handleClearAllPaths}
            onResetVerifyPieces={handleResetVerifyPieces}
            onHoverColor={(id) => (highlightedColorId = id)}
            onResign={handleResign}
          />
        {:else}
          <div class="play-panel">
            <div class="turn-hint-box">
              {#if !canFinishTurn && game.phase === 'playing'}
                <div class="blocked-warning">
                  当前剩余空位或可用颜色不足以完成本回合落子，请点击下方「认定不可能」。
                </div>
              {:else if selectedColorId !== null}
                {@const sel = getPieceColor(selectedColorId)}
                <div class="selected-banner">
                  <span>
                    已选中棋子
                    <strong style="color: {sel.hex};">{sel.letter}</strong>，请点击棋盘空格放置
                  </span>
                  <button type="button" class="cancel-inline" onclick={() => (selectedColorId = null)}>
                    取消
                  </button>
                </div>
              {:else if turnFull}
                <div class="ready-banner">
                  已放好本回合棋子（点击棋盘上虚线棋子可撤回重放），确认无误后点击下方「确认落子」。
                </div>
              {:else}
                <div class="idle-banner">
                  点击下方任意可用字母棋子，再点击棋盘空格放置；可随时点击已放棋子撤回。
                </div>
              {/if}
            </div>

            <ColorPalette
              colorCount={game.config.colorCount}
              {colorCounts}
              {pendingColorIds}
              {selectedColorId}
              {turnFull}
              onSelectColor={handleSelectColor}
              onHoverColor={(id) => (highlightedColorId = id)}
            />

            <div class="play-actions">
              <div class="undo-row">
                <button
                  type="button"
                  class="btn btn-ghost"
                  disabled={game.pendingCoords.length === 0 || game.phase !== 'playing'}
                  onclick={handleUndoPending}
                >
                  撤销上一枚
                </button>
                <button
                  type="button"
                  class="btn btn-ghost"
                  disabled={game.pendingCoords.length === 0 || game.phase !== 'playing'}
                  onclick={handleClearPending}
                >
                  清空本回合
                </button>
              </div>

              <button
                type="button"
                class="btn btn-primary confirm-btn"
                disabled={!canConfirm}
                onclick={handleConfirmTurn}
              >
                确认落子并换手 ({game.pendingCoords.length}/{requiredNow})
              </button>

              <div class="divider"></div>

              <button
                type="button"
                class="btn btn-outline-danger impossible-btn"
                disabled={!canDeclare}
                onclick={handleDeclareImpossibility}
              >
                认定不可能
              </button>
              <span class="impossible-note">
                {#if canDeclare && game.lastMover !== null}
                  点击后将由上一手落子方 <strong>{game.config.playerNames[game.lastMover]}</strong> 进行连线证明
                {:else}
                  首步落子完成后，双方均可在自己回合发起「认定不可能」
                {/if}
              </span>
            </div>
          </div>
        {/if}
      </aside>
    </main>
  </div>

  {#if game.phase === 'select_first'}
    <FirstPlayerModal
      roundNumber={game.roundNumber}
      playerNames={game.config.playerNames}
      scores={game.scores}
      targetWins={game.config.targetWins}
      onSelect={handleSelectFirstPlayer}
      onBackToSetup={handleBackToSetup}
    />
  {/if}

  {#if (game.phase === 'round_over' || game.phase === 'match_over') && game.lastRoundResult}
    <RoundResultModal
      result={game.lastRoundResult}
      isMatchOver={game.phase === 'match_over'}
      playerNames={game.config.playerNames}
      scores={game.scores}
      targetWins={game.config.targetWins}
      onNextRound={handleNextRound}
      onRematch={handleRematch}
      onBackToSetup={handleBackToSetup}
    />
  {/if}
{/if}

{#if showBoardEditor}
  <BoardEditorModal
    initialBlueprint={activeBlueprint}
    initialBoardId={activeBoardId}
    initialBoardName={activeBoardName}
    {savedBoards}
    onSaveBoard={handleSaveBoardToStorage}
    onDeleteBoard={handleDeleteBoardFromStorage}
    onApply={handleApplyEditorBoard}
    onClose={() => (showBoardEditor = false)}
  />
{/if}

{#if showHistory}
  <MatchHistoryModal
    records={matchHistory}
    onClose={() => (showHistory = false)}
    onDelete={handleDeleteHistoryItem}
    onClearAll={handleClearHistory}
  />
{/if}

<style>
  .game-layout {
    min-height: 100vh;
    display: flex;
    flex-direction: column;
    max-width: 1240px;
    margin: 0 auto;
    padding: clamp(16px, 3vw, 32px) clamp(12px, 3vw, 30px) 32px;
    gap: 20px;
  }

  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 14px;
    flex-wrap: wrap;
    padding: 2px 0;
  }

  .brand-group {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .round-pill {
    font-size: 0.76rem;
    font-weight: 700;
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--bg-surface);
    color: var(--text-primary);
    border: 1px solid var(--border-subtle);
  }

  .rule-pill {
    font-size: 0.75rem;
    color: var(--text-muted);
  }

  .match-score {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 2.4fr) minmax(0, 1fr);
    align-items: center;
    gap: 12px;
    padding: 12px clamp(12px, 2vw, 24px);
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
  }

  .match-score h1 {
    margin: 0;
    color: var(--text-secondary);
    font-size: 0.85rem;
    font-weight: 650;
  }

  .scoreboard {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: clamp(8px, 2vw, 18px);
  }

  .player-score {
    --player-color: var(--accent-p0);
    --player-ink: var(--player-p0-ink);
    --player-tint: var(--player-p0-tint);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 4px;
    border-radius: var(--radius-md);
    transition: background-color 0.15s ease;
  }

  .player-score.p1 {
    --player-color: var(--accent-p1);
    --player-ink: var(--player-p1-ink);
    --player-tint: var(--player-p1-tint);
    justify-content: flex-start;
  }

  .p-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    min-width: 0;
    gap: 6px;
  }

  .player-score.p1 .p-meta {
    align-items: flex-start;
  }

  .player-score.active {
    background: var(--player-tint);
  }

  .p-name {
    font-size: 0.8rem;
    font-weight: 700;
    line-height: 1.1;
    color: var(--text-secondary);
    overflow-wrap: anywhere;
  }

  .player-score.active .p-name {
    color: var(--player-ink);
  }

  .p-num {
    flex-shrink: 0;
    min-width: 56px;
    height: 54px;
    padding: 0 10px;
    border-radius: 14px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 2rem;
    font-weight: 800;
    line-height: 1;
    color: var(--player-ink);
    background: var(--player-tint);
  }

  .player-score.active .p-num {
    background: var(--bg-surface);
  }

  .p-pips {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .pip {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #cbd5e1;
  }

  .pip.filled {
    background: var(--player-color);
  }

  .score-colon {
    color: var(--text-muted);
    font-size: 1.5rem;
    font-weight: 600;
  }

  .btn.small {
    padding: 6px 11px;
    font-size: 0.8rem;
  }

  .top-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: 16px;
    align-items: start;
  }

  .board-column {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 14px;
    min-width: 0;
    padding: clamp(10px, 2vw, 20px);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    background: var(--bg-surface);
    box-shadow: var(--shadow-card);
  }

  .operator-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 12px 14px;
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
  }

  .operator-bar.p0 {
    --operator-color: var(--accent-p0);
  }

  .operator-bar.p1 {
    --operator-color: var(--accent-p1);
  }

  .operator-bar.verifying {
    background: var(--player-p1-tint);
  }

  .operator-left {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .op-label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.76rem;
    font-weight: 700;
    color: var(--text-secondary);
  }

  .op-label::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--operator-color);
  }

  .op-name {
    font-size: 1.05rem;
    font-weight: 800;
  }

  .op-step {
    font-size: 0.82rem;
    color: var(--text-secondary);
  }

  .drawing-pill {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    font-size: 0.8rem;
    padding: 3px 9px;
    border-radius: 999px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #1e40af;
  }

  .cancel-inline {
    padding: 2px 7px;
    border-radius: 6px;
    background: #ffffff;
    border: 1px solid #bfdbfe;
    color: #1d4ed8;
    font-size: 0.74rem;
    font-weight: 700;
  }

  .cancel-inline:hover {
    background: #dbeafe;
  }

  .timer-box {
    display: flex;
    align-items: baseline;
    gap: 8px;
    padding: 5px 12px;
    border-radius: var(--radius-sm);
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
  }

  .timer-box.danger {
    border-color: #fda4af;
    background: #fff1f2;
    color: #be123c;
  }

  .timer-label {
    font-size: 0.72rem;
    color: var(--text-muted);
  }

  .timer-value {
    font-size: 1.15rem;
    font-weight: 800;
  }

  .side-panel {
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: clamp(14px, 2vw, 22px);
    box-shadow: var(--shadow-card);
  }

  .play-panel {
    display: flex;
    flex-direction: column;
    gap: 18px;
  }

  .turn-hint-box {
    font-size: 0.81rem;
    line-height: 1.48;
  }

  .idle-banner,
  .selected-banner,
  .ready-banner,
  .blocked-warning {
    padding: 9px 11px;
    border-radius: var(--radius-sm);
  }

  .idle-banner {
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
  }

  .selected-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    background: #eff6ff;
    border: 1px solid #bfdbfe;
    color: #1e3a8a;
  }

  .ready-banner {
    background: #f0fdf4;
    border: 1px solid #bbf7d0;
    color: #166534;
  }

  .blocked-warning {
    background: #fffbeb;
    border: 1px solid #fde68a;
    color: #92400e;
  }

  .play-actions {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .undo-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .confirm-btn,
  .impossible-btn {
    width: 100%;
    padding: 11px 14px;
  }

  .divider {
    height: 1px;
    background: var(--border-subtle);
    margin: 3px 0;
  }

  .impossible-note {
    font-size: 0.75rem;
    color: var(--text-muted);
    text-align: center;
    line-height: 1.4;
  }

  .toast {
    align-self: center;
    padding: 7px 14px;
    border-radius: 999px;
    background: #0f172a;
    border: 1px solid #1e293b;
    color: #f8fafc;
    font-size: 0.82rem;
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.18);
  }

  @media (max-width: 960px) {
    .workspace {
      grid-template-columns: 1fr;
    }
  }

  @media (max-width: 680px) {
    .match-score {
      grid-template-columns: minmax(0, 1fr);
      gap: 6px;
    }

    .p-num {
      min-width: 42px;
      height: 44px;
      font-size: 1.7rem;
    }
  }
</style>
