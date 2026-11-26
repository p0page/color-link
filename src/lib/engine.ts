import { PIECE_COLORS } from './colors';
import type {
  BoardBlueprint,
  CellKey,
  ColorVerificationStatus,
  Coord,
  GameConfig,
  GameState,
  Piece,
  PlayerId,
  PresetPiece,
  RoundEndReason,
  VerificationEvaluation,
} from './types';

export const DEFAULT_CONFIG: GameConfig = {
  rows: 10,
  cols: 10,
  minPathLength: 6,
  targetWins: 3,
  moveTimeLimitSec: 90,
  verifyTimeLimitSec: 300,
  playerNames: ['玩家 1', '玩家 2'],
};

export function cellKey(row: number, col: number): CellKey {
  return `${row},${col}`;
}

export function coordKey(coord: Coord): CellKey {
  return `${coord.row},${coord.col}`;
}

export function parseCellKey(key: CellKey): Coord {
  const [rowStr, colStr] = key.split(',');
  return { row: Number(rowStr), col: Number(colStr) };
}

export function otherPlayer(player: PlayerId): PlayerId {
  return player === 0 ? 1 : 0;
}

export function isInBounds(coord: Coord, rows: number, cols: number): boolean {
  return coord.row >= 0 && coord.row < rows && coord.col >= 0 && coord.col < cols;
}

export function isOrthogonallyAdjacent(first: Coord, second: Coord): boolean {
  return Math.abs(first.row - second.row) + Math.abs(first.col - second.col) === 1;
}

export function createBlueprint(
  rows: number,
  cols: number,
  blockedCells: Coord[] = [],
  presetPieces: BoardBlueprint['presetPieces'] = [],
): BoardBlueprint {
  return {
    rows,
    cols,
    blockedCells: blockedCells.map((coord) => ({ ...coord })),
    presetPieces: presetPieces.map((item) => ({
      coord: { ...item.coord },
      colorId: item.colorId,
    })),
  };
}

export function createBlockedSet(blueprint: BoardBlueprint): Set<CellKey> {
  return new Set(blueprint.blockedCells.map((coord) => coordKey(coord)));
}

export function createInitialPieces(blueprint: BoardBlueprint): Record<CellKey, Piece> {
  const blocked = createBlockedSet(blueprint);
  const pieces: Record<CellKey, Piece> = {};
  for (const preset of blueprint.presetPieces) {
    const key = coordKey(preset.coord);
    if (!isInBounds(preset.coord, blueprint.rows, blueprint.cols) || blocked.has(key)) {
      continue;
    }
    pieces[key] = {
      colorId: preset.colorId,
      locked: true,
      source: 'preset',
    };
  }
  return pieces;
}

export function createMatchState(
  config: GameConfig = DEFAULT_CONFIG,
  blueprint?: BoardBlueprint,
): GameState {
  const resolvedBlueprint = blueprint ?? createBlueprint(config.rows, config.cols);
  return {
    config: {
      ...config,
      playerNames: [config.playerNames[0], config.playerNames[1]],
    },
    blueprint: resolvedBlueprint,
    phase: 'select_first',
    roundNumber: 1,
    scores: [0, 0],
    firstPlayer: null,
    currentPlayer: 0,
    lastMover: null,
    turnIndex: 0,
    pieces: createInitialPieces(resolvedBlueprint),
    pendingCoords: [],
    declarer: null,
    verifier: null,
    paths: {},
    lastRoundResult: null,
    history: [],
  };
}

export function startRoundWithFirstPlayer(state: GameState, firstPlayer: PlayerId): GameState {
  return {
    ...state,
    phase: 'playing',
    firstPlayer,
    currentPlayer: firstPlayer,
    lastMover: null,
    turnIndex: 0,
    pieces: createInitialPieces(state.blueprint),
    pendingCoords: [],
    declarer: null,
    verifier: null,
    paths: {},
    lastRoundResult: null,
  };
}

