<script lang="ts">
  import BoardViewport from './BoardViewport.svelte';
  import { getPieceColor } from '../lib/colors';
  import {
    canPlaceTurnPiece,
    canPlaceVerifyPiece,
    cellKey,
    coordKey,
    createBlockedSet,
    getPathCellOwnerMap,
    getPreviewSegment,
    getReachableLineCells,
    getSingletonColorIds,
  } from '../lib/engine';
  import type { CellKey, Coord, GameState, VerificationEvaluation } from '../lib/types';

  interface Props {
    game: GameState;
    evaluation: VerificationEvaluation;
    selectedColorId: number | null;
    activeDrawColorId: number | null;
    verifyTool: 'draw' | 'erase';
    placingSingletonColorId: number | null;
    highlightedColorId: number | null;
    onPlayingCellClick: (coord: Coord) => void;
    onVerifyCellClick: (coord: Coord) => void;
    onVerifyCellRightClick: (coord: Coord) => void;
  }

  let {
    game,
    evaluation,
    selectedColorId,
    activeDrawColorId,
    verifyTool,
    placingSingletonColorId,
    highlightedColorId,
    onPlayingCellClick,
    onVerifyCellClick,
    onVerifyCellRightClick,
  }: Props = $props();

  let hoveredCoord = $state<Coord | null>(null);

  const rows = $derived(game.blueprint.rows);
  const cols = $derived(game.blueprint.cols);
  const blockedSet = $derived(createBlockedSet(game.blueprint));
  const pendingSet = $derived(new Set(game.pendingCoords));
  const singletonSet = $derived(new Set(getSingletonColorIds(game.pieces)));
  const pathOwnerMap = $derived(getPathCellOwnerMap(game.paths));

  const statusByColor = $derived.by(() => {
    const map = new Map<number, VerificationEvaluation['colors'][number]>();
    for (const item of evaluation.colors) {
      map.set(item.colorId, item);
    }
    return map;
  });

  const reachableSet = $derived.by((): Set<CellKey> => {
    if (
      game.phase !== 'verifying' ||
      verifyTool !== 'draw' ||
      placingSingletonColorId !== null ||
      activeDrawColorId === null
    ) {
      return new Set<CellKey>();
    }
    return getReachableLineCells(game, activeDrawColorId);
  });

  const previewSegment = $derived.by((): Coord[] => {
    if (
      !hoveredCoord ||
      game.phase !== 'verifying' ||
      verifyTool !== 'draw' ||
      placingSingletonColorId !== null ||
      activeDrawColorId === null
    ) {
      return [];
    }
    return getPreviewSegment(game, activeDrawColorId, hoveredCoord);
  });

  const previewSet = $derived(new Set(previewSegment.map((cell) => coordKey(cell))));

  const activeTipCoord = $derived.by((): Coord | null => {
    if (game.phase !== 'verifying' || activeDrawColorId === null) {
      return null;
    }
    const path = game.paths[activeDrawColorId];
    if (!path || path.length === 0) {
      return null;
    }
    return path[path.length - 1];
  });

  const activeTipKey = $derived(activeTipCoord ? coordKey(activeTipCoord) : null);

  const activeColorHex = $derived(
    activeDrawColorId !== null ? getPieceColor(activeDrawColorId).hex : '#3b82f6',
  );

  const previewEndCoord = $derived(
    previewSegment.length >= 2 ? previewSegment[previewSegment.length - 1] : null,
  );

  const rowIndices = $derived(Array.from({ length: rows }, (_, i) => i));
  const colIndices = $derived(Array.from({ length: cols }, (_, i) => i));

  const renderedPaths = $derived.by(() => {
    const list: Array<{
      colorId: number;
      points: string;
      hex: string;
      glow: string;
      isShortConnected: boolean;
      isValid: boolean;
      isHighlighted: boolean;
      isDimmed: boolean;
    }> = [];

    for (const [colorKey, coords] of Object.entries(game.paths)) {
      if (!coords || coords.length < 2) {
        continue;
      }
      const colorId = Number(colorKey);
      const color = getPieceColor(colorId);
      const status = statusByColor.get(colorId);
      const points = coords
        .map((cell) => `${cell.col * 100 + 50},${cell.row * 100 + 50}`)
        .join(' ');
      const focusColor = highlightedColorId ?? activeDrawColorId;
      list.push({
        colorId,
        points,
        hex: color.hex,
        glow: color.glow,
        isShortConnected: Boolean(status?.connected && !status.lengthValid),
        isValid: Boolean(status?.valid),
        isHighlighted: focusColor === colorId,
        isDimmed: focusColor !== null && focusColor !== colorId,
      });
    }
    return list;
  });

  const previewPoints = $derived(
    previewSegment
      .map((cell) => `${cell.col * 100 + 50},${cell.row * 100 + 50}`)
      .join(' '),
  );

  const previewProjectedLength = $derived.by(() => {
    if (activeDrawColorId === null || previewSegment.length < 2) {
      return 0;
    }
    const existingLen = game.paths[activeDrawColorId]?.length ?? 0;
    return existingLen + previewSegment.length - 1;
  });

  function canShowPlayGhost(coord: Coord): boolean {
    if (game.phase !== 'playing' || selectedColorId === null || !hoveredCoord) {
      return false;
    }
    if (hoveredCoord.row !== coord.row || hoveredCoord.col !== coord.col) {
      return false;
    }
    return canPlaceTurnPiece(game, coord, selectedColorId).ok;
  }

  function canShowVerifyGhost(coord: Coord): boolean {
    if (game.phase !== 'verifying' || placingSingletonColorId === null || !hoveredCoord) {
      return false;
    }
    if (hoveredCoord.row !== coord.row || hoveredCoord.col !== coord.col) {
      return false;
    }
    return canPlaceVerifyPiece(game, coord, placingSingletonColorId).ok;
  }

  function handleCellClick(coord: Coord) {
    if (game.phase === 'playing') {
      onPlayingCellClick(coord);
    } else if (game.phase === 'verifying') {
      onVerifyCellClick(coord);
    }
  }

  function handleContextMenu(event: MouseEvent, coord: Coord) {
    if (game.phase !== 'verifying') {
      return;
    }
    event.preventDefault();
    onVerifyCellRightClick(coord);
  }
