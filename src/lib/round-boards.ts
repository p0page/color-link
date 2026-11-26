import type { BoardBlueprint, Coord, MatchBoard } from './types';
import { PRESET_BOARDS } from './preset-boards';
import { PIECE_COLORS } from './colors';

export type BoardMode = 'random' | 'per-round' | 'same';

export interface BoardPlan {
  mode: BoardMode;
  selections: string[];
  includeCustom: boolean;
}

export const DEFAULT_BOARD_PLAN: BoardPlan = {
  mode: 'per-round',
  selections: [
    'preset:classic-r1',
    'preset:classic-r2',
    'preset:classic-r3',
    'built-in:10:0',
    'preset:classic-r5',
  ],
  includeCustom: false,
};

export const CURRENT_BOARD_ID = 'current';

export function boardOptionLabel({ name, blueprint }: MatchBoard) {
  return `${name} (${blueprint.rows}×${blueprint.cols})`;
}

export const CREATIVE_ARCHETYPES = {
  quadrants: '四象限迷城',
  hourglass: '沙漏峡谷',
  spiral: '螺旋回廊',
  baffles: '错位迷闸',
  cross: '十字星台',
  island: '护城环岛',
  steps: '阶梯斜廊',
  twinHalls: '双厅连桥',
} as const;

export type CreativeArchetype = keyof typeof CREATIVE_ARCHETYPES;

type GridPoint = readonly [row: number, col: number];

export interface WitnessRoute {
  colorId: number;
  reveal: 0 | 1 | 2;
  path: Coord[];
}

export interface GeneratedCreativeBoard {
  blueprint: BoardBlueprint;
  routes: WitnessRoute[];
  supportedMinPathLength: number;
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

function traceOrtho(points: readonly GridPoint[]): Coord[] {
  const [start, ...turns] = points;
  let [row, col] = start;
  const path: Coord[] = [{ row, col }];
  for (const [nextRow, nextCol] of turns) {
    if (nextRow === row && nextCol === col) continue;
    const rowStep = Math.sign(nextRow - row);
    const colStep = Math.sign(nextCol - col);
    if (rowStep && colStep) throw new Error('Constructive route segments must be orthogonal');
    while (row !== nextRow || col !== nextCol) {
      row += rowStep;
      col += colStep;
      path.push({ row, col });
    }
  }
  return path;
}

function traceStaircase(startRow: number, startCol: number, steps: number, firstAxis: 'row' | 'col'): Coord[] {
  let row = startRow;
  let col = startCol;
  const path: Coord[] = [{ row, col }];
  for (let step = 0; step < steps; step += 1) {
    if (firstAxis === 'col') {
      col += 1;
      path.push({ row, col });
      row -= 1;
      path.push({ row, col });
    } else {
      row -= 1;
      path.push({ row, col });
      col += 1;
      path.push({ row, col });
    }
  }
  return path;
}

function trimRouteEnds(path: Coord[], minimum: number, random: () => number): Coord[] {
  const slack = path.length - minimum;
  if (slack <= 2) return path;
  const maxTrim = Math.min(3, Math.floor(slack / 2));
  const head = randomIndex(maxTrim + 1, random);
  const tail = randomIndex(Math.min(maxTrim, slack - head) + 1, random);
  return path.slice(head, path.length - tail);
}

function splitWalkIntoRoutes(
  walk: Coord[],
  minimum: number,
  maxRoutes: number,
  random: () => number,
): Coord[][] {
  const count = Math.max(1, Math.min(maxRoutes, Math.floor(walk.length / minimum)));
  if (count === 1) return [walk];
  const baseLen = Math.floor(walk.length / count);
  const extra = walk.length - baseLen * count;
  const routes: Coord[][] = [];
  let cursor = 0;
  for (let index = 0; index < count; index += 1) {
    const length = baseLen + (index < extra ? 1 : 0);
    routes.push(walk.slice(cursor, cursor + length));
    cursor += length;
  }
  return routes;
}

function pickDistinctColors(count: number, random: () => number): number[] {
  const palette = Array.from({ length: PIECE_COLORS.length }, (_, index) => index);
  return shuffle(palette, random).slice(0, count);
}

function buildCreativeLayout(
  rows: number,
  cols: number,
  isBlocked: (row: number, col: number) => boolean,
  rawPaths: Coord[][],
  revealCount: number,
  minimum: number,
  random: () => number,
): GeneratedCreativeBoard {
  const transpose = random() < 0.5;
  const flipRows = random() < 0.5;
  const flipCols = random() < 0.5;

  function orient({ row, col }: Coord): Coord {
    const nextRow = flipRows ? rows - 1 - row : row;
    const nextCol = flipCols ? cols - 1 - col : col;
    return transpose ? { row: nextCol, col: nextRow } : { row: nextRow, col: nextCol };
  }

  const orderedPaths = shuffle(rawPaths, random);
  const actualReveals = Math.min(revealCount, Math.max(0, orderedPaths.length - 1));
  const colors = pickDistinctColors(orderedPaths.length, random);
  const routes: WitnessRoute[] = orderedPaths.map((path, index) => {
    const reveal: 0 | 2 = index < actualReveals ? 2 : 0;
    const sculpted = reveal === 2 ? trimRouteEnds(path, minimum, random) : path;
    return {
      colorId: colors[index],
      reveal,
      path: sculpted.map(orient),
    };
  });

  const blockedCells: Coord[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      if (isBlocked(row, col)) blockedCells.push(orient({ row, col }));
    }
  }

