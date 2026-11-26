import { Cadical } from 'cadical-wasm';
import { describe, expect, it } from 'vitest';
import {
  applyVerificationSolution,
  confirmTurn,
  createBlueprint,
  createMatchState,
  declareImpossibility,
  DEFAULT_CONFIG,
  evaluateVerification,
  extendPathTo,
  placeTurnPiece,
  startOrResumePath,
  startRoundWithFirstPlayer,
} from './engine';
import { solveBoard, type SolveBoardRequest } from './solver';

const detour: SolveBoardRequest = {
  rows: 4,
  cols: 5,
  minPathLength: 6,
  blockedCells: [{ row: 0, col: 4 }, { row: 1, col: 4 }],
  groups: [
    [0, [{ row: 0, col: 0 }, { row: 0, col: 3 }]],
    [25, [{ row: 2, col: 4 }]],
  ],
};

async function solve(request: SolveBoardRequest, maxMilliseconds?: number) {
  const solver = await Cadical.create({ phase: false });
  try {
    return solveBoard(request, solver, maxMilliseconds);
  } finally {
    solver.dispose();
  }
}

describe('board solver', () => {
  it('replaces existing lines, fills a missing partner, and passes normal verification', async () => {
    const result = await solve(detour);
    expect(result.status).toBe('solved');
    if (result.status !== 'solved') throw new Error('Expected a solution');
    expect(result.solution.addedPieces.map(({ colorId }) => colorId)).toEqual([25]);

    const [pair, singleton] = detour.groups;
    const blueprint = createBlueprint(detour.rows, detour.cols, detour.blockedCells,
      pair[1].map((coord) => ({ colorId: pair[0], coord })),
    );
    const config = { ...DEFAULT_CONFIG, minPathLength: detour.minPathLength, targetWins: 1 };
    let game = startRoundWithFirstPlayer(createMatchState(config, blueprint), 0);
    game = confirmTurn(placeTurnPiece(game, singleton[1][0], singleton[0]));
    game = declareImpossibility(game);
    game = startOrResumePath(game, pair[1][0]).state;
    game = extendPathTo(game, pair[0], pair[1][1]);

    const { addedPieces, paths } = result.solution;
    expect(applyVerificationSolution(game, game.paths, addedPieces)).toBe(game);

    const verified = applyVerificationSolution(game, paths, addedPieces);
    expect(verified.paths).toEqual(paths);
    expect(evaluateVerification(verified).allValid).toBe(true);
    expect(verified.phase).toBe('match_over');
    expect(verified.scores).toEqual([1, 0]);
    expect(verified.lastRoundResult).toMatchObject({ winner: 0, reason: 'verify_success' });
    expect(Object.values(verified.pieces)).toContainEqual(
      expect.objectContaining({ colorId: 25, source: 'verify', placedBy: 0 }),
    );
    expect(applyVerificationSolution(verified, paths, addedPieces)).toBe(verified);
  });

  it('proves impossibility when every route for one pair crosses the other', async () => {
    const result = await solve({
      rows: 3,
      cols: 3,
      minPathLength: 2,
      blockedCells: [],
      groups: [
        [0, [{ row: 1, col: 0 }, { row: 1, col: 2 }]],
        [1, [{ row: 0, col: 1 }, { row: 2, col: 1 }]],
      ],
    });
    expect(result).toEqual({ status: 'impossible' });
  });

  it('accounts for the parity of orthogonal routes when enforcing minimum length', async () => {
    expect(await solve({
      rows: 2,
      cols: 2,
      minPathLength: 4,
      blockedCells: [],
      groups: [[0, [{ row: 0, col: 0 }, { row: 1, col: 1 }]]],
    })).toEqual({ status: 'impossible' });
  });

  it('cannot meet the minimum length using cells disconnected from the endpoints', async () => {
    expect(await solve({
      rows: 2,
      cols: 4,
      minPathLength: 4,
      blockedCells: [{ row: 0, col: 1 }, { row: 1, col: 1 }],
      groups: [[0, [{ row: 0, col: 0 }, { row: 1, col: 0 }]]],
    })).toEqual({ status: 'impossible' });
  });

  it('allows a fixed pair to keep extending after meeting the minimum', async () => {
    const result = await solve({
      rows: 1,
      cols: 8,
      minPathLength: 6,
      blockedCells: [],
      groups: [[0, [{ row: 0, col: 0 }, { row: 0, col: 7 }]]],
    });
    expect(result.status).toBe('solved');
    if (result.status === 'solved') expect(result.solution.paths[0]).toHaveLength(8);
  });

  it('distinguishes search limits from a proof of impossibility', async () => {
    expect(await solve(detour, 0)).toEqual({ status: 'inconclusive' });
  });
});