export function setRoundBlueprint(state: GameState, blueprint: BoardBlueprint): GameState {
  if (state.phase !== 'select_first') return state;
  return {
    ...state,
    config: { ...state.config, rows: blueprint.rows, cols: blueprint.cols },
    blueprint,
    pieces: createInitialPieces(blueprint),
  };
}

export function prepareNextRound(state: GameState, blueprint = state.blueprint): GameState {
  return setRoundBlueprint({
    ...state,
    phase: 'select_first',
    roundNumber: state.roundNumber + 1,
    firstPlayer: null,
    lastMover: null,
    turnIndex: 0,
    pendingCoords: [],
    declarer: null,
    verifier: null,
    paths: {},
    lastRoundResult: null,
  }, blueprint);
}

export function requiredPlacementsForTurn(turnIndex: number): number {
  return turnIndex === 0 ? 1 : 2;
}

export function getColorCounts(pieces: Record<CellKey, Piece>): Map<number, number> {
  const counts = new Map<number, number>();
  for (const piece of Object.values(pieces)) {
    counts.set(piece.colorId, (counts.get(piece.colorId) ?? 0) + 1);
  }
  return counts;
}

export function getPieceCoordsByColor(pieces: Record<CellKey, Piece>): Map<number, Coord[]> {
  const map = new Map<number, Coord[]>();
  for (const [key, piece] of Object.entries(pieces) as Array<[CellKey, Piece]>) {
    const list = map.get(piece.colorId) ?? [];
    list.push(parseCellKey(key));
    map.set(piece.colorId, list);
  }
  return map;
}

export function getPendingColorIds(state: GameState): Set<number> {
  const result = new Set<number>();
  for (const key of state.pendingCoords) {
    const piece = state.pieces[key];
    if (piece) {
      result.add(piece.colorId);
    }
  }
  return result;
}

export function getEmptyCellCount(state: GameState): number {
  const total = state.blueprint.rows * state.blueprint.cols;
  const blocked = createBlockedSet(state.blueprint).size;
  const occupied = Object.keys(state.pieces).length;
  return Math.max(0, total - blocked - occupied);
}

export function getAvailableColorIdsForTurn(state: GameState): number[] {
  const counts = getColorCounts(state.pieces);
  const pendingColors = getPendingColorIds(state);
  const available: number[] = [];
  for (const { id: colorId } of PIECE_COLORS) {
    const count = counts.get(colorId) ?? 0;
    if (count < 2 && !pendingColors.has(colorId)) {
      available.push(colorId);
    }
  }
  return available;
}

export function canCompleteCurrentTurn(state: GameState): boolean {
  if (state.phase !== 'playing') {
    return false;
  }
  const remainingNeeded = requiredPlacementsForTurn(state.turnIndex) - state.pendingCoords.length;
  if (remainingNeeded <= 0) {
    return true;
  }
  const emptyCells = getEmptyCellCount(state);
  const availableColors = getAvailableColorIdsForTurn(state).length;
  return emptyCells >= remainingNeeded && availableColors >= remainingNeeded;
}

export function canPlaceTurnPiece(
  state: GameState,
  coord: Coord,
  colorId: number,
): { ok: boolean; reason?: string } {
  if (state.phase !== 'playing') {
    return { ok: false, reason: '当前不在落子阶段' };
  }
  if (!isInBounds(coord, state.blueprint.rows, state.blueprint.cols)) {
    return { ok: false, reason: '超出棋盘范围' };
  }
  if (!Number.isInteger(colorId) || colorId < 0 || colorId >= PIECE_COLORS.length) {
    return { ok: false, reason: '无效颜色' };
  }
  const required = requiredPlacementsForTurn(state.turnIndex);
  if (state.pendingCoords.length >= required) {
    return { ok: false, reason: '本回合已放满棋子，请确认或撤销' };
  }
  const key = coordKey(coord);
  const blocked = createBlockedSet(state.blueprint);
  if (blocked.has(key)) {
    return { ok: false, reason: '该格为障碍格' };
  }
  if (state.pieces[key]) {
    return { ok: false, reason: '该格已有棋子' };
  }
  const pendingColors = getPendingColorIds(state);
  if (pendingColors.has(colorId)) {
    return { ok: false, reason: '同一回合必须放置不同颜色的棋子' };
  }
  const counts = getColorCounts(state.pieces);
  if ((counts.get(colorId) ?? 0) >= 2) {
    return { ok: false, reason: '该颜色两枚棋子均已在棋盘上' };
  }
  return { ok: true };
}

