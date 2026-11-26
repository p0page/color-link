import { describe, expect, it } from 'vitest';
import {
  applyVerificationSolution, confirmTurn, createMatchState, declareImpossibility, DEFAULT_CONFIG,
  placeTurnPiece, prepareNextRound, startRoundWithFirstPlayer,
} from './engine';
import { PRESET_BOARDS } from './preset-boards';
import {
  boardHasRoom, boardLayoutKey, createBoardLibrary, drawRoundBoards, generateRandomBoard, SHOW_BOARD_IDS,
} from './round-boards';

describe('round boards', () => {
  it('matches the exact four original show boards and default 5-round schedule', () => {
    expect(SHOW_BOARD_IDS).toEqual([
      'preset:classic-r1',
      'preset:classic-r2',
      'preset:classic-r3',
      'built-in:10:0',
      'preset:classic-r5',
    ]);

    const byId = new Map(PRESET_BOARDS.map(({ board }) => [board.id, board.blueprint]));
    expect(byId.get('preset:classic-r1')).toMatchObject({
      rows: 9,
      cols: 9,
      blockedCells: [],
      presetPieces: [
        { coord: { row: 1, col: 1 }, colorId: 23 },
        { coord: { row: 6, col: 2 }, colorId: 23 },
        { coord: { row: 3, col: 1 }, colorId: 24 },
        { coord: { row: 1, col: 6 }, colorId: 24 },
      ],
    });
    expect(byId.get('preset:classic-r2')).toMatchObject({
      rows: 11,
      cols: 11,
      presetPieces: [],
    });
    expect(byId.get('preset:classic-r2')?.blockedCells).toHaveLength(47);
    expect(byId.get('preset:classic-r3')).toMatchObject({
      rows: 11,
      cols: 11,
      presetPieces: [
        { coord: { row: 10, col: 0 }, colorId: 23 },
        { coord: { row: 0, col: 10 }, colorId: 23 },
      ],
    });
    expect(byId.get('preset:classic-r3')?.blockedCells).toHaveLength(60);
    expect(byId.get('preset:classic-r5')).toMatchObject({
      rows: 11,
      cols: 9,
      blockedCells: [
        { row: 5, col: 1 }, { row: 5, col: 2 }, { row: 5, col: 3 },
        { row: 5, col: 5 }, { row: 5, col: 6 }, { row: 5, col: 7 },
      ],
      presetPieces: [
        { coord: { row: 1, col: 2 }, colorId: 23 },
        { coord: { row: 9, col: 7 }, colorId: 23 },
        { coord: { row: 2, col: 6 }, colorId: 24 },
        { coord: { row: 8, col: 1 }, colorId: 24 },
      ],
    });
    expect(byId.has('preset:linked-loops')).toBe(true);
  });

  for (const { board, paths } of PRESET_BOARDS) {
    it(`can open and verify ${board.name} using its constructed routes`, () => {
      const minimum = board.supportedMinPathLength;
      const state = createMatchState({ ...DEFAULT_CONFIG, minPathLength: minimum }, board.blueprint);
      const { colorId, path } = paths[paths.length - 1];
      const hasPreset = board.blueprint.presetPieces.some((piece) => piece.colorId === colorId);
      const end = path[path.length - 1];
      const firstMove = hasPreset ? end : path[0];
      const played = placeTurnPiece(startRoundWithFirstPlayer(state, 0), firstMove, colorId);
      const verifying = declareImpossibility(confirmTurn(played));
      const remainingPieces = hasPreset ? [] : [{ coord: end, colorId }];
      const lines = Object.fromEntries(paths.map((route) => [route.colorId, route.path]));
      const result = applyVerificationSolution(verifying, lines, remainingPieces);
      expect(result.lastRoundResult?.reason).toBe('verify_success');
      expect(createBoardLibrary()).toContain(board);
      expect(boardHasRoom(board, minimum)).toBe(true);
      expect(boardHasRoom(board, minimum + 1)).toBe(false);
    });
  }

  it('generates varied solvable layouts on the requested rectangle', () => {
    let seed = 23;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    const layouts = new Set<string>();
    const pieceCounts = new Set<number>();
    for (const [rows, cols, minimum] of [[4, 4, 2], [8, 12, 6], [10, 10, 30], [12, 12, 100], [20, 20, 400]]) {
      for (let sample = 0; sample < 100; sample += 1) {
        const { blueprint, routes, supportedMinPathLength } = generateRandomBoard(rows, cols, minimum, random);
        expect(blueprint).toMatchObject({ rows, cols });
        expect(supportedMinPathLength).toBeGreaterThanOrEqual(minimum);
        const opening = startRoundWithFirstPlayer(createMatchState({ ...DEFAULT_CONFIG, minPathLength: minimum }, blueprint), 0);
        const { colorId, path } = routes[routes.length - 1];
        const played = placeTurnPiece(opening, path[0], colorId);
        const verifying = declareImpossibility(confirmTurn(played));
        const paths = Object.fromEntries(routes.map((route) => [route.colorId, route.path]));
        const solved = applyVerificationSolution(verifying, paths, [{ coord: path[path.length - 1], colorId }]);
        expect(solved.lastRoundResult?.reason).toBe('verify_success');
        if (rows === 8) {
          layouts.add(boardLayoutKey(blueprint));
          pieceCounts.add(blueprint.presetPieces.length);
        }
      }
    }
    expect(layouts.size).toBeGreaterThan(80);
    expect(pieceCounts.size).toBeGreaterThan(1);
  });

  it('draws saved and built-in maps without repeats until the pool is exhausted', () => {
    const library = createBoardLibrary();
    const builtIn = library[0];
    const custom = { ...library[1], id: 'user-board', name: '自定义地图' };
    const pool = [builtIn, custom];
    const draws = drawRoundBoards(pool, [builtIn, custom, undefined, undefined, undefined], () => 0);
    expect(draws.slice(0, 2)).toEqual([custom, builtIn]);
    expect(new Set(draws.slice(2, 4))).toEqual(new Set(pool));
    expect(draws).toHaveLength(5);
    expect(drawRoundBoards([], [builtIn])).toEqual([]);
  });

  it('loads the scheduled dimensions, blocked cells and presets without losing the score', () => {
    const state = createMatchState();
    const { blueprint } = generateRandomBoard(8, 8, 6);
    const next = prepareNextRound({ ...state, phase: 'round_over', scores: [1, 0] }, blueprint);
    expect(next.roundNumber).toBe(2);
    expect(next.scores).toEqual([1, 0]);
    expect(next.config).toMatchObject({ rows: 8, cols: 8 });
    expect(next.blueprint).toBe(blueprint);
    expect(Object.values(next.pieces)).toEqual(blueprint.presetPieces.map(({ colorId }) => ({
      colorId, locked: true, source: 'preset',
    })));
  });
});
