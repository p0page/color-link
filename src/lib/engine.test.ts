import { describe, expect, it } from 'vitest';
import {
  canConfirmTurn,
  canDeclareImpossibility,
  canPlaceTurnPiece,
  cleanupSingleCellStub,
  confirmTurn,
  createBlueprint,
  createMatchState,
  declareImpossibility,
  DEFAULT_CONFIG,
  eraseAtCell,
  evaluateVerification,
  extendPathTo,
  getPreviewSegment,
  getReachableLineCells,
  handleMoveTimeout,
  handleVerifyResign,
  handleVerifyTimeout,
  placeTurnPiece,
  placeVerifyPiece,
  prepareNextRound,
  removeVerifyPiece,
  startOrResumePath,
  startRoundWithFirstPlayer,
  undoLastPendingPiece,
} from './engine';

describe('Color Link engine', () => {
  it('enforces 1 piece on first turn, then 2 pieces of any 2 different colors', () => {
    let state = createMatchState(DEFAULT_CONFIG);
    expect(state.phase).toBe('select_first');

    state = startRoundWithFirstPlayer(state, 1);
    expect(state.phase).toBe('playing');
    expect(state.currentPlayer).toBe(1);
    expect(canDeclareImpossibility(state)).toBe(false);
    expect(canPlaceTurnPiece(state, { row: 0, col: 0 }, 26).ok).toBe(false);

    // First player places arbitrary letter (e.g. Z = 25)
    state = placeTurnPiece(state, { row: 0, col: 0 }, 25);
    expect(canConfirmTurn(state)).toBe(true);
    // Cannot place a 2nd piece on first turn
    expect(canPlaceTurnPiece(state, { row: 0, col: 1 }, 0).ok).toBe(false);

    state = confirmTurn(state);
    expect(state.currentPlayer).toBe(0);
    expect(state.lastMover).toBe(1);
    expect(canDeclareImpossibility(state)).toBe(true);

    // Second turn: must place 2 different colors
    state = placeTurnPiece(state, { row: 2, col: 2 }, 3); // D
    expect(canConfirmTurn(state)).toBe(false);
    // Same color D forbidden in same turn
    expect(canPlaceTurnPiece(state, { row: 2, col: 3 }, 3).ok).toBe(false);
    // Undo and re-place
    state = undoLastPendingPiece(state);
    expect(state.pendingCoords).toHaveLength(0);

    state = placeTurnPiece(state, { row: 2, col: 2 }, 3); // D
    state = placeTurnPiece(state, { row: 4, col: 4 }, 25); // 2nd Z
    expect(canConfirmTurn(state)).toBe(true);
    state = confirmTurn(state);

    // Color Z now has 2 pieces on board -> cannot place 3rd Z
    expect(canPlaceTurnPiece(state, { row: 5, col: 5 }, 25).ok).toBe(false);
  });

  it('discards unconfirmed pending pieces when declaring impossibility and assigns lastMover as verifier', () => {
    let state = startRoundWithFirstPlayer(createMatchState(DEFAULT_CONFIG), 0);
    state = confirmTurn(placeTurnPiece(state, { row: 0, col: 0 }, 0)); // P0 puts A
    state = placeTurnPiece(state, { row: 1, col: 1 }, 1); // P1 tentatively puts B

    state = declareImpossibility(state);
    expect(state.phase).toBe('verifying');
    expect(state.declarer).toBe(1);
    expect(state.verifier).toBe(0);
    expect(state.currentPlayer).toBe(0);
    // Tentative B must be gone, only A remains
    expect(Object.keys(state.pieces)).toEqual(['0,0']);
  });

  it('supports drawing path BEFORE placing singleton partner, and auto-passes once valid (>= minPathLength)', () => {
    const config = { ...DEFAULT_CONFIG, rows: 6, cols: 6, minPathLength: 6 };
    let state = startRoundWithFirstPlayer(createMatchState(config), 0);
    state = confirmTurn(placeTurnPiece(state, { row: 0, col: 0 }, 0)); // P0 puts single A
    state = declareImpossibility(state); // P1 declares, P0 verifies

    // Draw from single A BEFORE placing 2nd A: (0,0) -> (0,5) = 6 cells
    const start = startOrResumePath(state, { row: 0, col: 0 });
    state = start.state;
    state = extendPathTo(state, 0, { row: 0, col: 5 });
    expect(state.paths[0]).toHaveLength(6);
    // Not passed yet because 2nd A is missing
    expect(state.phase).toBe('verifying');

    // Place 2nd A right on the tip cell (0,5) -> connects and auto-passes!
    state = placeVerifyPiece(state, { row: 0, col: 5 }, 0);
    expect(state.phase).toBe('round_over');
    expect(state.scores).toEqual([1, 0]);
    expect(state.lastRoundResult?.reason).toBe('verify_success');
    expect(state.lastRoundResult?.winner).toBe(0);
  });

  it('enforces minimum path length including endpoints, orthogonal moves only, and no overlap/passing through pieces', () => {
    const config = { ...DEFAULT_CONFIG, rows: 6, cols: 6, minPathLength: 6 };
    let state = startRoundWithFirstPlayer(createMatchState(config), 0);
    state = confirmTurn(placeTurnPiece(state, { row: 0, col: 0 }, 0)); // A1
    state = confirmTurn(
      placeTurnPiece(placeTurnPiece(state, { row: 0, col: 3 }, 0), { row: 1, col: 0 }, 1),
    ); // A2 at (0,3), B1 at (1,0)
    state = declareImpossibility(state); // P0 declares, P1 verifies

    // Connect A directly in 4 cells (< 6): should NOT auto-pass
    state = startOrResumePath(state, { row: 0, col: 0 }).state;
    state = extendPathTo(state, 0, { row: 0, col: 3 });
    let evalRes = evaluateVerification(state);
    const statusA = evalRes.colors.find((item) => item.colorId === 0)!;
    expect(statusA.connected).toBe(true);
    expect(statusA.length).toBe(4);
    expect(statusA.lengthValid).toBe(false);
    expect(state.phase).toBe('verifying');

    // Place B2 at (5,0) and try connecting B through (0,0) - blocked by A's piece & path
    state = placeVerifyPiece(state, { row: 5, col: 0 }, 1);
    state = startOrResumePath(state, { row: 1, col: 0 }).state;
    const beforeOverlap = state;
    state = extendPathTo(state, 1, { row: 0, col: 0 });
    expect(state.paths[1]).toEqual(beforeOverlap.paths[1]);

    // Diagonal move should be ignored
    state = extendPathTo(state, 1, { row: 2, col: 1 });
    expect(state.paths[1]).toHaveLength(1);

    // Connect B validly from (1,0) down to (5,0) = 5 cells (still < 6)
    state = extendPathTo(state, 1, { row: 5, col: 0 });
    expect(state.paths[1]).toHaveLength(5);
    expect(state.phase).toBe('verifying');

    // Reroute B via column 1 to get >= 6 cells: (1,0)->(1,1)->(5,1)->(5,0) = 7 cells
    state = eraseAtCell(state, { row: 2, col: 0 });
    expect(state.paths[1]).toBeUndefined();
    state = startOrResumePath(state, { row: 1, col: 0 }).state;
    state = extendPathTo(state, 1, { row: 1, col: 1 });
    state = extendPathTo(state, 1, { row: 5, col: 1 });
    state = extendPathTo(state, 1, { row: 5, col: 0 });
    expect(state.paths[1]).toHaveLength(7);

    // Reroute A with a detour so length >= 6: (0,0)->(0,1)->(0,2)->(1,2)->(1,3)->(0,3) = 6 cells
    state = eraseAtCell(state, { row: 0, col: 2 });
    state = extendPathTo(state, 0, { row: 0, col: 2 });
    state = extendPathTo(state, 0, { row: 1, col: 2 });
    state = extendPathTo(state, 0, { row: 1, col: 3 });
    state = extendPathTo(state, 0, { row: 0, col: 3 });

    expect(state.phase).toBe('round_over');
    expect(state.scores).toEqual([0, 1]);
    expect(state.lastRoundResult?.winner).toBe(1);
  });

  it('respects blueprint obstacles and preset pieces for future map editor extensibility', () => {
    const blueprint = createBlueprint(
      5,
      5,
      [{ row: 0, col: 1 }],
      [{ coord: { row: 0, col: 0 }, colorId: 2 }],
    );
    const config = { ...DEFAULT_CONFIG, rows: 5, cols: 5, minPathLength: 4 };
    let state = startRoundWithFirstPlayer(createMatchState(config, blueprint), 0);

    expect(canPlaceTurnPiece(state, { row: 0, col: 1 }, 0).ok).toBe(false);
    expect(canPlaceTurnPiece(state, { row: 0, col: 0 }, 0).ok).toBe(false);

    state = confirmTurn(placeTurnPiece(state, { row: 0, col: 2 }, 2));
    state = declareImpossibility(state);

    // Path from (0,0) cannot step onto blocked cell (0,1)
    state = startOrResumePath(state, { row: 0, col: 0 }).state;
    state = extendPathTo(state, 2, { row: 0, col: 1 });
    expect(state.paths[2]).toHaveLength(1);

    // Must go around obstacle: (0,0)->(1,0)->(1,1)->(1,2)->(0,2) = 5 cells >= 4
    state = extendPathTo(state, 2, { row: 1, col: 0 });
    state = extendPathTo(state, 2, { row: 1, col: 2 });
    state = extendPathTo(state, 2, { row: 0, col: 2 });
    expect(state.phase).toBe('round_over');
    expect(state.scores).toEqual([1, 0]);
  });

  it('handles resign, timeout, removing verify piece, and reaching targetWins', () => {
    const config = { ...DEFAULT_CONFIG, targetWins: 2 };
    let state = startRoundWithFirstPlayer(createMatchState(config), 0);
    state = confirmTurn(placeTurnPiece(state, { row: 0, col: 0 }, 0));
    // Move timeout on Player 1 -> Player 0 wins round 1
    state = handleMoveTimeout(state);
    expect(state.phase).toBe('round_over');
    expect(state.scores).toEqual([1, 0]);

    // Round 2: user selects Player 1 first
    state = prepareNextRound(state);
    expect(state.phase).toBe('select_first');
    expect(state.roundNumber).toBe(2);
    state = startRoundWithFirstPlayer(state, 1);
    state = confirmTurn(placeTurnPiece(state, { row: 1, col: 1 }, 4));
    state = declareImpossibility(state); // P0 declares, P1 verifies

    // Place and remove verify piece cleanly
    state = placeVerifyPiece(state, { row: 3, col: 3 }, 4);
    expect(state.pieces['3,3']?.source).toBe('verify');
    state = removeVerifyPiece(state, { row: 3, col: 3 });
    expect(state.pieces['3,3']).toBeUndefined();

    // P1 resigns -> P0 gets 2nd point -> match_over!
    state = handleVerifyResign(state);
    expect(state.phase).toBe('match_over');
    expect(state.scores).toEqual([2, 0]);
    expect(state.lastRoundResult?.reason).toBe('verify_resign');

    // Also check verify timeout awards declarer
    let tState = startRoundWithFirstPlayer(createMatchState(config), 0);
    tState = confirmTurn(placeTurnPiece(tState, { row: 0, col: 0 }, 0));
    tState = declareImpossibility(tState);
    tState = handleVerifyTimeout(tState);
    expect(tState.lastRoundResult?.winner).toBe(1);
    expect(tState.lastRoundResult?.reason).toBe('verify_timeout');
  });

  it('computes orthogonal reachable corridor and polyline preview segments cleanly', () => {
    const config = { ...DEFAULT_CONFIG, rows: 6, cols: 6, minPathLength: 6 };
    let state = startRoundWithFirstPlayer(createMatchState(config), 0);
    state = confirmTurn(placeTurnPiece(state, { row: 0, col: 0 }, 0)); // A1
    state = confirmTurn(
      placeTurnPiece(placeTurnPiece(state, { row: 0, col: 3 }, 1), { row: 3, col: 3 }, 0),
    ); // B1 at (0,3) blocks row 0 past col 2; A2 at (3,3)
    state = declareImpossibility(state);

    state = startOrResumePath(state, { row: 0, col: 0 }).state;
    const reachable = getReachableLineCells(state, 0);
    expect(reachable.has('0,1')).toBe(true);
    expect(reachable.has('0,2')).toBe(true);
    // Blocked by B1 at (0,3)
    expect(reachable.has('0,3')).toBe(false);
    expect(reachable.has('0,4')).toBe(false);
    // Column 0 unobstructed
    expect(reachable.has('3,0')).toBe(true);

    const preview = getPreviewSegment(state, 0, { row: 3, col: 0 });
    expect(preview).toEqual([
      { row: 0, col: 0 },
      { row: 1, col: 0 },
      { row: 2, col: 0 },
      { row: 3, col: 0 },
    ]);

    // Canceling a 1-cell stub cleans up the path entry
    const cleaned = cleanupSingleCellStub(state, 0);
    expect(cleaned.paths[0]).toBeUndefined();
  });
});