export function placeTurnPiece(state: GameState, coord: Coord, colorId: number): GameState {
  const check = canPlaceTurnPiece(state, coord, colorId);
  if (!check.ok) {
    return state;
  }
  const key = coordKey(coord);
  return {
    ...state,
    pieces: {
      ...state.pieces,
      [key]: {
        colorId,
        locked: false,
        source: 'turn',
        placedBy: state.currentPlayer,
        turnNumber: state.turnIndex + 1,
      },
    },
    pendingCoords: [...state.pendingCoords, key],
  };
}

export function removePendingPiece(state: GameState, coord: Coord): GameState {
  if (state.phase !== 'playing') {
    return state;
  }
  const key = coordKey(coord);
  if (!state.pendingCoords.includes(key)) {
    return state;
  }
  const nextPieces = { ...state.pieces };
  delete nextPieces[key];
  return {
    ...state,
    pieces: nextPieces,
    pendingCoords: state.pendingCoords.filter((item) => item !== key),
  };
}

export function undoLastPendingPiece(state: GameState): GameState {
  if (state.phase !== 'playing' || state.pendingCoords.length === 0) {
    return state;
  }
  const lastKey = state.pendingCoords[state.pendingCoords.length - 1];
  return removePendingPiece(state, parseCellKey(lastKey));
}

export function clearPendingPieces(state: GameState): GameState {
  if (state.phase !== 'playing' || state.pendingCoords.length === 0) {
    return state;
  }
  const nextPieces = { ...state.pieces };
  for (const key of state.pendingCoords) {
    delete nextPieces[key];
  }
  return {
    ...state,
    pieces: nextPieces,
    pendingCoords: [],
  };
}

export function canConfirmTurn(state: GameState): boolean {
  return (
    state.phase === 'playing' &&
    state.pendingCoords.length === requiredPlacementsForTurn(state.turnIndex)
  );
}

export function confirmTurn(state: GameState): GameState {
  if (!canConfirmTurn(state)) {
    return state;
  }
  const nextPieces: Record<CellKey, Piece> = { ...state.pieces };
  for (const key of state.pendingCoords) {
    const piece = nextPieces[key];
    if (piece) {
      nextPieces[key] = { ...piece, locked: true };
    }
  }
  const mover = state.currentPlayer;
  return {
    ...state,
    pieces: nextPieces,
    pendingCoords: [],
    lastMover: mover,
    currentPlayer: otherPlayer(mover),
    turnIndex: state.turnIndex + 1,
  };
}

export function canDeclareImpossibility(state: GameState): boolean {
  return state.phase === 'playing' && state.lastMover !== null;
}

export function declareImpossibility(state: GameState): GameState {
  if (!canDeclareImpossibility(state) || state.lastMover === null) {
    return state;
  }
  const verifier: PlayerId = state.lastMover;
  const cleaned = clearPendingPieces(state);
  const declarer = cleaned.currentPlayer;
  return {
    ...cleaned,
    phase: 'verifying',
    declarer,
    verifier,
    currentPlayer: verifier,
    paths: {},
  };
}