</script>

<BoardViewport {rows} {cols}>
<div class="board-shell">
  <div class="col-headers" style="grid-template-columns: 24px repeat({cols}, minmax(0, 1fr));">
    <div></div>
    {#each colIndices as col (col)}
      <div class="axis-label tabular">{col + 1}</div>
    {/each}
  </div>

  <div class="board-body">
    <div class="row-headers" style="grid-template-rows: repeat({rows}, minmax(0, 1fr));">
      {#each rowIndices as row (row)}
        <div class="axis-label tabular">{row + 1}</div>
      {/each}
    </div>

    <div
      class="grid-stage"
      class:erase-cursor={game.phase === 'verifying' && verifyTool === 'erase' && placingSingletonColorId === null}
      style="aspect-ratio: {cols} / {rows}; --active-hex: {activeColorHex};"
      role="region"
      aria-label="Color Link 棋盘"
      onpointerleave={() => (hoveredCoord = null)}
    >
      <div
        class="cells-grid"
        style="grid-template-columns: repeat({cols}, minmax(0, 1fr)); grid-template-rows: repeat({rows}, minmax(0, 1fr));"
      >
        {#each rowIndices as row (row)}
          {#each colIndices as col (col)}
            {@const key = cellKey(row, col)}
            {@const coord = { row, col }}
            {@const isBlocked = blockedSet.has(key)}
            {@const piece = game.pieces[key]}
            {@const isPending = pendingSet.has(key)}
            {@const isReachable = reachableSet.has(key)}
            {@const isActiveTip = activeTipKey === key}
            {@const isInPreview = previewSet.has(key)}
            {@const pathOwner = pathOwnerMap.get(key)}
            {@const isErasableHover =
              game.phase === 'verifying' &&
              verifyTool === 'erase' &&
              placingSingletonColorId === null &&
              hoveredCoord?.row === row &&
              hoveredCoord?.col === col &&
              (pathOwner !== undefined || piece?.source === 'verify')}
            {@const showPlayGhost = canShowPlayGhost(coord)}
            {@const showVerifyGhost = canShowVerifyGhost(coord)}
            {@const focusColor = highlightedColorId ?? activeDrawColorId}
            <button
              type="button"
              class="cell"
              class:blocked={isBlocked}
              class:reachable={isReachable}
              class:erasable-hover={isErasableHover}
              disabled={isBlocked}
              aria-label="第 {row + 1} 行第 {col + 1} 列"
              onpointerenter={(event) => (hoveredCoord = event.pointerType === 'mouse' ? coord : null)}
              onclick={() => handleCellClick(coord)}
              oncontextmenu={(event) => handleContextMenu(event, coord)}
            >
              {#if isReachable && !piece && !isInPreview}
                <span
                  class="reach-dot"
                  style="background: {activeColorHex};"
                ></span>
              {/if}

              {#if piece}
                {@const pColor = getPieceColor(piece.colorId)}
                {@const isSingletonVerify = game.phase === 'verifying' && singletonSet.has(piece.colorId)}
                {@const isVerifyAdded = piece.source === 'verify'}
                {@const isPieceDimmed = focusColor !== null && focusColor !== piece.colorId && !isReachable}
                {@const isPieceHighlighted = focusColor === piece.colorId}
                <span
                  class="piece"
                  class:pending={isPending}
                  class:verify-added={isVerifyAdded}
                  class:singleton-pulse={isSingletonVerify}
                  class:highlighted={isPieceHighlighted}
                  class:active-tip-piece={isActiveTip}
                  class:dimmed={isPieceDimmed}
                  style="background: {pColor.hex}; color: {pColor.textColor}; --piece-hex: {pColor.hex};"
                >
                  <span class="piece-letter">{pColor.letter}</span>
                  {#if isVerifyAdded}
                    <span class="verify-tag">+</span>
                  {/if}
                </span>
              {:else if showPlayGhost && selectedColorId !== null}
                {@const gColor = getPieceColor(selectedColorId)}
                <span
                  class="piece ghost"
                  style="background: {gColor.hex}; color: {gColor.textColor};"
                >
                  <span class="piece-letter">{gColor.letter}</span>
                </span>
              {:else if showVerifyGhost && placingSingletonColorId !== null}
                {@const vColor = getPieceColor(placingSingletonColorId)}
                <span
                  class="piece ghost"
                  style="background: {vColor.hex}; color: {vColor.textColor};"
                >
                  <span class="piece-letter">{vColor.letter}</span>
                </span>
              {/if}
            </button>
          {/each}
        {/each}
      </div>

      <svg
        class="paths-svg"
        viewBox="0 0 {cols * 100} {rows * 100}"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        {#each renderedPaths as item (item.colorId)}
          <g class:path-dimmed={item.isDimmed}>
            <polyline
              points={item.points}
              fill="none"
              stroke={item.hex}
              stroke-width={item.isHighlighted ? 34 : 28}
              stroke-opacity={item.isValid ? 0.16 : 0.12}
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            <polyline
              points={item.points}
              fill="none"
              stroke={item.hex}
              stroke-width={item.isHighlighted ? 22 : 18}
              stroke-opacity={item.isShortConnected ? 0.58 : 0.94}
              stroke-linecap="round"
              stroke-linejoin="round"
            />
            {#if item.isShortConnected}
              <polyline
                points={item.points}
                fill="none"
                stroke="#ffffff"
                stroke-width="5"
                stroke-opacity="0.92"
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-dasharray="10 14"
              />
            {/if}
          </g>
        {/each}

        {#if previewSegment.length >= 2 && activeDrawColorId !== null}
          {@const pColor = getPieceColor(activeDrawColorId)}
          <polyline
            points={previewPoints}
            fill="none"
            stroke={pColor.hex}
            stroke-width="20"
            stroke-opacity="0.2"
            stroke-linecap="round"
            stroke-linejoin="round"
          />
          <polyline
            points={previewPoints}
            fill="none"
            stroke={pColor.hex}
            stroke-width="5"
            stroke-opacity="0.9"
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-dasharray="10 14"
          />
          {#if previewEndCoord && !game.pieces[coordKey(previewEndCoord)]}
            <circle
              cx={previewEndCoord.col * 100 + 50}
              cy={previewEndCoord.row * 100 + 50}
              r="11"
              fill="#ffffff"
              stroke={pColor.hex}
              stroke-width="4.5"
            />
          {/if}
        {/if}

        {#if activeTipCoord && activeTipKey && !game.pieces[activeTipKey] && activeDrawColorId !== null}
          {@const tipColor = getPieceColor(activeDrawColorId)}
          <circle
            cx={activeTipCoord.col * 100 + 50}
            cy={activeTipCoord.row * 100 + 50}
            r="14"
            fill="#ffffff"
            stroke={tipColor.hex}
            stroke-width="6"
          />
        {/if}
      </svg>

      {#if previewSegment.length >= 2 && hoveredCoord && activeDrawColorId !== null}
        <div class="length-float tabular">
          {getPieceColor(activeDrawColorId).letter} 延伸后共 <strong>{previewProjectedLength}</strong> 格
          {#if previewProjectedLength < game.config.minPathLength}
            （需 ≥ {game.config.minPathLength}）
          {/if}
        </div>
      {/if}
    </div>
  </div>
</div>
</BoardViewport>

<style>
  .board-shell {
    width: 100%;
    max-width: min(67vh, 660px);
    margin: 0 auto;
    user-select: none;
  }

  .col-headers {
    display: grid;
    margin-bottom: 4px;
  }

  .board-body {
    display: grid;
    grid-template-columns: 24px minmax(0, 1fr);
    align-items: stretch;
  }

  .row-headers {
    display: grid;
    padding-right: 4px;
  }

  .axis-label {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.7rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .grid-stage {
    position: relative;
    width: 100%;
    align-self: start;
    background: #ffffff;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .grid-stage.erase-cursor {
    border-color: #e88198;
  }

  .cells-grid {
    position: absolute;
    inset: 0;
    z-index: 2;
    display: grid;
  }

  .paths-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    z-index: 1;
    pointer-events: none;
  }

  .path-dimmed {
    opacity: 0.28;
    transition: opacity 0.15s ease;
  }

  .cell {
    position: relative;
    width: 100%;
    height: 100%;
    padding: 0;
    box-shadow: inset -1px -1px 0 var(--border-subtle);
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    transition: background-color 0.1s ease;
    touch-action: manipulation;
  }

  .cell:hover:not(:disabled) {
    background: rgba(15, 23, 42, 0.035);
  }

  .cell:focus-visible {
    outline-offset: -3px;
    z-index: 1;
  }

  .cell.blocked {
    background: #111827;
    box-shadow: inset -1px -1px 0 rgb(255 255 255 / 9%);
    opacity: 1;
    cursor: not-allowed;
  }

  .cell.reachable {
    background: color-mix(in srgb, var(--active-hex, #3b82f6) 6%, transparent);
  }

  .cell.reachable:hover {
    background: color-mix(in srgb, var(--active-hex, #3b82f6) 12%, transparent);
  }

  .cell.erasable-hover {
    background: rgba(244, 63, 94, 0.14) !important;
    box-shadow: inset 0 0 0 2px #f43f5e;
  }

  .reach-dot {
    width: 11%;
    height: 11%;
    border-radius: 50%;
    opacity: 0.42;
    pointer-events: none;
    transition: transform 0.12s ease, opacity 0.12s ease;
  }

  .cell.reachable:hover .reach-dot {
    transform: scale(1.25);
    opacity: 0.7;
  }

  .piece {
    position: relative;
    width: 67%;
    height: 67%;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    box-shadow: 0 1px 2px rgb(17 19 24 / 12%);
    transition:
      transform 0.12s ease,
      opacity 0.15s ease,
      box-shadow 0.15s ease;
    container-type: size;
  }

  .piece-letter {
    font-size: clamp(10px, 52cqmin, 24px);
    line-height: 1;
    letter-spacing: -0.02em;
  }

  .piece.pending {
    outline: 1px dashed var(--text-secondary);
    outline-offset: 2px;
    transform: scale(1.04);
  }

  .piece.verify-added {
    outline: 1px dashed var(--player-p0-ink);
    outline-offset: 2px;
  }

  .piece.singleton-pulse {
    box-shadow: 0 0 0 2px #ffffff, 0 0 0 3px #e4a34b;
  }

  .piece.highlighted {
    transform: scale(1.06);
    box-shadow: 0 0 0 2px #ffffff, 0 0 0 3px var(--piece-hex);
  }

  .piece.active-tip-piece {
    transform: scale(1.08);
    box-shadow: 0 0 0 2px #ffffff, 0 0 0 4px var(--piece-hex);
  }

  .piece.dimmed {
    opacity: 0.36;
  }

  .piece.ghost {
    opacity: 0.55;
    transform: scale(0.92);
    pointer-events: none;
    outline: 2px dashed rgba(15, 23, 42, 0.35);
  }

  .verify-tag {
    position: absolute;
    top: -4px;
    right: -4px;
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background: #ffffff;
    color: #d97706;
    border: 1.5px solid #f59e0b;
    font-size: 10px;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
    line-height: 1;
    box-shadow: 0 1px 3px rgba(15, 23, 42, 0.14);
  }

  .length-float {
    position: absolute;
    bottom: 10px;
    right: 10px;
    z-index: 4;
    padding: 5px 12px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid var(--border-strong);
    font-size: 0.76rem;
    color: var(--text-primary);
    box-shadow: 0 4px 14px rgba(15, 23, 42, 0.12);
    pointer-events: none;
  }

  @media (max-width: 680px), (hover: none) and (pointer: coarse) and (max-width: 960px) {
    .board-shell {
      max-width: none;
    }
  }
</style>
