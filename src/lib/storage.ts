import { coordKey, isInBounds } from './engine';
import type { BoardBlueprint, CellKey, Coord, MatchHistoryRecord, PresetPiece, SavedBoard } from './types';

export const SAVED_BOARDS_KEY = 'color-link:saved-boards:v1';
export const MATCH_HISTORY_KEY = 'color-link:match-history:v1';
const MAX_HISTORY_RECORDS = 100;

function getStorage(): Storage | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis && globalThis.localStorage) {
      return globalThis.localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export function generateId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export function sanitizeBlueprint(blueprint: BoardBlueprint): BoardBlueprint {
  const rows = Math.min(20, Math.max(4, Math.floor(blueprint.rows) || 10));
  const cols = Math.min(20, Math.max(4, Math.floor(blueprint.cols) || 10));

  const blockedKeys = new Set<CellKey>();
  const blockedCells: Coord[] = [];
  for (const item of blueprint.blockedCells ?? []) {
    const coord = { row: Math.floor(item.row), col: Math.floor(item.col) };
    if (!isInBounds(coord, rows, cols)) {
      continue;
    }
    const key = coordKey(coord);
    if (blockedKeys.has(key)) {
      continue;
    }
    blockedKeys.add(key);
    blockedCells.push(coord);
  }

  const occupiedKeys = new Set<CellKey>(blockedKeys);
  const colorCounts = new Map<number, number>();
  const presetPieces: PresetPiece[] = [];

  for (const item of blueprint.presetPieces ?? []) {
    const coord = { row: Math.floor(item.coord.row), col: Math.floor(item.coord.col) };
    const colorId = Math.floor(item.colorId);
    if (!isInBounds(coord, rows, cols) || colorId < 0 || colorId >= 26) {
      continue;
    }
    const key = coordKey(coord);
    if (occupiedKeys.has(key)) {
      continue;
    }
    const currentCount = colorCounts.get(colorId) ?? 0;
    if (currentCount >= 2) {
      continue;
    }
    occupiedKeys.add(key);
    colorCounts.set(colorId, currentCount + 1);
    presetPieces.push({ coord, colorId });
  }

  return {
    rows,
    cols,
    blockedCells,
    presetPieces,
  };
}

export function getMinRequiredColorCount(blueprint: BoardBlueprint): number {
  let maxId = -1;
  for (const piece of blueprint.presetPieces) {
    if (piece.colorId > maxId) {
      maxId = piece.colorId;
    }
  }
  return Math.max(2, maxId + 1);
}

export function loadSavedBoards(): SavedBoard[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }
  try {
    const raw = storage.getItem(SAVED_BOARDS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    const boards: SavedBoard[] = [];
    for (const item of parsed) {
      if (
        item &&
        typeof item.id === 'string' &&
        typeof item.name === 'string' &&
        item.blueprint &&
        typeof item.blueprint === 'object'
      ) {
        boards.push({
          id: item.id,
          name: item.name.trim() || '未命名棋盘',
          updatedAt: typeof item.updatedAt === 'string' ? item.updatedAt : new Date().toISOString(),
          blueprint: sanitizeBlueprint(item.blueprint),
        });
      }
    }
    return boards;
  } catch {
    return [];
  }
}

export function saveSavedBoards(boards: SavedBoard[]): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(SAVED_BOARDS_KEY, JSON.stringify(boards));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function upsertSavedBoard(board: SavedBoard): SavedBoard[] {
  const existing = loadSavedBoards();
  const clean: SavedBoard = {
    ...board,
    name: board.name.trim() || '未命名棋盘',
    updatedAt: board.updatedAt || new Date().toISOString(),
    blueprint: sanitizeBlueprint(board.blueprint),
  };
  const filtered = existing.filter((item) => item.id !== clean.id);
  const next = [clean, ...filtered];
  saveSavedBoards(next);
  return next;
}

export function deleteSavedBoard(id: string): SavedBoard[] {
  const next = loadSavedBoards().filter((item) => item.id !== id);
  saveSavedBoards(next);
  return next;
}

export function loadMatchHistory(): MatchHistoryRecord[] {
  const storage = getStorage();
  if (!storage) {
    return [];
  }
  try {
    const raw = storage.getItem(MATCH_HISTORY_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter(
      (item): item is MatchHistoryRecord =>
        Boolean(item) &&
        typeof item.id === 'string' &&
        Array.isArray(item.playerNames) &&
        Array.isArray(item.scores) &&
        (item.winner === 0 || item.winner === 1),
    );
  } catch {
    return [];
  }
}

export function saveMatchHistory(records: MatchHistoryRecord[]): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(MATCH_HISTORY_KEY, JSON.stringify(records.slice(0, MAX_HISTORY_RECORDS)));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

export function appendMatchHistory(record: MatchHistoryRecord): MatchHistoryRecord[] {
  const existing = loadMatchHistory().filter((item) => item.id !== record.id);
  const next = [record, ...existing].slice(0, MAX_HISTORY_RECORDS);
  saveMatchHistory(next);
  return next;
}

export function deleteMatchHistoryItem(id: string): MatchHistoryRecord[] {
  const next = loadMatchHistory().filter((item) => item.id !== id);
  saveMatchHistory(next);
  return next;
}

export function clearMatchHistory(): MatchHistoryRecord[] {
  saveMatchHistory([]);
  return [];
}
