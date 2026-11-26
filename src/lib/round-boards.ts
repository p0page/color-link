import type { BoardBlueprint, Coord, MatchBoard } from './types';
import { PRESET_BOARDS } from './preset-boards';
import { PIECE_COLORS } from './colors';
import { CREATIVE_PRESETS } from './creative-presets';

export const SHOW_BOARD_IDS = [
  'preset:classic-r1',
  'preset:classic-r2',
  'preset:classic-r3',
  'built-in:10:0',
  'preset:classic-r5',
];

export function boardOptionLabel({ name, blueprint }: MatchBoard) {
  return `${name} (${blueprint.rows}×${blueprint.cols})`;
}


function randomIndex(length: number, random: () => number) {
  return Math.floor(random() * length);
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const other = randomIndex(index + 1, random);
    [shuffled[index], shuffled[other]] = [shuffled[other], shuffled[index]];
  }
  return shuffled;
}

function randomWalk(rows: number, cols: number, random: () => number) {
  const area = rows * cols;
  let walk = Array.from({ length: area }, (_, index) => {
    const row = Math.floor(index / cols);
    const offset = index % cols;
    return row * cols + (row % 2 === 0 ? offset : cols - 1 - offset);
  });
  for (let step = 0; step < area * 2; step += 1) {
    if (random() < 0.5) walk.reverse();
    const head = walk[0];
    const neighbors = [head - cols, head + cols];
    if (head % cols > 0) neighbors.push(head - 1);
    if (head % cols < cols - 1) neighbors.push(head + 1);
    const join = walk.indexOf(neighbors[randomIndex(neighbors.length, random)]);
    if (join > 1) walk = walk.slice(0, join).reverse().concat(walk.slice(join));
  }
  return walk;
}

export function generateRandomBoard(rows: number, cols: number, minimum: number, random = Math.random) {
  const area = rows * cols;
  if (minimum < 2 || minimum > area) throw new RangeError('Path length does not fit this board');

  const walk = randomWalk(rows, cols, random);
  const spare = area - minimum;
  const maxPresetPairs = Math.min(4, Math.floor(Math.max(0, spare - Math.ceil(area / 3)) / minimum));
  const presetPairs = randomIndex(maxPresetPairs + 1, random);
  const obstacleLimit = Math.min(Math.floor(area * 0.4), Math.floor((spare - presetPairs * minimum) * 0.65));
  const obstacleCount = randomIndex(obstacleLimit + 1, random);
  const maxExtra = Math.min(8, Math.floor((spare - presetPairs * minimum - obstacleCount) / (presetPairs + 1)));
  const lengths = Array.from({ length: presetPairs + 1 }, () => minimum + randomIndex(maxExtra + 1, random));
  const reservedLength = lengths.reduce((sum, length) => sum + length, 0);
  let cursor = randomIndex(area - reservedLength + 1, random);
  const unused = walk.slice(0, cursor).concat(walk.slice(cursor + reservedLength));
  const toCoord = (index: number): Coord => ({ row: Math.floor(index / cols), col: index % cols });
  const colors = shuffle(PIECE_COLORS.map(({ id }) => id), random);
  const routes = lengths.map((length, index) => {
    const path = walk.slice(cursor, cursor + length).map(toCoord);
    cursor += length;
    return { colorId: colors[index], path };
  });
  const blueprint: BoardBlueprint = {
    rows,
    cols,
    blockedCells: shuffle(unused, random).slice(0, obstacleCount).map(toCoord),
    presetPieces: routes.slice(0, presetPairs).flatMap(({ colorId, path }) => [
      { coord: path[0], colorId },
      { coord: path[path.length - 1], colorId },
    ]),
  };

  return { blueprint, routes, supportedMinPathLength: Math.min(...lengths) };
}

export function blankBoard(size: number): MatchBoard {
  return {
    id: `built-in:${size}:0`,
    name: '空白棋盘',
    blueprint: { rows: size, cols: size, blockedCells: [], presetPieces: [] },
  };
}

export function createBoardLibrary(): MatchBoard[] {
  const blanks = [8, 10, 12].map(blankBoard);
  return [...PRESET_BOARDS.map(({ board }) => board), ...CREATIVE_PRESETS, ...blanks];
}

export function boardHasRoom(board: MatchBoard, minimum: number) {
  const { rows, cols, blockedCells } = board.blueprint;
  return rows * cols - blockedCells.length >= minimum
    && (board.supportedMinPathLength ?? Infinity) >= minimum;
}

export function boardLayoutKey({ rows, cols, blockedCells, presetPieces }: BoardBlueprint): string {
  return JSON.stringify([
    rows, cols,
    blockedCells.map(({ row, col }) => row * cols + col).sort(),
    presetPieces.map(({ coord, colorId }) => `${coord.row * cols + coord.col}:${colorId}`).sort(),
  ]);
}

export function drawRoundBoards(pool: MatchBoard[], previous: (MatchBoard | undefined)[], random = Math.random) {
  if (pool.length === 0) return [];
  let available: MatchBoard[] = [];
  return previous.map((board) => {
    if (available.length === 0) available = shuffle(pool, random);
    const different = available.findIndex(({ id }) => id !== board?.id);
    return available.splice(Math.max(0, different), 1)[0];
  });
}