  const presetPieces = routes.flatMap(({ colorId, reveal, path }) =>
    reveal === 2
      ? [{ coord: path[0], colorId }, { coord: path[path.length - 1], colorId }]
      : []);

  return {
    blueprint: {
      rows: transpose ? cols : rows,
      cols: transpose ? rows : cols,
      blockedCells,
      presetPieces,
    },
    routes,
    supportedMinPathLength: Math.min(...routes.map(({ path }) => path.length)),
  };
}

export function generateCreativeBoard(
  archetype: CreativeArchetype,
  minimum: number,
  random = Math.random,
): GeneratedCreativeBoard {
  switch (archetype) {
    case 'quadrants': {
      const topHeight = 4 + randomIndex(2, random);
      const bottomHeight = 4 + randomIndex(2, random);
      const leftWidth = 4 + randomIndex(2, random);
      const rightWidth = 4 + randomIndex(2, random);
      const rows = topHeight + 1 + bottomHeight;
      const cols = leftWidth + 1 + rightWidth;
      const topDoorRow = randomIndex(2, random);
      const bottomDoorRow = rows - 1 - randomIndex(2, random);
      const leftDoorCol = randomIndex(2, random);
      const rightDoorCol = cols - 1 - randomIndex(2, random);

      const cycle = traceOrtho([
        [topHeight - 1, leftDoorCol],
        [topDoorRow, leftDoorCol],
        [topDoorRow, rightDoorCol],
        [bottomDoorRow, rightDoorCol],
        [bottomDoorRow, leftDoorCol],
        [topHeight, leftDoorCol],
      ]);
      const shift = randomIndex(cycle.length, random);
      const rotated = cycle.slice(shift).concat(cycle.slice(0, shift));
      const routes = splitWalkIntoRoutes(rotated, minimum, 3, random);
      const reveals = 1 + randomIndex(2, random);

      return buildCreativeLayout(
        rows,
        cols,
        (row, col) =>
          (row === topHeight && col !== leftDoorCol && col !== rightDoorCol)
          || (col === leftWidth && row !== topDoorRow && row !== bottomDoorRow),
        routes,
        reveals,
        minimum,
        random,
      );
    }

    case 'hourglass': {
      const rows = 10 + randomIndex(3, random);
      const cols = 9 + randomIndex(3, random);
      const waistWidth = 3 + randomIndex(Math.min(3, cols - 5), random);
      const waistLeft = Math.floor((cols - waistWidth) / 2);
      const waistRight = waistLeft + waistWidth - 1;
      const midRow = (rows - 1) / 2;

      const rowBounds = Array.from({ length: rows }, (_, row) => {
        if (row <= 1 || row >= rows - 2) return [0, cols - 1] as const;
        const progress = 1 - Math.min(1, Math.abs(row - midRow) / Math.max(1, midRow - 1));
        const left = Math.min(waistLeft, Math.round(waistLeft * progress));
        const right = Math.max(waistRight, cols - 1 - Math.round((cols - 1 - waistRight) * progress));
        return [left, right] as const;
      });

      const laneLeft = traceOrtho([[0, 0], [0, waistLeft], [rows - 1, waistLeft], [rows - 1, 0]]);
      const laneRight = traceOrtho([[0, cols - 1], [0, waistRight], [rows - 1, waistRight], [rows - 1, cols - 1]]);
      const laneCenter = traceOrtho([[0, waistLeft + 1], [rows - 1, waistLeft + 1]]);
      const routes = laneCenter.length >= minimum ? [laneLeft, laneRight, laneCenter] : [laneLeft, laneRight];
      const reveals = random() < 0.7 ? 1 : 2;

      return buildCreativeLayout(
        rows,
        cols,
        (row, col) => col < rowBounds[row][0] || col > rowBounds[row][1],
        routes,
        reveals,
        minimum,
        random,
      );
    }

    case 'spiral': {
      const size = 10 + randomIndex(2, random);
      const blocked = new Set<string>();
      const mark = (row: number, col: number) => blocked.add(`${row},${col}`);

      for (let col = 0; col <= size - 3; col += 1) mark(2, col);
      for (let row = 2; row <= size - 3; row += 1) mark(row, size - 3);
      for (let col = 2; col <= size - 3; col += 1) mark(size - 3, col);
      for (let row = 4; row <= size - 3; row += 1) mark(row, 2);

      if (size === 11) {
        for (let col = 2; col <= 6; col += 1) mark(4, col);
        for (let row = 4; row <= 6; row += 1) mark(row, 6);
        for (let col = 4; col <= 6; col += 1) mark(6, col);
      } else {
        for (let col = 2; col <= 5; col += 1) mark(4, col);
        mark(5, 5);
      }

      if (random() < 0.7) {
        const hatchWall = randomIndex(3, random);
        if (hatchWall === 0) blocked.delete(`2,${2 + randomIndex(size - 5, random)}`);
        else if (hatchWall === 1) blocked.delete(`${3 + randomIndex(size - 6, random)},${size - 3}`);
        else blocked.delete(`${size - 3},${3 + randomIndex(size - 6, random)}`);
      }

      const spine = size === 11
        ? traceOrtho([[1, 0], [0, 0], [0, 10], [10, 10], [10, 0], [3, 0], [3, 7], [7, 7], [7, 3], [5, 3], [5, 5]])
        : traceOrtho([[1, 0], [0, 0], [0, 9], [9, 9], [9, 0], [3, 0], [3, 6], [6, 6], [6, 3], [5, 3], [5, 4]]);
      const parallel = traceOrtho([[1, 1], [1, size - 2], [size - 2, size - 2], [size - 2, 1], [4, 1]]);
      const spineRoutes = splitWalkIntoRoutes(spine, minimum, 2, random);
      const routes = [...spineRoutes, parallel];
      const reveals = random() < 0.75 ? 1 : 0;

      return buildCreativeLayout(
        size,
        size,
        (row, col) => blocked.has(`${row},${col}`),
        routes,
        reveals,
        minimum,
        random,
      );
    }

    case 'baffles': {
      const rows = 9 + randomIndex(3, random);
      const cols = 11 + randomIndex(2, random);
      const wall1 = 3 + (cols >= 12 ? randomIndex(2, random) : 0);
      const wall2 = Math.max(wall1 + 3, cols - 4 - randomIndex(2, random));
      const gap1 = 2 + randomIndex(2, random);
      const gap2 = 2 + randomIndex(2, random);
      const hatch1 = random() < 0.55 ? 1 + randomIndex(Math.max(1, rows - gap1 - 2), random) : -1;
      const hatch2 = random() < 0.55 ? gap2 + 1 + randomIndex(Math.max(1, rows - gap2 - 2), random) : -1;

      const outerRibbon = traceOrtho([
        [0, 0], [rows - 1, 0], [rows - 1, wall1 + 2], [1, wall1 + 2], [1, cols - 2], [rows - 1, cols - 2],
      ]);
      const innerRibbon = traceOrtho([
        [0, 1], [rows - 2, 1], [rows - 2, wall1 + 1], [0, wall1 + 1], [0, cols - 1], [rows - 1, cols - 1],
      ]);
      const routes = [
        ...splitWalkIntoRoutes(outerRibbon, minimum, 2, random),
        innerRibbon,
      ];
      const reveals = 1 + randomIndex(2, random);

      return buildCreativeLayout(
        rows,
        cols,
        (row, col) =>
          (col === wall1 && row < rows - gap1 && row !== hatch1)
          || (col === wall2 && row >= gap2 && row !== hatch2),
        routes,
        reveals,
        minimum,
        random,
      );
    }

    case 'cross': {
      const size = 10 + randomIndex(3, random);
      const cut = size === 10 ? 2 : 2 + randomIndex(2, random);
      const hasCenterPillar = random() < 0.75;
      const midLow = Math.floor((size - 1) / 2);
      const midHigh = Math.ceil((size - 1) / 2);

      const routes = [
        traceOrtho([[0, cut], [cut, cut], [cut, 0], [size - 1 - cut, 0]]),
        traceOrtho([[size - 1, size - 1 - cut], [size - 1 - cut, size - 1 - cut], [size - 1 - cut, size - 1], [cut, size - 1]]),
        traceOrtho([[0, cut + 1], [0, size - 1 - cut], [cut, size - 1 - cut], [cut, size - 2]]),
        traceOrtho([[size - 1, size - 2 - cut], [size - 1, cut], [size - 1 - cut, cut], [size - 1 - cut, 1]]),
      ];
      const reveals = randomIndex(3, random);

      return buildCreativeLayout(
        size,
        size,
        (row, col) => {
          const inCorner = (row < cut || row >= size - cut) && (col < cut || col >= size - cut);
          const inCenter = hasCenterPillar && row >= midLow && row <= midHigh && col >= midLow && col <= midHigh;
          return inCorner || inCenter;
        },
        routes,
        reveals,
        minimum,
        random,
      );
    }

    case 'island': {
      const size = 10 + randomIndex(3, random);
      const innerMin = 3;
      const innerSpan = size - 6;
      const northBridge = innerMin + randomIndex(innerSpan, random);
      const southBridge = innerMin + randomIndex(innerSpan, random);
      const westBridge = random() < 0.55 ? innerMin + randomIndex(innerSpan, random) : -1;
      const eastBridge = random() < 0.55 ? innerMin + randomIndex(innerSpan, random) : -1;

      const outerRing = traceOrtho([[0, 0], [0, size - 1], [size - 1, size - 1], [size - 1, 0], [1, 0]]);
      const islandBridge = traceOrtho([
        [1, 1], [1, northBridge], [3, northBridge], [3, southBridge], [size - 2, southBridge], [size - 2, size - 2],
      ]);
      const routes = [...splitWalkIntoRoutes(outerRing, minimum, 2, random), islandBridge];
      const reveals = 1 + randomIndex(2, random);

      return buildCreativeLayout(
        size,
        size,
        (row, col) => {
          if (row === 2 && col >= 2 && col <= size - 3) return col !== northBridge;
          if (row === size - 3 && col >= 2 && col <= size - 3) return col !== southBridge;
          if (col === 2 && row >= 2 && row <= size - 3) return row !== westBridge;
          if (col === size - 3 && row >= 2 && row <= size - 3) return row !== eastBridge;
          return false;
        },
        routes,
        reveals,
        minimum,
        random,
      );
    }

    case 'steps': {
      const size = 10 + randomIndex(2, random);
      const halfBand = 3;
      const mid = Math.floor(size / 2);
      const pillarMode = randomIndex(3, random);
      const pillars = new Set<string>();
      if (pillarMode === 1) {
        pillars.add(`${mid},${size - mid}`);
      } else if (pillarMode === 2) {
        pillars.add(`${mid - 1},${size - (mid - 1)}`);
        pillars.add(`${mid + 1},${size - (mid + 1)}`);
      }

      const laneUpper = traceStaircase(size - 4, 0, size - 4, 'col');
      const laneMiddle = traceStaircase(size - 2, 0, size - 2, 'col');
      const laneLower = traceStaircase(size - 1, 3, size - 4, 'row');
      const routes = [laneUpper, laneMiddle, laneLower];
      const reveals = 1 + randomIndex(2, random);

      return buildCreativeLayout(
        size,
        size,
        (row, col) => Math.abs(row + col - (size - 1)) > halfBand || pillars.has(`${row},${col}`),
        routes,
        reveals,
        minimum,
        random,
      );
    }

    case 'twinHalls': {
      const rows = 9 + randomIndex(3, random);
      const leftWidth = 4 + randomIndex(2, random);
      const wallThickness = 1 + randomIndex(2, random);
      const rightWidth = Math.max(4, 10 - leftWidth - wallThickness) + randomIndex(2, random);
      const cols = leftWidth + wallThickness + rightWidth;
      const topBridge = 1 + randomIndex(2, random);
      const midBridge = Math.floor(rows / 2);
      const bottomBridge = rows - 2 - randomIndex(2, random);
      const trimOppositeCorners = random() < 0.8;

      const routeTop = traceOrtho([[topBridge, 0], [topBridge, cols - 1], [0, cols - 1]]);
      const routeMid = traceOrtho([[midBridge, 0], [midBridge, cols - 1]]);
      const routeBottom = traceOrtho([[rows - 1, 0], [bottomBridge, 0], [bottomBridge, cols - 1]]);
      const routes = [routeTop, routeMid, routeBottom];
      const reveals = 1 + randomIndex(2, random);

      return buildCreativeLayout(
        rows,
        cols,
        (row, col) => {
          const inWall = col >= leftWidth && col < leftWidth + wallThickness
            && row !== topBridge && row !== midBridge && row !== bottomBridge;
          const inTopLeftTrim = trimOppositeCorners && row === 0 && col < leftWidth - 1;
          const inBottomRightTrim = trimOppositeCorners && row === rows - 1 && col > leftWidth + wallThickness;
          return inWall || inTopLeftTrim || inBottomRightTrim;
        },
        routes,
        reveals,
        minimum,
        random,
      );
    }
  }
}

