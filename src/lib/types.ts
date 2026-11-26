export type PlayerId = 0 | 1;

export interface Coord {
  row: number;
  col: number;
}

export type CellKey = `${number},${number}`;

export type PieceSource = 'preset' | 'turn' | 'verify';

export interface Piece {
  colorId: number;
  locked: boolean;
  source: PieceSource;
  placedBy?: PlayerId;
  turnNumber?: number;
}

export interface PresetPiece {
  coord: Coord;
  colorId: number;
}

export interface BoardBlueprint {
  rows: number;
  cols: number;
  blockedCells: Coord[];
  presetPieces: PresetPiece[];
}

export interface MatchBoard {
  id: string;
  name: string;
  blueprint: BoardBlueprint;
  original?: boolean;
  supportedMinPathLength?: number;
}

export interface GameConfig {
  rows: number;
  cols: number;
  minPathLength: number;
  targetWins: number;
  moveTimeLimitSec: number | null;
  verifyTimeLimitSec: number | null;
  playerNames: [string, string];
}

export type GamePhase = 'setup' | 'select_first' | 'playing' | 'verifying' | 'round_over' | 'match_over';

export type RoundEndReason =
  | 'move_timeout'
  | 'verify_success'
  | 'verify_resign'
  | 'verify_timeout';

export interface RoundResult {
  roundNumber: number;
  winner: PlayerId;
  reason: RoundEndReason;
  declarer?: PlayerId;
  verifier?: PlayerId;
  board?: { id: string; name: string; rows: number; cols: number };
}

export interface SavedBoard extends Pick<MatchBoard, 'id' | 'name' | 'blueprint' | 'supportedMinPathLength'> {
  updatedAt: string;
}

export interface MatchHistoryRecord {
  id: string;
  playedAt: string;
  playerNames: [string, string];
  scores: [number, number];
  winner: PlayerId;
  targetWins: number;
  boardName: string;
  rows: number;
  cols: number;
  minPathLength: number;
  colorCount: number;
  blockedCount: number;
  presetCount: number;
  rounds: RoundResult[];
}

export interface ColorVerificationStatus {
  colorId: number;
  pieceCoords: Coord[];
  needsPair: boolean;
  path: Coord[];
  connected: boolean;
  length: number;
  lengthValid: boolean;
  valid: boolean;
}

export interface VerificationEvaluation {
  colors: ColorVerificationStatus[];
  totalColors: number;
  validColors: number;
  allValid: boolean;
  hasOverlap: boolean;
}

export interface GameState {
  config: GameConfig;
  blueprint: BoardBlueprint;
  phase: GamePhase;
  roundNumber: number;
  scores: [number, number];
  firstPlayer: PlayerId | null;
  currentPlayer: PlayerId;
  lastMover: PlayerId | null;
  turnIndex: number;
  pieces: Record<CellKey, Piece>;
  pendingCoords: CellKey[];
  declarer: PlayerId | null;
  verifier: PlayerId | null;
  paths: Record<number, Coord[]>;
  lastRoundResult: RoundResult | null;
  history: RoundResult[];
}
