import { describe, expect, it } from 'vitest';
import {
  applyVerificationSolution, confirmTurn, createMatchState, declareImpossibility, DEFAULT_CONFIG,
  evaluateVerification, placeTurnPiece, prepareNextRound, startRoundWithFirstPlayer,
} from './engine';
import { PRESET_BOARDS } from './preset-boards';
import {
  boardAlternatives, CREATIVE_ARCHETYPES, createBoardLibrary, DEFAULT_BOARD_PLAN, generateBoard,
  generateCreativeBoard, planRoundBoards, randomBoardPool, type CreativeArchetype,
} from './round-boards';

describe('round boards', () => {
  it('matches the exact four original show boards and default 5-round schedule', () => {
    expect(DEFAULT_BOARD_PLAN.mode).toBe('per-round');
    expect(DEFAULT_BOARD_PLAN.selections).toEqual([
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
      expect(randomBoardPool(createBoardLibrary(minimum), [], minimum)).toContain(board);
      expect(randomBoardPool(createBoardLibrary(minimum + 1), [], minimum + 1)).not.toContain(board);
    });
  }

  for (const archetype of Object.keys(CREATIVE_ARCHETYPES) as CreativeArchetype[]) {
    it(`constructs solvable ${archetype} creative boards across random seeds`, () => {
      let seed = 101 + archetype.length * 17;
      const random = () => {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        return seed / 2 ** 32;
      };
      for (let sample = 0; sample < 15; sample += 1) {
        const { blueprint, routes, supportedMinPathLength } = generateCreativeBoard(archetype, 6, random);
        expect(supportedMinPathLength).toBeGreaterThanOrEqual(6);
        const state = createMatchState(
          { ...DEFAULT_CONFIG, minPathLength: supportedMinPathLength },
          blueprint,
        );
        const openingRoute = routes[routes.length - 1];
        expect(openingRoute.reveal).toBe(0);
        const played = placeTurnPiece(
          startRoundWithFirstPlayer(state, 0),
          openingRoute.path[0],
          openingRoute.colorId,
        );
        const verifying = declareImpossibility(confirmTurn(played));
        const remainingPieces = [{
          coord: openingRoute.path[openingRoute.path.length - 1],
          colorId: openingRoute.colorId,
        }];
        const lines = Object.fromEntries(routes.map((route) => [route.colorId, route.path]));
        const result = applyVerificationSolution(verifying, lines, remainingPieces);
        expect(result.lastRoundResult?.reason).toBe('verify_success');
      }
    });
  }

  it('constructs valid, disjoint witnesses before placing obstacles and pairs', () => {
    let seed = 23;
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (const [size, minimum] of [[8, 2], [8, 6], [10, 30], [12, 100], [20, 400]]) {
      for (let sample = 0; sample < 12; sample += 1) {
        const { blueprint, paths } = generateBoard(size, minimum, 8, 2, random);
        const state = createMatchState({ ...DEFAULT_CONFIG, minPathLength: minimum }, blueprint);
        const opening = startRoundWithFirstPlayer(state, 0);
        const singleton = paths.length - 1;
        const route = paths[singleton];
        const played = placeTurnPiece(opening, route[route.length - 1], singleton);
        expect(played.pendingCoords).toHaveLength(1);
        expect(evaluateVerification({ ...played, paths: { ...paths } }).allValid).toBe(true);
      }
    }
  });

  it('reserves explicit selections and swaps to an unused board when possible', () => {
    const pool = randomBoardPool(createBoardLibrary(6), [], 6);
    const selection = pool[0];
    const schedule = planRoundBoards(5, [undefined, selection], pool);
    expect(schedule[1]).toBe(selection);
    expect(new Set(schedule.map(({ id }) => id)).size).toBe(5);
    expect(boardAlternatives(schedule[0], schedule, pool).every((board) => !schedule.includes(board))).toBe(true);
  });

  it('includes only compatible blank custom boards in random draws', () => {
    const blank = { id: 'blank', name: 'blank', blueprint: { rows: 6, cols: 6, blockedCells: [], presetPieces: [] } };
    const blocked = { ...blank, id: 'blocked', blueprint: { ...blank.blueprint, blockedCells: [{ row: 0, col: 0 }] } };
    const library = createBoardLibrary(6);
    expect(randomBoardPool(library, [blank, blocked], 6)).toContain(blank);
    expect(randomBoardPool(library, [blank, blocked], 6)).not.toContain(blocked);
    expect(randomBoardPool(library, [blank], 37)).not.toContain(blank);
    expect(planRoundBoards(5, [], randomBoardPool(createBoardLibrary(400), [], 400))).toHaveLength(5);
  });

  it('loads the scheduled dimensions, blocked cells and presets without losing the score', () => {
    const state = createMatchState();
    const { blueprint } = generateBoard(8, 6, 6, 2);
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