export function generateBoard(
  size: number,
  minimum: number,
  obstacleCount: number,
  pairCount: number,
  random = Math.random,
): { blueprint: BoardBlueprint; paths: Coord[][] } {
  const area = size * size;
  if (minimum < 2 || minimum > area) throw new RangeError('Path length does not fit this board');

  let walk = Array.from({ length: area }, (_, index) => {
    const row = Math.floor(index / size);
    const offset = index % size;
    return row * size + (row % 2 === 0 ? offset : size - 1 - offset);
  });

  // A backbite joins the first cell to a neighbor and reverses the intervening prefix.
  for (let step = 0; step < area * 2; step += 1) {
    if (random() < 0.5) walk.reverse();
    const head = walk[0];
    const neighbors = [head - size, head + size];
    if (head % size > 0) neighbors.push(head - 1);
    if (head % size < size - 1) neighbors.push(head + 1);
    const join = walk.indexOf(neighbors[randomIndex(neighbors.length, random)]);
    if (join > 1) walk = walk.slice(0, join).reverse().concat(walk.slice(join));
  }

  const count = Math.max(1, Math.min(pairCount, Math.floor(area / minimum)));
  const length = Math.min(minimum + 2, Math.floor(area / count));
  const start = randomIndex(area - count * length + 1, random);
  const toCoord = (index: number): Coord => ({ row: Math.floor(index / size), col: index % size });
  const reserved = walk.slice(start, start + count * length);
  const reservedSet = new Set(reserved);
  const paths = Array.from({ length: count }, (_, index) =>
    reserved.slice(index * length, (index + 1) * length).map(toCoord));

  const mirrored = shuffle(walk.filter((index) => {
    const opposite = area - 1 - index;
    return index < opposite && !reservedSet.has(index) && !reservedSet.has(opposite);
  }), random);
  const maxObstacles = Math.min(obstacleCount, area - Math.max(length, count * 2 + 3));
  const blockedCells = mirrored.slice(0, Math.max(0, Math.floor(maxObstacles / 2)))
    .flatMap((index) => [toCoord(index), toCoord(area - 1 - index)]);
  const presetPieces = pairCount === 0 ? [] : paths.flatMap((path, colorId) => {
    const startPiece = { coord: path[0], colorId };
    return colorId === paths.length - 1
      ? [startPiece]
      : [startPiece, { coord: path[path.length - 1], colorId }];
  });

  return { blueprint: { rows: size, cols: size, blockedCells, presetPieces }, paths };
}