export function finishRound(
  state: GameState,
  winner: PlayerId,
  reason: RoundEndReason,
): GameState {
  const nextScores: [number, number] = [state.scores[0], state.scores[1]];
  nextScores[winner] += 1;
  const result = {
    roundNumber: state.roundNumber,
    winner,
    reason,
    declarer: state.declarer ?? undefined,
    verifier: state.verifier ?? undefined,
  };
  const matchFinished = nextScores[winner] >= state.config.targetWins;
  return {
    ...state,
    scores: nextScores,
    phase: matchFinished ? 'match_over' : 'round_over',
    lastRoundResult: result,
    history: [...state.history, result],
  };
}

export function handleMoveTimeout(state: GameState): GameState {
  if (state.phase !== 'playing') {
    return state;
  }
  const cleaned = clearPendingPieces(state);
  return finishRound(cleaned, otherPlayer(cleaned.currentPlayer), 'move_timeout');
}

export function handleVerifyResign(state: GameState): GameState {
  if (state.phase !== 'verifying' || state.declarer === null) {
    return state;
  }
  return finishRound(state, state.declarer, 'verify_resign');
}

export function handleVerifyTimeout(state: GameState): GameState {
  if (state.phase !== 'verifying' || state.declarer === null) {
    return state;
  }
  return finishRound(state, state.declarer, 'verify_timeout');
}

export function getPathCellOwnerMap(paths: Record<number, Coord[]>): Map<CellKey, number> {
  const owner = new Map<CellKey, number>();
  for (const [colorKey, coords] of Object.entries(paths)) {
    const colorId = Number(colorKey);
    for (const coord of coords) {
      owner.set(coordKey(coord), colorId);
    }
  }
  return owner;
}

export function getAppearedColorIds(pieces: Record<CellKey, Piece>): number[] {
  const set = new Set<number>();
  for (const piece of Object.values(pieces)) {
    set.add(piece.colorId);
  }
  return Array.from(set).sort((first, second) => first - second);
}

export function getSingletonColorIds(pieces: Record<CellKey, Piece>): number[] {
  const counts = getColorCounts(pieces);
  const singletons: number[] = [];
  for (const [colorId, count] of counts.entries()) {
    if (count === 1) {
      singletons.push(colorId);
    }
  }
  return singletons.sort((first, second) => first - second);
}

export function evaluateVerification(state: GameState): VerificationEvaluation {
  const blocked = createBlockedSet(state.blueprint);
  const coordsByColor = getPieceCoordsByColor(state.pieces);
  const appearedColors = Array.from(coordsByColor.keys()).sort((first, second) => first - second);

  const globalOccupancy = new Map<CellKey, number>();
  let hasOverlap = false;

  for (const colorId of appearedColors) {
    const path = state.paths[colorId] ?? [];
    for (const coord of path) {
      const key = coordKey(coord);
      const existing = globalOccupancy.get(key);
      if (existing !== undefined && existing !== colorId) {
        hasOverlap = true;
      } else {
        globalOccupancy.set(key, colorId);
      }
    }
  }

  const colors: ColorVerificationStatus[] = appearedColors.map((colorId) => {
    const pieceCoords = coordsByColor.get(colorId) ?? [];
    const path = state.paths[colorId] ?? [];
    const needsPair = pieceCoords.length < 2;

    let connected = false;
    if (pieceCoords.length === 2 && path.length >= 2) {
      const startKey = coordKey(path[0]);
      const endKey = coordKey(path[path.length - 1]);
      const p0Key = coordKey(pieceCoords[0]);
      const p1Key = coordKey(pieceCoords[1]);
      const endpointsMatch =
        (startKey === p0Key && endKey === p1Key) ||
        (startKey === p1Key && endKey === p0Key);

      if (endpointsMatch) {
        const seen = new Set<CellKey>();
        let geometricallyValid = true;

        for (let index = 0; index < path.length; index += 1) {
          const current = path[index];
          const currentKey = coordKey(current);

          if (
            !isInBounds(current, state.blueprint.rows, state.blueprint.cols) ||
            blocked.has(currentKey) ||
            seen.has(currentKey)
          ) {
            geometricallyValid = false;
            break;
          }
          seen.add(currentKey);

          if (index > 0 && !isOrthogonallyAdjacent(path[index - 1], current)) {
            geometricallyValid = false;
            break;
          }

          if (index > 0 && index < path.length - 1 && state.pieces[currentKey]) {
            geometricallyValid = false;
            break;
          }
        }

        connected = geometricallyValid;
      }
    }

    const length = path.length;
    const lengthValid = connected && length >= state.config.minPathLength;
    const valid = !needsPair && connected && lengthValid && !hasOverlap;

    return {
      colorId,
      pieceCoords,
      needsPair,
      path,
      connected,
      length,
      lengthValid,
      valid,
    };
  });

  const validColors = colors.filter((item) => item.valid).length;
  const allValid = colors.length > 0 && validColors === colors.length && !hasOverlap;

  return {
    colors,
    totalColors: colors.length,
    validColors,
    allValid,
    hasOverlap,
  };
}

