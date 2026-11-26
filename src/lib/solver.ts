import type { Cadical } from 'cadical-wasm';
import type { Coord, PresetPiece } from './types';

export interface SolveBoardRequest {
  rows: number;
  cols: number;
  minPathLength: number;
  blockedCells: Coord[];
  groups: [colorId: number, endpoints: Coord[]][];
}

export interface BoardSolution {
  paths: Record<number, Coord[]>;
  addedPieces: PresetPiece[];
}

export type SolveResult =
  | { status: 'solved'; solution: BoardSolution }
  | { status: 'impossible' | 'inconclusive' | 'unavailable' };

interface Edge {
  to: number;
  selected: number;
}

interface Cell {
  incoming: number[];
  outgoing: Edge[];
  label: number[];
  rank: number[];
}

interface Group {
  colorId: number;
  start: number;
  goal: number | undefined;
}

export function solveBoard(request: SolveBoardRequest, solver: Cadical, maxMilliseconds = 4500): SolveResult {
  const { rows, cols, blockedCells, groups, minPathLength } = request;
  const size = rows * cols;
  const minimumSteps = Math.max(2, minPathLength) - 1;
  const deadline = performance.now() + maxMilliseconds;
  const toIndex = ({ row, col }: Coord) => row * cols + col;
  const toCoord = (index: number): Coord => ({ row: Math.floor(index / cols), col: index % cols });
  const blocked = new Set(blockedCells.map(toIndex));
  const sources = new Set<number>();
  const goals = new Set<number>();
  const routes: Group[] = [];

  if (groups.length * (minimumSteps + 1) > size - blocked.size) return { status: 'impossible' };

  for (const [colorId, endpoints] of groups) {
    if (endpoints.length < 1 || endpoints.length > 2) return { status: 'impossible' };
    const [start, goal] = endpoints.map(toIndex);
    for (const index of [start, goal]) {
      if (index !== undefined && (blocked.has(index) || sources.has(index) || goals.has(index))) {
        return { status: 'impossible' };
      }
    }
    if (start === goal) return { status: 'impossible' };
    sources.add(start);
    if (goal !== undefined) goals.add(goal);
    routes.push({ colorId, start, goal });
  }

  let variable = 0;
  const newVariable = () => ++variable;
  const newBits = (width: number) => Array.from({ length: width }, newVariable);
  const clause = (...literals: number[]) => solver.addClause(literals);

  // One set of variables per cell, shared by every route. Nonzero labels are
  // unique to fixed pairs; label zero may end at an empty cell.
  const labelWidth = Math.ceil(Math.log2(goals.size + 1));
  // Count through the required prefix of a route. Once the counter reaches the
  // minimum, further edges keep it at that value.
  const rankWidth = Math.ceil(Math.log2(minimumSteps + 1));
  const cells: (Cell | null)[] = Array.from({ length: size }, (_, index) =>
    blocked.has(index) ? null : { incoming: [], outgoing: [], label: newBits(labelWidth), rank: newBits(rankWidth) },
  );

  function atMostOne(literals: number[]) {
    for (let i = 0; i < literals.length; i++) {
      for (let j = 0; j < i; j++) clause(-literals[i], -literals[j]);
    }
  }

  function bitLiterals(bits: number[], value: number) {
    return bits.map((bit, i) => value & (1 << i) ? bit : -bit);
  }

  function increment(rank: number[]): number[] {
    const nextRank = [-rank[0]];
    let carry = rank[0];
    for (let i = 1; i < rank.length; i++) {
      const bit = rank[i];
      const nextBit = newVariable();
      // The new bit is bit XOR carry.
      clause(bit, carry, -nextBit);
      clause(bit, -carry, nextBit);
      clause(-bit, carry, nextBit);
      clause(-bit, -carry, -nextBit);
      nextRank.push(nextBit);
      if (i < rank.length - 1) {
        const nextCarry = newVariable();
        clause(-nextCarry, bit);
        clause(-nextCarry, carry);
        clause(-bit, -carry, nextCarry);
        carry = nextCarry;
      }
    }
    return nextRank;
  }

  function advance(rank: number[]): number[] {
    const atLimit = bitLiterals(rank, minimumSteps);
    const saturated = newVariable();
    atLimit.forEach((bit) => clause(-saturated, bit));
    clause(saturated, ...atLimit.map((bit) => -bit));

    return increment(rank).map((step, i) => {
      const next = newVariable();
      // At the limit this bit has a known value, otherwise use the increment.
      const fixedBit = minimumSteps & (1 << i) ? next : -next;
      clause(-saturated, fixedBit);
      clause(saturated, -step, next);
      clause(saturated, step, -next);
      return next;
    });
  }

  let pairLabel = 0;
  for (const { start, goal } of routes) {
    const label = goal === undefined ? 0 : ++pairLabel;
    bitLiterals(cells[start]!.label, label).forEach((bit) => clause(bit));
    cells[start]!.rank.forEach((bit) => clause(-bit));
    if (goal !== undefined) bitLiterals(cells[goal]!.label, label).forEach((bit) => clause(bit));
  }

  for (const [index, cell] of cells.entries()) {
    if (cell === null || goals.has(index)) continue;
    const { row, col } = toCoord(index);
    const neighbours = [
      ...(row > 0 ? [index - cols] : []),
      ...(col + 1 < cols ? [index + 1] : []),
      ...(row + 1 < rows ? [index + cols] : []),
      ...(col > 0 ? [index - 1] : []),
    ].filter((to) => cells[to] !== null && !sources.has(to));
    if (neighbours.length === 0) continue;

    const nextRank = advance(cell.rank);
    for (const to of neighbours) {
      const next = cells[to]!;
      const selected = newVariable();
      cell.outgoing.push({ to, selected });
      next.incoming.push(selected);
      cell.label.forEach((bit, i) => {
        clause(-selected, -bit, next.label[i]);
        clause(-selected, bit, -next.label[i]);
      });
      nextRank.forEach((bit, i) => {
        clause(-selected, -bit, next.rank[i]);
        clause(-selected, bit, -next.rank[i]);
      });
    }
  }

  for (const [index, cell] of cells.entries()) {
    if (cell === null) continue;
    const { incoming, outgoing, label, rank } = cell;
    const exits = outgoing.map(({ selected }) => selected);
    atMostOne(incoming);
    if (sources.has(index)) {
      clause(...exits);
    } else if (goals.has(index)) {
      clause(...incoming);
      bitLiterals(rank, minimumSteps).forEach((bit) => clause(bit));
    } else {
      const stop = newVariable();
      exits.push(stop);
      label.forEach((bit) => clause(-stop, -bit));
      bitLiterals(rank, minimumSteps).forEach((bit) => clause(-stop, bit));
      incoming.forEach((edge) => clause(-edge, ...exits));
      exits.forEach((edge) => clause(-edge, ...incoming));
    }
    atMostOne(exits);
  }

  if (performance.now() >= deadline) return { status: 'inconclusive' };
  solver.setTerminate(() => performance.now() >= deadline);
  const result = solver.solve();
  if (result === 'unsatisfiable') return { status: 'impossible' };
  if (result !== 'satisfiable') return { status: 'inconclusive' };

  const paths: BoardSolution['paths'] = {};
  const addedPieces: PresetPiece[] = [];
  // A disconnected cycle may satisfy the counter after saturation. The degree
  // constraints keep it separate from all terminals, so decoding discards it.
  for (const { colorId, start, goal } of routes) {
    let index = start;
    const path = [toCoord(index)];
    let nextEdge = cells[index]!.outgoing.find(({ selected }) => solver.value(selected));
    while (nextEdge) {
      index = nextEdge.to;
      path.push(toCoord(index));
      nextEdge = cells[index]!.outgoing.find(({ selected }) => solver.value(selected));
    }
    paths[colorId] = path;
    if (goal === undefined) addedPieces.push({ colorId, coord: toCoord(index) });
  }
  return { status: 'solved', solution: { paths, addedPieces } };
}