export function createBoardLibrary(minimum: number, random = Math.random): MatchBoard[] {
  const largeSizes = [14, 16, 18, 20].filter((size) => size * size >= minimum);
  const blankSizes = minimum > 144 ? [8, 10, 12, ...largeSizes.slice(0, 3)] : [8, 10, 12];
  const blanks: MatchBoard[] = blankSizes.map((size) => ({
    id: `built-in:${size}:0`,
    name: '空白棋盘',
    blueprint: { rows: size, cols: size, blockedCells: [], presetPieces: [] },
  }));
  const creative: MatchBoard[] = minimum <= 24
    ? (Object.keys(CREATIVE_ARCHETYPES) as CreativeArchetype[]).flatMap((archetype) => {
      const generated = generateCreativeBoard(archetype, minimum, random);
      if (generated.supportedMinPathLength < minimum) return [];
      return [{
        id: `creative:${archetype}`,
        name: CREATIVE_ARCHETYPES[archetype],
        blueprint: generated.blueprint,
        supportedMinPathLength: generated.supportedMinPathLength,
      }];
    })
    : [];
  return [...PRESET_BOARDS.map(({ board }) => board), ...creative, ...blanks];
}

export function boardHasRoom(board: MatchBoard, minimum: number) {
  const { rows, cols, blockedCells } = board.blueprint;
  return rows * cols - blockedCells.length >= minimum
    && (board.supportedMinPathLength ?? Infinity) >= minimum;
}