export function checkAutoPassVerification(state: GameState): GameState {
  if (state.phase !== 'verifying' || state.verifier === null) {
    return state;
  }
  const evaluation = evaluateVerification(state);
  if (evaluation.allValid) {
    return finishRound(state, state.verifier, 'verify_success');
  }
  return state;
}

export function canPlaceVerifyPiece(
  state: GameState,
  coord: Coord,
  colorId: number,
): { ok: boolean; reason?: string } {
  if (state.phase !== 'verifying') {
    return { ok: false, reason: '当前不在验证阶段' };
  }
  if (!isInBounds(coord, state.blueprint.rows, state.blueprint.cols)) {
    return { ok: false, reason: '超出棋盘范围' };
  }
  const key = coordKey(coord);
  const blocked = createBlockedSet(state.blueprint);
  if (blocked.has(key)) {
    return { ok: false, reason: '该格为障碍格' };
  }
  if (state.pieces[key]) {
    return { ok: false, reason: '该格已有棋子' };
  }
  const counts = getColorCounts(state.pieces);
  if ((counts.get(colorId) ?? 0) !== 1) {
    return { ok: false, reason: '该颜色不是待补全的单子' };
  }
  const pathOwners = getPathCellOwnerMap(state.paths);
  const owner = pathOwners.get(key);
  if (owner !== undefined && owner !== colorId) {
    return { ok: false, reason: '该格已被其他颜色的连线占用' };
  }
  return { ok: true };
}

export function placeVerifyPiece(state: GameState, coord: Coord, colorId: number): GameState {
  const check = canPlaceVerifyPiece(state, coord, colorId);
  if (!check.ok) {
    return state;
  }
  const key = coordKey(coord);
  const nextPieces: Record<CellKey, Piece> = {
    ...state.pieces,
    [key]: {
      colorId,
      locked: false,
      source: 'verify',
      placedBy: state.verifier ?? undefined,
    },
  };

  const nextPaths = { ...state.paths };
  const existingPath = nextPaths[colorId];
  if (existingPath && existingPath.length > 0) {
    const matchIdx = existingPath.findIndex((cell) => coordKey(cell) === key);
    if (matchIdx >= 1) {
      nextPaths[colorId] = existingPath.slice(0, matchIdx + 1);
    }
  }

  const updated: GameState = {
    ...state,
    pieces: nextPieces,
    paths: nextPaths,
  };
  return checkAutoPassVerification(updated);
}

