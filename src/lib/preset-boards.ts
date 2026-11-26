import type { BoardBlueprint, Coord, MatchBoard } from './types';

type GridPoint = readonly [row: number, col: number];

const PIECE_A = 0;
const PIECE_X = 23;
const PIECE_Y = 24;

interface Route {
  colorId: number;
  reveal: 0 | 1 | 2;
  corners: GridPoint[];
}

function trace([start, ...turns]: GridPoint[]): Coord[] {
  let [row, col] = start;
  const path = [{ row, col }];
  for (const [nextRow, nextCol] of turns) {
    const rowStep = Math.sign(nextRow - row);
    const colStep = Math.sign(nextCol - col);
    if (rowStep && colStep) throw new Error('Preset route segments must be orthogonal');
    while (row !== nextRow || col !== nextCol) {
      row += rowStep;
      col += colStep;
      path.push({ row, col });
    }
  }
  return path;
}

function definePreset(id: string, name: string, grid: string[], routes: Route[], original = false) {
  const rows = grid.length;
  const cols = grid[0].length;
  const paths = routes.map(({ colorId, corners }) => ({ colorId, path: trace(corners) }));
  const blueprint: BoardBlueprint = {
    rows,
    cols,
    blockedCells: grid.flatMap((line, row) =>
      Array.from(line).flatMap((cell, col) => cell === '#' ? [{ row, col }] : [])),
    presetPieces: routes.flatMap(({ colorId, reveal }, index) => {
      const path = paths[index].path;
      return [path[0], path[path.length - 1]].slice(0, reveal).map((coord) => ({ coord, colorId }));
    }),
  };
  const board = {
    id: `preset:${id}`,
    name,
    blueprint,
    original,
    supportedMinPathLength: Math.min(...paths.map(({ path }) => path.length)),
  } satisfies MatchBoard;
  return { board, paths };
}

export const PRESET_BOARDS = [
  definePreset('classic-r1', '双子开局', Array(9).fill('.........'), [
    { colorId: PIECE_X, reveal: 2, corners: [[1, 1], [0, 1], [0, 0], [8, 0], [8, 2], [6, 2]] },
    { colorId: PIECE_Y, reveal: 2, corners: [[3, 1], [5, 1], [5, 7], [1, 7], [1, 6]] },
    { colorId: PIECE_A, reveal: 0, corners: [[0, 2], [0, 8], [8, 8], [8, 7]] },
  ], true),
  definePreset('classic-r2', '三重回环', [
    '...........',
    '.#########.',
    '.#.......#.',
    '.#.##.##.#.',
    '.#.#...#.#.',
    '.#.#.#.#.#.',
    '.#.#...#.#.',
    '.#.#####.#.',
    '.#.......#.',
    '.####.####.',
    '...........',
  ], [
    {
      colorId: PIECE_A,
      reveal: 0,
      corners: [
        [10, 4], [10, 0], [0, 0], [0, 10], [10, 10], [10, 5],
        [8, 5], [8, 8], [2, 8], [2, 5],
        [4, 5], [4, 6], [6, 6], [6, 4], [4, 4],
      ],
    },
  ], true),
  definePreset('classic-r3', '折角箭头', [
    '####.......',
    '#####......',
    '######.....',
    '#####......',
    '####.......',
    '###.....#..',
    '##.....###.',
    '#.....#####',
    '.....######',
    '....#######',
    '...########',
  ], [
    {
      colorId: PIECE_X,
      reveal: 2,
      corners: [
        [10, 0], [8, 0], [8, 1], [7, 1], [7, 2], [6, 2], [6, 3], [5, 3], [5, 4],
        [4, 4], [4, 5], [3, 5], [3, 6], [1, 6], [1, 5], [0, 5], [0, 10],
      ],
    },
    {
      colorId: PIECE_A,
      reveal: 0,
      corners: [
        [10, 2], [9, 2], [9, 3], [8, 3], [8, 4], [7, 4], [7, 5],
        [6, 5], [6, 6], [5, 6], [5, 7], [4, 7], [4, 9], [5, 9], [5, 10], [1, 10],
      ],
    },
  ], true),
  definePreset('classic-r5', '三门隔断', [
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
    '.###.###.',
    '.........',
    '.........',
    '.........',
    '.........',
    '.........',
  ], [
    { colorId: PIECE_X, reveal: 2, corners: [[1, 2], [1, 4], [9, 4], [9, 7]] },
    { colorId: PIECE_Y, reveal: 2, corners: [[2, 6], [0, 6], [0, 0], [8, 0], [8, 1]] },
    { colorId: PIECE_A, reveal: 0, corners: [[0, 8], [10, 8], [10, 5]] },
  ], true),
  definePreset('linked-loops', '双环回廊', [
    '#######.....',
    '.....##.###.',
    '.###.##.###.',
    '.###....###.',
    '.###.##.###.',
    '.###.##.....',
    '.....#######',
    '##.#########',
  ], [
    { colorId: PIECE_A, reveal: 0, corners: [[4, 4], [6, 4], [6, 0], [1, 0], [1, 4], [3, 4], [3, 7], [0, 7], [0, 11], [5, 11], [5, 7], [4, 7]] },
  ]),
];
