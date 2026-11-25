export interface PieceColor {
  id: number;
  letter: string;
  hex: string;
  textColor: '#0b1020' | '#ffffff';
  glow: string;
}

const PALETTE_SPECS: ReadonlyArray<{ hex: string; textColor: '#0b1020' | '#ffffff' }> = [
  { hex: '#ef4444', textColor: '#ffffff' }, // A - Crimson Red
  { hex: '#2563eb', textColor: '#ffffff' }, // B - Cobalt Blue
  { hex: '#16a34a', textColor: '#ffffff' }, // C - Emerald Green
  { hex: '#facc15', textColor: '#0b1020' }, // D - Vivid Yellow
  { hex: '#9333ea', textColor: '#ffffff' }, // E - Royal Purple
  { hex: '#f97316', textColor: '#ffffff' }, // F - Tangerine
  { hex: '#0891b2', textColor: '#ffffff' }, // G - Cyan
  { hex: '#ec4899', textColor: '#ffffff' }, // H - Hot Pink
  { hex: '#65a30d', textColor: '#ffffff' }, // I - Lime
  { hex: '#0d9488', textColor: '#ffffff' }, // J - Teal
  { hex: '#e11d48', textColor: '#ffffff' }, // K - Rose
  { hex: '#4f46e5', textColor: '#ffffff' }, // L - Indigo
  { hex: '#d97706', textColor: '#ffffff' }, // M - Amber Gold
  { hex: '#10b981', textColor: '#ffffff' }, // N - Mint Jade
  { hex: '#c026d3', textColor: '#ffffff' }, // O - Fuchsia
  { hex: '#0ea5e9', textColor: '#ffffff' }, // P - Sky Blue
  { hex: '#fb7185', textColor: '#ffffff' }, // Q - Coral Pink
  { hex: '#a855f7', textColor: '#ffffff' }, // R - Violet
  { hex: '#eab308', textColor: '#0b1020' }, // S - Marigold
  { hex: '#14b8a6', textColor: '#ffffff' }, // T - Aqua
  { hex: '#ea580c', textColor: '#ffffff' }, // U - Burnt Orange
  { hex: '#6366f1', textColor: '#ffffff' }, // V - Periwinkle
  { hex: '#84cc16', textColor: '#0b1020' }, // W - Chartreuse
  { hex: '#d946ef', textColor: '#ffffff' }, // X - Orchid
  { hex: '#b45309', textColor: '#ffffff' }, // Y - Terracotta
  { hex: '#475569', textColor: '#ffffff' }, // Z - Slate Charcoal
];

export const PIECE_COLORS: ReadonlyArray<PieceColor> = PALETTE_SPECS.map((spec, index) => ({
  id: index,
  letter: String.fromCharCode(65 + index),
  hex: spec.hex,
  textColor: spec.textColor,
  glow: `${spec.hex}66`,
}));

export function getPieceColor(colorId: number): PieceColor {
  return PIECE_COLORS[colorId] ?? PIECE_COLORS[0];
}