export function removeVerifyPiece(state: GameState, coord: Coord): GameState {
  if (state.phase !== 'verifying') {
    return state;
  }
  const key = coordKey(coord);
  const piece = state.pieces[key];
  if (!piece || piece.source !== 'verify') {
    return state;
  }
  const colorId = piece.colorId;
  const nextPieces = { ...state.pieces };
  delete nextPieces[key];

  const nextPaths = { ...state.paths };
  const currentPath = nextPaths[colorId];
  if (currentPath && currentPath.length > 0) {
    const firstKey = coordKey(currentPath[0]);
    const lastKey = coordKey(currentPath[currentPath.length - 1]);
    if (firstKey === key) {
      const remainingPieceEntry = Object.entries(nextPieces).find(
        ([, item]) => item.colorId === colorId,
      );
      if (remainingPieceEntry && lastKey === remainingPieceEntry[0]) {
        nextPaths[colorId] = [...currentPath].reverse();
      } else {
        delete nextPaths[colorId];
      }
    }
  }

  return {
    ...state,
    pieces: nextPieces,
    paths: nextPaths,
  };
}

export function resetAllVerifyPieces(state: GameState): GameState {
  if (state.phase !== 'verifying') {
    return state;
  }
  let next = state;
  for (const [key, piece] of Object.entries(state.pieces) as Array<[CellKey, Piece]>) {
    if (piece.source === 'verify') {
      next = removeVerifyPiece(next, parseCellKey(key));
    }
  }
  return next;
}

export function isPathCompleteForColor(state: GameState, colorId: number): boolean {
  const path = state.paths[colorId];
  if (!path || path.length < 2) {
    return false;
  }
  const pieceCoords = getPieceCoordsByColor(state.pieces).get(colorId) ?? [];
  if (pieceCoords.length !== 2) {
    return false;
  }
  const firstKey = coordKey(path[0]);
  const lastKey = coordKey(path[path.length - 1]);
  const p0Key = coordKey(pieceCoords[0]);
  const p1Key = coordKey(pieceCoords[1]);
  return (firstKey === p0Key && lastKey === p1Key) || (firstKey === p1Key && lastKey === p0Key);
}

export function startOrResumePath(
  state: GameState,
  coord: Coord,
): { state: GameState; activeColorId: number | null; shouldRestartOnMove: boolean } {
  if (state.phase !== 'verifying') {
    return { state, activeColorId: null, shouldRestartOnMove: false };
  }
  const key = coordKey(coord);
  const piece = state.pieces[key];

  if (piece) {
    const colorId = piece.colorId;
    const existing = state.paths[colorId];
    if (!existing || existing.length === 0) {
      return {
        state: {
          ...state,
          paths: { ...state.paths, [colorId]: [coord] },
        },
        activeColorId: colorId,
        shouldRestartOnMove: false,
      };
    }
    const lastKey = coordKey(existing[existing.length - 1]);
    if (lastKey === key) {
      return {
        state,
        activeColorId: colorId,
        shouldRestartOnMove: false,
      };
    }
    const firstKey = coordKey(existing[0]);
    if (firstKey === key) {
      return {
        state,
        activeColorId: colorId,
        shouldRestartOnMove: true,
      };
    }
    return {
      state: {
        ...state,
        paths: { ...state.paths, [colorId]: [coord] },
      },
      activeColorId: colorId,
      shouldRestartOnMove: false,
    };
  }

  const pathOwners = getPathCellOwnerMap(state.paths);
  const owner = pathOwners.get(key);
  if (owner !== undefined) {
    const existing = state.paths[owner] ?? [];
    const idx = existing.findIndex((cell) => coordKey(cell) === key);
    if (idx >= 0) {
      return {
        state: {
          ...state,
          paths: { ...state.paths, [owner]: existing.slice(0, idx + 1) },
        },
        activeColorId: owner,
        shouldRestartOnMove: false,
      };
    }
  }

  return { state, activeColorId: null, shouldRestartOnMove: false };
}

