import type { BoardBlueprint, MatchBoard } from './types';

function defineCreativePreset(id: string, name: string, supportedMinPathLength: number, grid: string[]): MatchBoard {
  const blueprint: BoardBlueprint = { rows: grid.length, cols: grid[0].length, blockedCells: [], presetPieces: [] };
  for (const [row, line] of grid.entries()) {
    for (const [col, cell] of Array.from(line).entries()) {
      if (cell === '#') blueprint.blockedCells.push({ row, col });
      else if (cell !== '.') blueprint.presetPieces.push({ coord: { row, col }, colorId: cell.charCodeAt(0) - 65 });
    }
  }
  return { id: `creative:${id}`, name, blueprint, supportedMinPathLength };
}

export const CREATIVE_PRESETS = [
  defineCreativePreset('quadrants', '四象限迷城', 9, [
    '....#....',
    '.........',
    '....#....',
    '....#....',
    '....#....',
    '#.#####.#',
    '....#..S.',
    '....#....',
    '....#....',
    '..S......',
  ]),
  defineCreativePreset('hourglass', '沙漏峡谷', 11, [
    '.........',
    '..N......',
    '#.......#',
    '#.......#',
    '##.....##',
    '##.....##',
    '##.....##',
    '#.......#',
    '#.......#',
    '.........',
    'N........',
  ]),
  defineCreativePreset('spiral', '螺旋回廊', 20, [
    '..#......A',
    '..#.......',
    '..#.####..',
    '..#.#A....',
    '..#.#..#..',
    '..#.##.#..',
    '..#....#..',
    '..######..',
    '..........',
    '..........',
  ]),
  defineCreativePreset('baffles', '错位迷闸', 12, [
    '.......#...',
    '.......#...',
    '.......#...',
    '...#.....N.',
    '...#.N.#...',
    '...#...#...',
    '...#...#...',
    '...........',
    '...#.......',
  ]),
  defineCreativePreset('cross', '十字星台', 8, [
    '##......##',
    '##......##',
    '..........',
    '..........',
    '....##....',
    '....##....',
    '..........',
    '..........',
    '##......##',
    '##......##',
  ]),
  defineCreativePreset('island', '护城环岛', 13, [
    '......A...',
    '..........',
    '..####.#.R',
    '..#.......',
    '.......#..',
    '..#....#..',
    'A.#....#..',
    '..###.##..',
    '..........',
    '.R........',
  ]),
  defineCreativePreset('steps', '阶梯斜廊', 10, [
    '...F######',
    '.....#####',
    '......####',
    '.......###',
    '#.......##',
    '##.....F.#',
    '###.......',
    '####......',
    '#####.....',
    '######....',
  ]),
  defineCreativePreset('twinHalls', '双厅连桥', 9, [
    '....##....',
    '....##....',
    '..........',
    '....##....',
    '..........',
    '....##....',
    '....##....',
    '.I.......I',
    '....##....',
    '....##....',
  ]),
];