function layoutKey(board: MatchBoard): string {
  const { rows, cols, blockedCells, presetPieces } = board.blueprint;
  return JSON.stringify([
    rows, cols,
    blockedCells.map(({ row, col }) => row * cols + col).sort(),
    presetPieces.map(({ coord, colorId }) => `${coord.row * cols + coord.col}:${colorId}`).sort(),
  ]);
}

function uniqueBoards(boards: MatchBoard[]): MatchBoard[] {
  return [...new Map(boards.map((board) => [layoutKey(board), board])).values()];
}

export function randomBoardPool(
  builtIn: MatchBoard[],
  custom: MatchBoard[],
  minimum: number,
): MatchBoard[] {
  // A blank rectangle admits the same serpentine construction as the built-in boards.
  return uniqueBoards([...builtIn, ...custom.filter(({ blueprint }) =>
    blueprint.blockedCells.length === 0 && blueprint.presetPieces.length === 0)])
    .filter((board) => boardHasRoom(board, minimum));
}

export function planRoundBoards(
  totalRounds: number,
  selected: (MatchBoard | undefined)[],
  pool: MatchBoard[],
  random = Math.random,
): MatchBoard[] {
  const reserved = new Set(selected.filter((board) => board !== undefined).map(layoutKey));
  const available = shuffle(pool, random).filter((board) => !reserved.has(layoutKey(board)));
  let refill: MatchBoard[] = [];
  return Array.from({ length: totalRounds }, (_, index) => {
    if (selected[index]) return selected[index];
    const unused = available.pop();
    if (unused) return unused;
    if (refill.length === 0) refill = shuffle(pool, random);
    const repeated = refill.pop();
    if (!repeated) throw new Error('A random slot needs at least one available board');
    return repeated;
  });
}

export function boardAlternatives(current: MatchBoard, schedule: MatchBoard[], pool: MatchBoard[]) {
  const currentKey = layoutKey(current);
  const used = new Set(schedule.map(layoutKey));
  const alternatives = pool.filter((board) => layoutKey(board) !== currentKey);
  const unused = alternatives.filter((board) => !used.has(layoutKey(board)));
  return unused.length > 0 ? unused : alternatives;
}