function stepSinglePathCell(state: GameState, colorId: number, target: Coord): GameState {
  const path = state.paths[colorId];
  if (!path || path.length === 0) {
    return state;
  }
  if (!isInBounds(target, state.blueprint.rows, state.blueprint.cols)) {
    return state;
  }
  const tip = path[path.length - 1];
  if (tip.row === target.row && tip.col === target.col) {
    return state;
  }
  if (!isOrthogonallyAdjacent(tip, target)) {
    return state;
  }

  const targetKey = coordKey(target);

  const existingIndex = path.findIndex((cell) => coordKey(cell) === targetKey);
  if (existingIndex !== -1) {
    return {
      ...state,
      paths: {
        ...state.paths,
        [colorId]: path.slice(0, existingIndex + 1),
      },
    };
  }

  if (isPathCompleteForColor(state, colorId)) {
    return state;
  }

  const blocked = createBlockedSet(state.blueprint);
  if (blocked.has(targetKey)) {
    return state;
  }

  const pieceAtTarget = state.pieces[targetKey];
  if (pieceAtTarget && pieceAtTarget.colorId !== colorId) {
    return state;
  }

  const pathOwners = getPathCellOwnerMap(state.paths);
  const owner = pathOwners.get(targetKey);
  if (owner !== undefined && owner !== colorId) {
    return state;
  }

  const updated: GameState = {
    ...state,
    paths: {
      ...state.paths,
      [colorId]: [...path, target],
    },
  };
  return checkAutoPassVerification(updated);
}

export function extendPathTo(
  state: GameState,
  colorId: number,
  target: Coord,
  restartFromAnchor?: Coord,
): GameState {
  if (state.phase !== 'verifying') {
    return state;
  }
  let working = state;
  let didRestart = false;
  if (restartFromAnchor) {
    if (restartFromAnchor.row === target.row && restartFromAnchor.col === target.col) {
      return state;
    }
    didRestart = true;
    working = {
      ...state,
      paths: {
        ...state.paths,
        [colorId]: [restartFromAnchor],
      },
    };
  }

  const path = working.paths[colorId];
  if (!path || path.length === 0) {
    return working;
  }
  const tip = path[path.length - 1];
  const dRow = target.row - tip.row;
  const dCol = target.col - tip.col;

  if (Math.abs(dRow) + Math.abs(dCol) === 1) {
    const stepped = stepSinglePathCell(working, colorId, target);
    if (didRestart && stepped === working) {
      return state;
    }
    return stepped;
  }

  if (dRow === 0 && dCol !== 0) {
    let moved = false;
    const step = Math.sign(dCol);
    for (let col = tip.col + step; col !== target.col + step; col += step) {
      const next = stepSinglePathCell(working, colorId, { row: tip.row, col });
      if (next === working) {
        break;
      }
      moved = true;
      working = next;
      if (working.phase !== 'verifying') {
        break;
      }
    }
    return didRestart && !moved ? state : working;
  }

  if (dCol === 0 && dRow !== 0) {
    let moved = false;
    const step = Math.sign(dRow);
    for (let row = tip.row + step; row !== target.row + step; row += step) {
      const next = stepSinglePathCell(working, colorId, { row, col: tip.col });
      if (next === working) {
        break;
      }
      moved = true;
      working = next;
      if (working.phase !== 'verifying') {
        break;
      }
    }
    return didRestart && !moved ? state : working;
  }

  return didRestart ? state : working;
}

export function clearColorPath(state: GameState, colorId: number): GameState {
  if (state.phase !== 'verifying' || !state.paths[colorId]) {
    return state;
  }
  const nextPaths = { ...state.paths };
  delete nextPaths[colorId];
  return {
    ...state,
    paths: nextPaths,
  };
}

export function clearAllPaths(state: GameState): GameState {
  if (state.phase !== 'verifying') {
    return state;
  }
  return {
    ...state,
    paths: {},
  };
}

