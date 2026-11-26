<script lang="ts">
  import { onDestroy } from 'svelte';
  import BoardCanvas from './components/BoardCanvas.svelte';
  import BoardEditorModal from './components/BoardEditorModal.svelte';
  import BrandTitle from './components/BrandTitle.svelte';
  import ColorPalette from './components/ColorPalette.svelte';
  import FirstPlayerModal from './components/FirstPlayerModal.svelte';
  import MatchHistoryModal from './components/MatchHistoryModal.svelte';
  import RoundResultModal from './components/RoundResultModal.svelte';
  import SetupView from './components/SetupView.svelte';
  import VerifyPanel from './components/VerifyPanel.svelte';
  import { getPieceColor, PIECE_COLORS } from './lib/colors';
  import {
    applyVerificationSolution,
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
    getPieceCoordsByColor,
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
    setRoundBlueprint,
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
  import type { SolveBoardRequest, SolveResult } from './lib/solver';
  import {
    boardAlternatives, boardHasRoom, boardOptionLabel, CURRENT_BOARD_ID, DEFAULT_BOARD_PLAN, type BoardPlan,
  } from './lib/round-boards';
  import type {
    BoardBlueprint,
    Coord,
    GameConfig,
    GameState,
    MatchBoard,
    MatchHistoryRecord,
    PlayerId,
    SavedBoard,
  } from './lib/types';

  let savedConfig = $state<GameConfig>({ ...DEFAULT_CONFIG, playerNames: [...DEFAULT_CONFIG.playerNames] });
  let activeBlueprint = $state<BoardBlueprint>(createBlueprint(DEFAULT_CONFIG.rows, DEFAULT_CONFIG.cols));
  let activeBoardId = $state<string | null>(null);
  let activeBoardName = $state<string>('空白棋盘');
  let boardPlan = $state.raw<BoardPlan>(DEFAULT_BOARD_PLAN);
  let roundBoards = $state.raw<MatchBoard[]>([]);
  let matchBoardPool = $state.raw<MatchBoard[]>([]);

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
  let solverJob = $state.raw<{
    worker: Worker;
    position: GameState;
    timeout: ReturnType<typeof setTimeout>;
  } | null>(null);

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
  const boardSize = $derived(`${game.config.rows}×${game.config.cols}`);
  const currentRoundBoard = $derived(roundBoards[game.roundNumber - 1]);
  const nextRoundBoard = $derived(roundBoards[game.roundNumber]);
  const randomSwaps = $derived(currentRoundBoard && boardPlan.mode !== 'same'
    ? boardAlternatives(currentRoundBoard, roundBoards, matchBoardPool)
    : []);
  const swapChoices = $derived(boardPlan.mode === 'same' ? [] : [
    ...matchBoardPool,
    ...savedBoards.filter(({ id }) => !matchBoardPool.some((board) => board.id === id)),
    { id: CURRENT_BOARD_ID, name: `当前棋盘 · ${activeBoardName}`, blueprint: activeBlueprint },
  ].filter((board) => board.id !== currentRoundBoard?.id && boardHasRoom(board, game.config.minPathLength)));
  $effect(() => {
    if (solverJob && game !== solverJob.position) stopAutoSolve();
  });
  onDestroy(stopAutoSolve);

  const hasVerifyPieces = $derived(
    Object.values(game.pieces).some((piece) => piece.source === 'verify'),
  );
  const hasAnyPath = $derived(Object.keys(game.paths).length > 0);

  const activeOperatorName = $derived(game.config.playerNames[game.currentPlayer]);
  const isActiveRound = $derived(game.phase === 'playing' || game.phase === 'verifying');
  const isShowingResult = $derived(game.phase === 'round_over' || game.phase === 'match_over');
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
      const firstBoard = roundBoards[0];
      const firstBlueprint = firstBoard?.blueprint ?? game.blueprint;
      const record: MatchHistoryRecord = {
        id: currentMatchId,
        playedAt: new Date().toISOString(),
        playerNames: [game.config.playerNames[0], game.config.playerNames[1]],
        scores: [game.scores[0], game.scores[1]],
        winner: game.lastRoundResult.winner,
        targetWins: game.config.targetWins,
        boardName: firstBoard?.name ?? activeBoardName,
        rows: firstBlueprint.rows,
        cols: firstBlueprint.cols,
        minPathLength: game.config.minPathLength,
        colorCount: PIECE_COLORS.length,
        blockedCount: firstBlueprint.blockedCells.length,
        presetCount: firstBlueprint.presetPieces.length,
        rounds: game.history.map((item) => {
          const board = roundBoards[item.roundNumber - 1];
          return board ? {
            ...item,
            board: { id: board.id, name: board.name, rows: board.blueprint.rows, cols: board.blueprint.cols },
          } : { ...item };
        }),
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

  function handleStartMatch(config: GameConfig, plan: BoardPlan, schedule: MatchBoard[], pool: MatchBoard[]) {
    boardPlan = plan;
    roundBoards = schedule;
    matchBoardPool = pool;
    savedConfig = { ...config, playerNames: [...config.playerNames] };
    currentMatchId = generateId('match');
    recordedMatchId = null;
    game = createMatchState(savedConfig, schedule[0].blueprint);
    resetTransientUi();
  }

  function handleSwapRoundBoard(board: MatchBoard) {
    if (game.phase !== 'select_first') return;
    const index = game.roundNumber - 1;
    roundBoards = roundBoards.map((existing, slot) => slot === index ? board : existing);
    game = setRoundBlueprint(game, board.blueprint);
  }

  function handleRandomBoardSwap() {
    if (randomSwaps.length === 0) return;
    handleSwapRoundBoard(randomSwaps[Math.floor(Math.random() * randomSwaps.length)]);
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
    if (game.phase !== 'playing') return;

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
      showToast('请先选择字母棋子，再点击棋盘空格落子');
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

  function stopAutoSolve() {
    if (!solverJob) return;
    clearTimeout(solverJob.timeout);
    solverJob.worker.terminate();
    solverJob = null;
  }

  function handleAutoSolve() {
    if (game.phase !== 'verifying' || solverJob) return;
    const unavailable = '无法启动自动求解，可继续手动验证。';
    if (typeof Worker === 'undefined' || typeof WebAssembly === 'undefined') {
      showToast(unavailable);
      return;
    }

    handleClearAllPaths();
    placingSingletonColorId = null;
    const position = game;
    const request: SolveBoardRequest = {
      rows: position.blueprint.rows,
      cols: position.blueprint.cols,
      minPathLength: position.config.minPathLength,
      blockedCells: position.blueprint.blockedCells.map(({ row, col }) => ({ row, col })),
      groups: [...getPieceCoordsByColor(position.pieces)],
    };

    try {
      const worker = new Worker(new URL('./lib/solver.worker.ts', import.meta.url), { type: 'module' });
      function finish(result: SolveResult) {
        if (solverJob?.worker !== worker) return;
        stopAutoSolve();
        if (game !== position) return;

        if (result.status === 'solved') {
          const next = applyVerificationSolution(game, result.solution.paths, result.solution.addedPieces);
          if (next !== game) {
            resetTransientUi();
            game = next;
            return;
          }
        }

        showToast(result.status === 'unavailable' ? unavailable
          : result.status === 'impossible' ? '当前盘面无解。'
          : '暂时无法确定盘面是否有解。');
      }
      solverJob = {
        worker,
        position,
        timeout: setTimeout(() => finish({ status: 'inconclusive' }), 6000),
      };
      worker.onmessage = (event: MessageEvent<SolveResult>) => finish(event.data);
      worker.onerror = () => finish({ status: 'unavailable' });
      worker.postMessage(request);
    } catch {
      stopAutoSolve();
      showToast(unavailable);
    }
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
    game = prepareNextRound(game, roundBoards[game.roundNumber]?.blueprint);
    resetTransientUi();
  }

  function handleRematch() {
    currentMatchId = generateId('match');
    recordedMatchId = null;
    const blueprint = roundBoards[0]?.blueprint ?? sanitizeBlueprint(activeBlueprint);
    game = setRoundBlueprint(createMatchState(savedConfig, blueprint), blueprint);
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
    initialBoardPlan={boardPlan}
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
  <div class="game-layout" class:playing={game.phase === 'playing'}>
    <header class="top-bar">
      <BrandTitle size="sm" />
      <div class="top-actions">
        <button type="button" class="btn btn-ghost small icon-btn" aria-label="历史对决" onclick={() => (showHistory = true)}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12a9 9 0 1 0 3-6.7M3 4v4h4M12 7v5l3 2" /></svg>
          <span class="btn-label">历史对决</span>
          {#if matchHistory.length > 0}
            <span class="count-badge tabular">{matchHistory.length}</span>
          {/if}
        </button>
        <button type="button" class="btn btn-ghost small icon-btn" aria-label="配置 / 新赛" onclick={handleBackToSetup}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
          <span class="btn-label">配置 / 新赛</span>
        </button>
      </div>
    </header>

    <section class="match-score" aria-label="当前比分">
      <div class="match-meta">
        <span class="round-pill">第 {game.roundNumber} / {roundBoards.length} 局</span>
        <span class="meta-sub">先得 {game.config.targetWins} 分获胜</span>
      </div>

      <div class="scoreboard tabular">
        {#each [0, 1] as const as player (player)}
          {@const isPlayerActive = game.currentPlayer === player && isActiveRound}
          <div
            class="player-score"
            class:p0={player === 0}
            class:p1={player === 1}
            class:active={isPlayerActive}
            class:waiting={isActiveRound && !isPlayerActive}
          >
            <div class="p-meta">
              <span class="p-name">{game.config.playerNames[player]}</span>
              {#if isActiveRound}
                <span class="p-status">
                  <span class="p-status-dot" aria-hidden="true"></span>
                  {#if isPlayerActive}
                    {game.phase === 'verifying' ? '验证中' : '落子中'}
                  {:else}
                    等待中
                  {/if}
                </span>
              {/if}
            </div>
            <span class="p-num">{game.scores[player]}</span>
          </div>
          {#if player === 0}
            <span class="score-colon" aria-hidden="true">:</span>
          {/if}
        {/each}
      </div>

      <div class="match-rules">
        {#if currentRoundBoard}<span class="rule-chip map-name">{currentRoundBoard.name}</span>{/if}
        {#if !currentRoundBoard?.name.endsWith(boardSize)}<span class="rule-chip">{boardSize}</span>{/if}
        <span class="rule-chip">最短 {game.config.minPathLength} 格</span>
        {#if game.blueprint.blockedCells.length > 0}
          <span class="rule-chip">{game.blueprint.blockedCells.length} 黑块</span>
        {/if}
        {#if game.blueprint.presetPieces.length > 0}
          <span class="rule-chip">{game.blueprint.presetPieces.length} 预设子</span>
        {/if}
      </div>
    </section>

    <main class="workspace" class:result-board={isShowingResult}>
      <section class="board-column">
        {#if isShowingResult}
          <div class="result-board-heading">
            <h2>最终棋盘</h2>
            <span>只读</span>
          </div>
        {:else}
          <div
            class="operator-bar"
            class:p0={game.currentPlayer === 0}
            class:p1={game.currentPlayer === 1}
            class:verifying={game.phase === 'verifying'}
          >
            <div class="operator-left">
              <span class="op-label">
                {#if game.phase === 'verifying'}
                  连线验证
                {:else if game.phase === 'playing'}
                  当前落子
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
        {/if}

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

        {#if isActiveRound && toastMessage}
          <div class="toast" role="status">{toastMessage}</div>
        {/if}
      </section>

      {#if !isShowingResult}
        <aside class="side-panel">
          {#if game.phase === 'verifying' && game.verifier !== null && game.declarer !== null}
            <VerifyPanel
              verifier={game.verifier}
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
              solving={solverJob !== null}
              onAutoSolve={handleAutoSolve}
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

                <div class="round-actions">
                  <button
                    type="button"
                    class="btn btn-primary confirm-btn"
                    disabled={!canConfirm}
                    onclick={handleConfirmTurn}
                  >
                    确认落子 <span class="tabular">({game.pendingCoords.length}/{requiredNow})</span>
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
                </div>
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
      {/if}
    </main>
  </div>

  {#if game.phase === 'select_first'}
    <FirstPlayerModal
      roundNumber={game.roundNumber}
      {currentRoundBoard}
      {swapChoices}
      canRandomSwap={randomSwaps.length > 0}
      onSwapBoard={handleSwapRoundBoard}
      onRandomSwap={handleRandomBoardSwap}
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
      nextBoardName={nextRoundBoard && boardOptionLabel(nextRoundBoard)}
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

  .round-actions {
    display: grid;
    gap: 9px;
  }

  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 2px 0;
  }

  .top-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .icon-btn svg {
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
    min-width: 19px;
    height: 19px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--bg-subtle);
    color: var(--text-secondary);
    font-size: 0.7rem;
    font-weight: 800;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
  }

  .btn.small {
    padding: 7px 13px;
    font-size: 0.8rem;
  }

  .match-score {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 14px;
    padding: 12px clamp(14px, 2vw, 22px);
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-card);
  }

  .match-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .round-pill {
    font-size: 0.76rem;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 999px;
    background: var(--ink-dark);
    color: #ffffff;
    white-space: nowrap;
  }

  .meta-sub {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--text-muted);
    white-space: nowrap;
  }

  .match-rules {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
    flex-wrap: wrap;
    min-width: 0;
  }

  .rule-chip {
    font-size: 0.72rem;
    font-weight: 600;
    color: var(--text-secondary);
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    white-space: nowrap;
  }

  .map-name {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .scoreboard {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: clamp(8px, 1.8vw, 16px);
  }

  .player-score {
    --player-color: var(--accent-p0);
    --player-ink: var(--player-p0-ink);
    --player-tint: var(--player-p0-tint);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    min-width: 164px;
    padding: 6px 6px 6px 16px;
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    border: 1.5px solid var(--border-subtle);
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease,
      box-shadow 0.18s ease,
      opacity 0.18s ease;
  }

  .player-score.p1 {
    --player-color: var(--accent-p1);
    --player-ink: var(--player-p1-ink);
    --player-tint: var(--player-p1-tint);
    flex-direction: row-reverse;
    padding: 6px 16px 6px 6px;
  }

  .p-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    min-width: 0;
    gap: 3px;
  }

  .player-score.p1 .p-meta {
    align-items: flex-start;
  }

  .player-score.active {
    background: var(--player-tint);
    border-color: var(--player-color);
    box-shadow: 0 4px 14px color-mix(in srgb, var(--player-color) 18%, transparent);
  }

  .player-score.waiting {
    opacity: 0.72;
  }

  .p-name {
    font-size: 0.9rem;
    font-weight: 750;
    line-height: 1.15;
    color: var(--text-secondary);
    overflow-wrap: anywhere;
  }

  .player-score.active .p-name {
    color: var(--text-primary);
  }

  .p-status {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 0.72rem;
    font-weight: 700;
    line-height: 1;
    color: var(--text-muted);
  }

  .player-score.active .p-status {
    color: var(--player-ink);
  }

  .p-status-dot {
    width: 6px;
    height: 6px;
    flex-shrink: 0;
    border-radius: 50%;
    background: var(--text-muted);
  }

  .player-score.active .p-status-dot {
    background: var(--player-color);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--player-color) 25%, transparent);
    animation: live-pulse 1.8s ease-in-out infinite;
  }

  @media (prefers-reduced-motion: reduce) {
    .player-score.active .p-status-dot {
      animation: none;
    }
  }

  @keyframes live-pulse {
    0%,
    100% {
      box-shadow: 0 0 0 2px color-mix(in srgb, var(--player-color) 25%, transparent);
    }
    50% {
      box-shadow: 0 0 0 5px color-mix(in srgb, var(--player-color) 10%, transparent);
    }
  }

  .p-num {
    flex-shrink: 0;
    min-width: 48px;
    height: 44px;
    padding: 0 10px;
    border-radius: 13px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.75rem;
    font-weight: 800;
    line-height: 1;
    color: var(--text-secondary);
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    transition:
      background-color 0.18s ease,
      border-color 0.18s ease,
      color 0.18s ease,
      box-shadow 0.18s ease;
  }

  .player-score.active .p-num {
    background: var(--player-color);
    color: #ffffff;
    border-color: transparent;
    box-shadow: 0 3px 10px color-mix(in srgb, var(--player-color) 35%, transparent);
  }

  .score-colon {
    color: var(--text-muted);
    font-size: 1.4rem;
    font-weight: 700;
    opacity: 0.65;
  }

  .workspace {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 360px;
    gap: 16px;
    align-items: start;
  }

  .workspace.result-board {
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
    max-width: 860px;
    margin-inline: auto;
  }

  .result-board-heading {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .result-board-heading h2 {
    margin: 0;
    font-size: 1rem;
  }

  .result-board-heading span {
    color: var(--text-secondary);
    font-size: 0.8rem;
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
    --operator-color: var(--accent-p0);
    --operator-ink: var(--player-p0-ink);
    --operator-tint: var(--player-p0-tint);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 10px 14px;
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    transition: background-color 0.18s ease, border-color 0.18s ease;
  }

  .operator-bar.p0 {
    --operator-color: var(--accent-p0);
    --operator-ink: var(--player-p0-ink);
    --operator-tint: var(--player-p0-tint);
  }

  .operator-bar.p1 {
    --operator-color: var(--accent-p1);
    --operator-ink: var(--player-p1-ink);
    --operator-tint: var(--player-p1-tint);
  }

  .operator-bar.verifying {
    background: var(--operator-tint);
    border-color: color-mix(in srgb, var(--operator-color) 24%, transparent);
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
    padding: 3px 9px;
    border-radius: 999px;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    font-size: 0.74rem;
    font-weight: 700;
    color: var(--text-secondary);
  }

  .operator-bar.verifying .op-label {
    color: var(--operator-ink);
    border-color: color-mix(in srgb, var(--operator-color) 24%, transparent);
  }

  .op-label::before {
    content: '';
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--operator-color);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--operator-color) 20%, transparent);
  }

  .op-name {
    font-size: 1.05rem;
    font-weight: 800;
    color: var(--text-primary);
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
    min-width: 0;
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
    position: fixed;
    top: max(16px, env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%);
    z-index: 35;
    max-width: min(92vw, 480px);
    padding: 9px 18px;
    border-radius: 999px;
    background: rgba(17, 19, 24, 0.92);
    backdrop-filter: blur(8px);
    border: 1px solid rgba(255, 255, 255, 0.08);
    color: #f8fafc;
    font-size: 0.82rem;
    font-weight: 600;
    text-align: center;
    box-shadow: 0 12px 28px rgba(15, 23, 42, 0.22);
    pointer-events: none;
    animation: toast-in 0.18s ease-out;
  }

  @keyframes toast-in {
    from {
      opacity: 0;
      transform: translate(-50%, -8px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  @media (max-width: 960px) {
    .workspace {
      grid-template-columns: minmax(0, 1fr);
    }

    .match-score {
      grid-template-columns: minmax(0, 1fr);
      gap: 10px;
    }

    .match-meta,
    .match-rules {
      justify-content: center;
    }

    .match-rules {
      order: 3;
    }
  }

  @media (min-width: 681px) and (max-width: 960px) and (orientation: landscape) and (pointer: coarse) {
    .workspace {
      grid-template-columns: minmax(0, 1fr) minmax(230px, 0.72fr);
    }

    .game-layout {
      padding-inline: max(12px, env(safe-area-inset-left)) max(12px, env(safe-area-inset-right));
    }
  }

  @media (max-width: 680px) {
    .game-layout {
      padding: max(12px, env(safe-area-inset-top)) max(10px, env(safe-area-inset-right)) max(16px, env(safe-area-inset-bottom)) max(10px, env(safe-area-inset-left));
      gap: 10px;
    }

    .game-layout.playing {
      padding-bottom: calc(82px + env(safe-area-inset-bottom));
    }

    .top-bar,
    .workspace,
    .board-column,
    .play-panel {
      gap: 8px;
    }

    .top-actions .btn {
      min-height: 40px;
      min-width: 40px;
      padding: 0 11px;
    }

    .top-actions .btn-label {
      display: none;
    }

    .match-score {
      grid-template-columns: auto minmax(0, 1fr);
      gap: 8px 10px;
      padding: 10px 12px;
    }

    .match-meta {
      justify-content: flex-start;
    }

    .meta-sub {
      display: none;
    }

    .match-rules {
      order: 0;
      justify-content: flex-end;
    }

    .scoreboard {
      grid-column: 1 / -1;
    }

    .player-score {
      min-width: 0;
      gap: 8px;
      padding: 4px 4px 4px 10px;
    }

    .player-score.p1 {
      padding: 4px 10px 4px 4px;
    }

    .p-num {
      min-width: 42px;
      height: 40px;
      font-size: 1.55rem;
    }

    .board-column,
    .side-panel {
      padding: 9px;
    }

    .operator-bar {
      display: grid;
      grid-template-columns: minmax(0, 1fr) auto;
      gap: 8px;
      padding: 7px 9px;
    }

    .operator-left {
      gap: 4px 8px;
      overflow-wrap: anywhere;
    }

    .op-step {
      flex-basis: 100%;
    }

    .timer-box {
      flex-direction: column;
      align-items: center;
      gap: 2px;
      padding: 4px 8px;
      white-space: nowrap;
    }

    .cancel-inline,
    .undo-row .btn {
      min-height: 36px;
    }

    .playing .round-actions {
      position: fixed;
      z-index: 20;
      inset: auto 0 0;
      grid-template-columns: minmax(0, 1.25fr) minmax(0, 1fr);
      padding: 9px max(12px, env(safe-area-inset-right)) calc(9px + env(safe-area-inset-bottom)) max(12px, env(safe-area-inset-left));
      background: var(--bg-surface);
      border-top: 1px solid var(--border-subtle);
      box-shadow: 0 -4px 18px rgb(17 19 24 / 8%);
    }

    .round-actions .btn {
      min-height: 44px;
      padding-inline: 8px;
    }

    .round-actions .divider {
      display: none;
    }
  }
</style>
