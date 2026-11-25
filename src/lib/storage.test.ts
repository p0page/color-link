import { beforeEach, describe, expect, it } from 'vitest';
import {
  appendMatchHistory,
  clearMatchHistory,
  deleteMatchHistoryItem,
  deleteSavedBoard,
  getMinRequiredColorCount,
  loadMatchHistory,
  loadSavedBoards,
  sanitizeBlueprint,
  upsertSavedBoard,
} from './storage';
import type { MatchHistoryRecord, SavedBoard } from './types';

function installMemoryStorage() {
  const store = new Map<string, string>();
  const mockStorage: Storage = {
    get length() {
      return store.size;
    },
    clear() {
      store.clear();
    },
    getItem(key: string) {
      return store.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(store.keys())[index] ?? null;
    },
    removeItem(key: string) {
      store.delete(key);
    },
    setItem(key: string, value: string) {
      store.set(key, String(value));
    },
  };
  Object.defineProperty(globalThis, 'localStorage', {
    value: mockStorage,
    configurable: true,
    writable: true,
  });
}

describe('storage & blueprint sanitization', () => {
  beforeEach(() => {
    installMemoryStorage();
  });

  it('sanitizes out-of-bounds, overlapping, and >2-per-color preset pieces cleanly', () => {
    const clean = sanitizeBlueprint({
      rows: 6,
      cols: 6,
      blockedCells: [
        { row: 1, col: 1 },
        { row: 1, col: 1 }, // duplicate
        { row: 9, col: 0 }, // out of bounds
      ],
      presetPieces: [
        { coord: { row: 1, col: 1 }, colorId: 0 }, // blocked cell -> dropped
        { coord: { row: 0, col: 0 }, colorId: 0 },
        { coord: { row: 0, col: 1 }, colorId: 0 },
        { coord: { row: 0, col: 2 }, colorId: 0 }, // 3rd piece of color A -> dropped
        { coord: { row: 2, col: 2 }, colorId: 15 }, // color P -> kept
      ],
    });

    expect(clean.blockedCells).toEqual([{ row: 1, col: 1 }]);
    expect(clean.presetPieces).toEqual([
      { coord: { row: 0, col: 0 }, colorId: 0 },
      { coord: { row: 0, col: 1 }, colorId: 0 },
      { coord: { row: 2, col: 2 }, colorId: 15 },
    ]);
    expect(getMinRequiredColorCount(clean)).toBe(16);
  });

  it('persists, updates, and deletes saved boards in localStorage', () => {
    const boardA: SavedBoard = {
      id: 'board_a',
      name: '十字迷宫',
      updatedAt: '2026-11-25T10:00:00.000Z',
      blueprint: {
        rows: 10,
        cols: 10,
        blockedCells: [{ row: 4, col: 4 }],
        presetPieces: [{ coord: { row: 0, col: 0 }, colorId: 0 }],
      },
    };

    upsertSavedBoard(boardA);
    expect(loadSavedBoards()).toHaveLength(1);
    expect(loadSavedBoards()[0].name).toBe('十字迷宫');

    upsertSavedBoard({ ...boardA, name: '十字迷宫 v2' });
    expect(loadSavedBoards()).toHaveLength(1);
    expect(loadSavedBoards()[0].name).toBe('十字迷宫 v2');

    deleteSavedBoard('board_a');
    expect(loadSavedBoards()).toHaveLength(0);
  });

  it('persists, lists newest-first, deletes, and clears match history in localStorage', () => {
    const rec1: MatchHistoryRecord = {
      id: 'm1',
      playedAt: '2026-11-25T10:00:00.000Z',
      playerNames: ['甲', '乙'],
      scores: [3, 1],
      winner: 0,
      targetWins: 3,
      boardName: '空白棋盘',
      rows: 10,
      cols: 10,
      minPathLength: 6,
      colorCount: 26,
      blockedCount: 0,
      presetCount: 0,
      rounds: [{ roundNumber: 1, winner: 0, reason: 'verify_success' }],
    };
    const rec2: MatchHistoryRecord = {
      ...rec1,
      id: 'm2',
      scores: [2, 3],
      winner: 1,
    };

    appendMatchHistory(rec1);
    appendMatchHistory(rec2);
    const loaded = loadMatchHistory();
    expect(loaded.map((r) => r.id)).toEqual(['m2', 'm1']);

    deleteMatchHistoryItem('m2');
    expect(loadMatchHistory().map((r) => r.id)).toEqual(['m1']);

    clearMatchHistory();
    expect(loadMatchHistory()).toHaveLength(0);
  });
});