export function applyVerificationSolution(
  state: GameState,
  paths: GameState['paths'],
  addedPieces: PresetPiece[],
): GameState {
  if (state.phase !== 'verifying' || state.verifier === null) return state;
  let board = clearAllPaths(state);
  for (const { coord, colorId } of addedPieces) {
    const next = placeVerifyPiece(board, coord, colorId);
    if (next === board) return state;
    board = next;
  }

  const verified = checkAutoPassVerification({ ...board, paths });
  return verified.phase === 'verifying' ? state : verified;
}

export function eraseAtCell(state: GameState, coord: Coord): GameState {
  if (state.phase !== 'verifying') {
    return state;
  }
  const key = coordKey(coord);
  const pathOwners = getPathCellOwnerMap(state.paths);
  const owner = pathOwners.get(key);

  if (owner !== undefined) {
    const path = state.paths[owner] ?? [];
    const idx = path.findIndex((cell) => coordKey(cell) === key);
    if (idx <= 1) {
      return clearColorPath(state, owner);
    }
    return {
      ...state,
      paths: {
        ...state.paths,
        [owner]: path.slice(0, idx),
      },
    };
  }

  const piece = state.pieces[key];
  if (piece && piece.source === 'verify') {
    return removeVerifyPiece(state, coord);
  }

  return state;
}

export function getReachableLineCells(state: GameState, colorId: number): Set<CellKey> {
  const reachable = new Set<CellKey>();
  if (state.phase !== 'verifying') {
    return reachable;
  }
  const path = state.paths[colorId];
  if (!path || path.length === 0 || isPathCompleteForColor(state, colorId)) {
    return reachable;
  }
  const tip = path[path.length - 1];
  const blocked = createBlockedSet(state.blueprint);
  const pathOwners = getPathCellOwnerMap(state.paths);
  const selfKeys = new Set(path.map((cell) => coordKey(cell)));

  const directions: Array<[number, number]> = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
  ];

  for (const [dRow, dCol] of directions) {
    let row = tip.row + dRow;
    let col = tip.col + dCol;
    while (isInBounds({ row, col }, state.blueprint.rows, state.blueprint.cols)) {
      const key = cellKey(row, col);
      if (blocked.has(key) || selfKeys.has(key)) {
        break;
      }
      const owner = pathOwners.get(key);
      if (owner !== undefined && owner !== colorId) {
        break;
      }
      const piece = state.pieces[key];
      if (piece) {
        if (piece.colorId === colorId) {
          reachable.add(key);
        }
        break;
      }
      reachable.add(key);
      row += dRow;
      col += dCol;
    }
  }

  return reachable;
}

export function getPreviewSegment(state: GameState, colorId: number, target: Coord): Coord[] {
  if (state.phase !== 'verifying') {
    return [];
  }
  const path = state.paths[colorId];
  if (!path || path.length === 0 || isPathCompleteForColor(state, colorId)) {
    return [];
  }
  const tip = path[path.length - 1];
  const dRow = target.row - tip.row;
  const dCol = target.col - tip.col;
  if ((dRow !== 0 && dCol !== 0) || (dRow === 0 && dCol === 0)) {
    return [];
  }

  const reachable = getReachableLineCells(state, colorId);
  if (!reachable.has(coordKey(target))) {
    return [];
  }

  const segment: Coord[] = [tip];
  const stepRow = Math.sign(dRow);
  const stepCol = Math.sign(dCol);
  let row = tip.row + stepRow;
  let col = tip.col + stepCol;
  while (true) {
    segment.push({ row, col });
    if (row === target.row && col === target.col) {
      break;
    }
    row += stepRow;
    col += stepCol;
  }
  return segment;
}

export function cleanupSingleCellStub(state: GameState, colorId: number): GameState {
  const path = state.paths[colorId];
  if (!path || path.length > 1) {
    return state;
  }
  const nextPaths = { ...state.paths };
  delete nextPaths[colorId];
  return {
    ...state,
    paths: nextPaths,
  };
}
