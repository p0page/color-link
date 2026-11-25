<script lang="ts">
  import { untrack } from 'svelte';
  import { getPieceColor, PIECE_COLORS } from '../lib/colors';
  import { cellKey, coordKey, parseCellKey } from '../lib/engine';
  import { generateId, sanitizeBlueprint } from '../lib/storage';
  import type { BoardBlueprint, CellKey, SavedBoard } from '../lib/types';
  import BoardPreview from './BoardPreview.svelte';

  interface Props {
    initialBlueprint: BoardBlueprint;
    initialBoardId: string | null;
    initialBoardName: string;
    savedBoards: SavedBoard[];
    onSaveBoard: (board: SavedBoard) => void;
    onDeleteBoard: (id: string) => void;
    onApply: (blueprint: BoardBlueprint, boardName: string, boardId: string | null) => void;
    onClose: () => void;
  }

  let {
    initialBlueprint,
    initialBoardId,
    initialBoardName,
    savedBoards,
    onSaveBoard,
    onDeleteBoard,
    onApply,
    onClose,
  }: Props = $props();

  const seed = untrack(() => ({
    blueprint: sanitizeBlueprint(initialBlueprint),
    boardId: initialBoardId,
    boardName: initialBoardName,
  }));

  function buildBlockedRecord(bp: BoardBlueprint): Record<CellKey, true> {
    const rec: Record<CellKey, true> = {};
    for (const c of bp.blockedCells) {
      rec[coordKey(c)] = true;
    }
    return rec;
  }

  function buildPresetRecord(bp: BoardBlueprint): Record<CellKey, number> {
    const rec: Record<CellKey, number> = {};
    for (const item of bp.presetPieces) {
      rec[coordKey(item.coord)] = item.colorId;
    }
    return rec;
  }

  let rows = $state(seed.blueprint.rows);
  let cols = $state(seed.blueprint.cols);
  let blockedMap = $state<Record<CellKey, true>>(buildBlockedRecord(seed.blueprint));
  let presetMap = $state<Record<CellKey, number>>(buildPresetRecord(seed.blueprint));

  let editingBoardId = $state<string | null>(seed.boardId);
  let boardName = $state(seed.boardName === '空白棋盘' ? '' : seed.boardName);
  let tool = $state<'block' | 'piece' | 'erase'>('block');
  let selectedColorId = $state(0);
  let dragAction = $state<'block' | 'unblock' | 'erase' | null>(null);
  let notice = $state<string | null>(null);
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;

  function showNotice(msg: string) {
    notice = msg;
    if (noticeTimer) {
      clearTimeout(noticeTimer);
    }
    noticeTimer = setTimeout(() => {
      notice = null;
    }, 2400);
  }

  const rowIndices = $derived(Array.from({ length: rows }, (_, i) => i));
  const colIndices = $derived(Array.from({ length: cols }, (_, i) => i));

  const colorCounts = $derived.by(() => {
    const map = new Map<number, number>();
    for (const colorId of Object.values(presetMap)) {
      map.set(colorId, (map.get(colorId) ?? 0) + 1);
    }
    return map;
  });

  const blockedCount = $derived(Object.keys(blockedMap).length);
  const presetCount = $derived(Object.keys(presetMap).length);

  function currentBlueprint(): BoardBlueprint {
    const blockedCells = Object.keys(blockedMap).map((key) => parseCellKey(key as CellKey));
    const presetPieces = Object.entries(presetMap).map(([key, colorId]) => ({
      coord: parseCellKey(key as CellKey),
      colorId,
    }));
    return sanitizeBlueprint({ rows, cols, blockedCells, presetPieces });
  }

  function applyDimensions(nextRowsRaw: number, nextColsRaw: number) {
    const nextRows = Math.min(20, Math.max(4, Math.floor(nextRowsRaw) || 10));
    const nextCols = Math.min(20, Math.max(4, Math.floor(nextColsRaw) || 10));
    rows = nextRows;
    cols = nextCols;

    const nextBlocked: Record<CellKey, true> = {};
    for (const key of Object.keys(blockedMap) as CellKey[]) {
      const coord = parseCellKey(key);
      if (coord.row < nextRows && coord.col < nextCols) {
        nextBlocked[key] = true;
      }
    }
    blockedMap = nextBlocked;

    const nextPresets: Record<CellKey, number> = {};
    for (const [key, colorId] of Object.entries(presetMap) as Array<[CellKey, number]>) {
      const coord = parseCellKey(key);
      if (coord.row < nextRows && coord.col < nextCols) {
        nextPresets[key] = colorId;
      }
    }
    presetMap = nextPresets;
  }

  function setCellBlocked(key: CellKey, blocked: boolean) {
    if (blocked) {
      if (!blockedMap[key]) {
        blockedMap = { ...blockedMap, [key]: true };
      }
      if (presetMap[key] !== undefined) {
        const nextPresets = { ...presetMap };
        delete nextPresets[key];
        presetMap = nextPresets;
      }
    } else if (blockedMap[key]) {
      const nextBlocked = { ...blockedMap };
      delete nextBlocked[key];
      blockedMap = nextBlocked;
    }
  }

  function eraseCell(key: CellKey) {
    if (blockedMap[key]) {
      const nextBlocked = { ...blockedMap };
      delete nextBlocked[key];
      blockedMap = nextBlocked;
    }
    if (presetMap[key] !== undefined) {
      const nextPresets = { ...presetMap };
      delete nextPresets[key];
      presetMap = nextPresets;
    }
  }

  function handleCellMouseDown(event: MouseEvent, row: number, col: number) {
    if (event.button !== 0) {
      return;
    }
    event.preventDefault();
    const key = cellKey(row, col);

    if (tool === 'block') {
      const shouldBlock = !blockedMap[key];
      dragAction = shouldBlock ? 'block' : 'unblock';
      setCellBlocked(key, shouldBlock);
      return;
    }

    if (tool === 'erase') {
      dragAction = 'erase';
      eraseCell(key);
      return;
    }

    // Preset piece placement
    const existingColor = presetMap[key];
    if (existingColor === selectedColorId) {
      const nextPresets = { ...presetMap };
      delete nextPresets[key];
      presetMap = nextPresets;
      return;
    }

    const count = colorCounts.get(selectedColorId) ?? 0;
    if (count >= 2) {
      const letter = getPieceColor(selectedColorId).letter;
      showNotice(`棋子 ${letter} 最多只能预设 2 枚（点击已放棋子或用橡皮擦可移除）`);
      return;
    }

    if (blockedMap[key]) {
      const nextBlocked = { ...blockedMap };
      delete nextBlocked[key];
      blockedMap = nextBlocked;
    }
    presetMap = {
      ...presetMap,
      [key]: selectedColorId,
    };
  }

  function handleCellMouseEnter(row: number, col: number) {
    if (!dragAction) {
      return;
    }
    const key = cellKey(row, col);
    if (dragAction === 'block') {
      setCellBlocked(key, true);
    } else if (dragAction === 'unblock') {
      setCellBlocked(key, false);
    } else if (dragAction === 'erase') {
      eraseCell(key);
    }
  }

  function handleCellContextMenu(event: MouseEvent, row: number, col: number) {
    event.preventDefault();
    eraseCell(cellKey(row, col));
  }

  function handleWindowMouseUp() {
    dragAction = null;
  }

  function clearObstacles() {
    blockedMap = {};
  }

  function clearPresets() {
    presetMap = {};
  }

  function clearAll() {
    blockedMap = {};
    presetMap = {};
  }

  function handleSave(asNew: boolean) {
    const bp = currentBlueprint();
    const defaultName = `自定义棋盘 ${bp.rows}×${bp.cols}`;
    const finalName = boardName.trim() || defaultName;
    const id = asNew || !editingBoardId ? generateId('board') : editingBoardId;
    const board: SavedBoard = {
      id,
      name: finalName,
      updatedAt: new Date().toISOString(),
      blueprint: bp,
    };
    editingBoardId = id;
    boardName = finalName;
    onSaveBoard(board);
    showNotice(`已保存棋盘「${finalName}」到本地`);
  }

  function handleLoadSaved(board: SavedBoard) {
    const clean = sanitizeBlueprint(board.blueprint);
    rows = clean.rows;
    cols = clean.cols;
    blockedMap = buildBlockedRecord(clean);
    presetMap = buildPresetRecord(clean);
    editingBoardId = board.id;
    boardName = board.name;
    showNotice(`已载入棋盘「${board.name}」`);
  }

  function handleDeleteSaved(board: SavedBoard) {
    onDeleteBoard(board.id);
    if (editingBoardId === board.id) {
      editingBoardId = null;
    }
    showNotice(`已删除棋盘「${board.name}」`);
  }

  function handleApplyToMatch() {
    const bp = currentBlueprint();
    const isBlank = bp.blockedCells.length === 0 && bp.presetPieces.length === 0;
    const resolvedName = boardName.trim() || (isBlank ? '空白棋盘' : `自定义棋盘 ${bp.rows}×${bp.cols}`);
    onApply(bp, resolvedName, isBlank ? null : editingBoardId);
  }
</script>

<svelte:window onmouseup={handleWindowMouseUp} />

<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label="棋盘编辑器">
  <div class="editor-shell">
    <header class="editor-header">
      <div>
        <h2>棋盘编辑器</h2>
        <p class="subtitle">自由绘制黑色障碍块与预先放置 A–Z 棋子，可保存到本地重复使用</p>
      </div>
      <div class="header-actions">
        <button type="button" class="btn btn-ghost small" onclick={onClose}>取消</button>
        <button type="button" class="btn btn-primary small" onclick={handleApplyToMatch}>
          应用到当前对局
        </button>
      </div>
    </header>

    <div class="editor-body">
      <section class="canvas-pane">
        <div class="toolbar-row">
          <div class="tool-group">
            <button
              type="button"
              class="tool-btn"
              class:active={tool === 'block'}
              onclick={() => (tool = 'block')}
            >
              <span class="swatch-black"></span>
              障碍（黑块）
            </button>
            <button
              type="button"
              class="tool-btn"
              class:active={tool === 'piece'}
              onclick={() => (tool = 'piece')}
            >
              <span
                class="swatch-piece"
                style="background: {getPieceColor(selectedColorId).hex}; color: {getPieceColor(selectedColorId).textColor};"
              >
                {getPieceColor(selectedColorId).letter}
              </span>
              预设棋子
            </button>
            <button
              type="button"
              class="tool-btn"
              class:active={tool === 'erase'}
              onclick={() => (tool = 'erase')}
            >
              橡皮擦
            </button>
          </div>

          <div class="size-controls">
            <button type="button" class="chip" class:active={rows === 8 && cols === 8} onclick={() => applyDimensions(8, 8)}>8×8</button>
            <button type="button" class="chip" class:active={rows === 10 && cols === 10} onclick={() => applyDimensions(10, 10)}>10×10</button>
            <button type="button" class="chip" class:active={rows === 12 && cols === 12} onclick={() => applyDimensions(12, 12)}>12×12</button>
            <label class="dim-field">
              <span>行</span>
              <input
                type="number"
                min="4"
                max="20"
                value={rows}
                onchange={(e) => applyDimensions(Number((e.currentTarget as HTMLInputElement).value), cols)}
              />
            </label>
            <span class="dim-x">×</span>
            <label class="dim-field">
              <span>列</span>
              <input
                type="number"
                min="4"
                max="20"
                value={cols}
                onchange={(e) => applyDimensions(rows, Number((e.currentTarget as HTMLInputElement).value))}
              />
            </label>
          </div>
        </div>

        <div class="editor-board-wrap">
          <div class="col-headers" style="grid-template-columns: 22px repeat({cols}, minmax(0, 1fr));">
            <div></div>
            {#each colIndices as col (col)}
              <div class="axis tabular">{col + 1}</div>
            {/each}
          </div>

          <div class="board-row-wrap">
            <div class="row-headers" style="grid-template-rows: repeat({rows}, minmax(0, 1fr));">
              {#each rowIndices as row (row)}
                <div class="axis tabular">{row + 1}</div>
              {/each}
            </div>

            <div
              class="editor-grid"
              style="aspect-ratio: {cols} / {rows}; grid-template-columns: repeat({cols}, minmax(0, 1fr)); grid-template-rows: repeat({rows}, minmax(0, 1fr));"
            >
              {#each rowIndices as row (row)}
                {#each colIndices as col (col)}
                  {@const key = cellKey(row, col)}
                  {@const isBlocked = Boolean(blockedMap[key])}
                  {@const pieceColorId = presetMap[key]}
                  <button
                    type="button"
                    class="e-cell"
                    class:blocked={isBlocked}
                    aria-label="第 {row + 1} 行第 {col + 1} 列"
                    onmousedown={(e) => handleCellMouseDown(e, row, col)}
                    onmouseenter={() => handleCellMouseEnter(row, col)}
                    oncontextmenu={(e) => handleCellContextMenu(e, row, col)}
                  >
                    {#if pieceColorId !== undefined}
                      {@const pColor = getPieceColor(pieceColorId)}
                      <span
                        class="e-piece"
                        style="background: {pColor.hex}; color: {pColor.textColor};"
                      >
                        <span class="e-piece-letter">{pColor.letter}</span>
                      </span>
                    {/if}
                  </button>
                {/each}
              {/each}
            </div>
          </div>
        </div>

        <div class="canvas-footer">
          <div class="stats tabular">
            <span>尺寸 <strong>{rows}×{cols}</strong></span>
            <span>黑块障碍 <strong>{blockedCount}</strong></span>
            <span>预设棋子 <strong>{presetCount}</strong></span>
            <span>剩余空格 <strong>{Math.max(0, rows * cols - blockedCount - presetCount)}</strong></span>
          </div>
          <div class="clear-btns">
            <button type="button" class="mini-btn" onclick={clearObstacles} disabled={blockedCount === 0}>清空障碍</button>
            <button type="button" class="mini-btn" onclick={clearPresets} disabled={presetCount === 0}>清空棋子</button>
            <button type="button" class="mini-btn danger" onclick={clearAll} disabled={blockedCount === 0 && presetCount === 0}>清空全部</button>
          </div>
        </div>

        <div class="tip-line">
          {#if tool === 'block'}
            提示：点击或按住鼠标拖动可批量绘制/取消黑色障碍块；右键任意格可直接擦除。
          {:else if tool === 'piece'}
            提示：在右侧选择字母颜色后点击空格放置预设棋子（每种颜色最多 2 枚）；再次点击同色棋子或右键可移除。
          {:else}
            提示：点击或拖动可擦除黑块障碍或预设棋子。
          {/if}
        </div>

        {#if notice}
          <div class="editor-notice">{notice}</div>
        {/if}
      </section>

      <aside class="side-pane">
        <div class="panel-card">
          <div class="panel-title">选择预设棋子颜色（A–Z）</div>
          <div class="mini-palette">
            {#each PIECE_COLORS as color (color.id)}
              {@const placed = colorCounts.get(color.id) ?? 0}
              <button
                type="button"
                class="pal-item"
                class:selected={tool === 'piece' && selectedColorId === color.id}
                class:full={placed >= 2}
                onclick={() => {
                  selectedColorId = color.id;
                  tool = 'piece';
                }}
                title="{color.letter}：已预设 {placed}/2 枚"
              >
                <span class="pal-dot" style="background: {color.hex}; color: {color.textColor};">
                  {color.letter}
                </span>
                <span class="pal-count tabular">{placed}/2</span>
              </button>
            {/each}
          </div>
        </div>

        <div class="panel-card">
          <div class="panel-title">保存棋盘到本地</div>
          <input
            type="text"
            maxlength="24"
            placeholder="输入棋盘名称（如：十字迷宫）"
            bind:value={boardName}
            class="name-input"
          />
          <div class="save-btn-row">
            <button type="button" class="btn btn-ghost small" onclick={() => handleSave(false)}>
              {editingBoardId ? '更新保存' : '保存到本地'}
            </button>
            {#if editingBoardId}
              <button type="button" class="btn btn-ghost small" onclick={() => handleSave(true)}>
                另存为新棋盘
              </button>
            {/if}
          </div>
        </div>

        <div class="panel-card saved-list-card">
          <div class="panel-title-row">
            <span class="panel-title">已保存的棋盘（{savedBoards.length}）</span>
          </div>
          {#if savedBoards.length === 0}
            <div class="empty-saved">暂无已保存棋盘，编辑完成后点击上方保存即可复用。</div>
          {:else}
            <div class="saved-list">
              {#each savedBoards as item (item.id)}
                <div class="saved-item" class:active={editingBoardId === item.id}>
                  <BoardPreview blueprint={item.blueprint} size={46} />
                  <div class="saved-info">
                    <div class="saved-name">{item.name}</div>
                    <div class="saved-meta tabular">
                      {item.blueprint.rows}×{item.blueprint.cols} · {item.blueprint.blockedCells.length} 黑块 · {item.blueprint.presetPieces.length} 预设子
                    </div>
                  </div>
                  <div class="saved-actions">
                    <button type="button" class="mini-btn" onclick={() => handleLoadSaved(item)}>载入</button>
                    <button type="button" class="mini-btn danger" onclick={() => handleDeleteSaved(item)}>删</button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </aside>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    background: var(--modal-overlay);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .editor-shell {
    width: 100%;
    max-width: 1120px;
    max-height: 92vh;
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }

  .editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 14px 20px;
    border-bottom: 1px solid var(--border-subtle);
    background: #ffffff;
  }

  h2 {
    margin: 0;
    font-size: 1.2rem;
    color: var(--text-primary);
  }

  .subtitle {
    margin: 3px 0 0;
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  .header-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
  }

  .btn.small {
    padding: 7px 12px;
    font-size: 0.82rem;
  }

  .editor-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 16px;
    padding: 16px 20px 18px;
    overflow-y: auto;
    background: var(--bg-base);
    flex: 1;
  }

  .canvas-pane {
    display: flex;
    flex-direction: column;
    gap: 10px;
    min-width: 0;
  }

  .toolbar-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
    padding: 8px 10px;
    border-radius: var(--radius-md);
    background: #ffffff;
    border: 1px solid var(--border-subtle);
  }

  .tool-group {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 11px;
    border-radius: var(--radius-pill);
    background: var(--bg-elevated);
    border: 1.5px solid var(--border-subtle);
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-secondary);
    transition: all 0.12s ease;
  }

  .tool-btn:hover {
    border-color: var(--border-strong);
    color: var(--text-primary);
    background: #ffffff;
  }

  .tool-btn.active {
    background: var(--ink-dark);
    border-color: var(--ink-dark);
    color: #ffffff;
  }

  .swatch-black {
    width: 14px;
    height: 14px;
    border-radius: 3px;
    background: #111827;
    display: inline-block;
  }

  .swatch-piece {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    font-size: 0.68rem;
    font-weight: 900;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  .size-controls {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .chip {
    padding: 3px 8px;
    border-radius: 999px;
    font-size: 0.74rem;
    font-weight: 600;
    background: #ffffff;
    border: 1px solid var(--border-subtle);
    color: var(--text-secondary);
  }

  .chip.active {
    background: #eff6ff;
    border-color: #3b82f6;
    color: #1d4ed8;
  }

  .dim-field {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 0.76rem;
    color: var(--text-secondary);
  }

  .dim-field input {
    width: 48px;
    padding: 4px 6px;
    border-radius: 6px;
    border: 1px solid var(--border-strong);
    background: #ffffff;
    font-size: 0.82rem;
    text-align: center;
  }

  .dim-x {
    font-size: 0.76rem;
    color: var(--text-muted);
    font-weight: 700;
  }

  .editor-board-wrap {
    width: 100%;
    max-width: min(56vh, 520px);
    margin: 0 auto;
    user-select: none;
  }

  .col-headers {
    display: grid;
    margin-bottom: 3px;
  }

  .board-row-wrap {
    display: grid;
    grid-template-columns: 22px minmax(0, 1fr);
    align-items: stretch;
  }

  .row-headers {
    display: grid;
    padding-right: 4px;
  }

  .axis {
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.68rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .editor-grid {
    width: 100%;
    display: grid;
    background: #ffffff;
    border: 1.5px solid var(--border-strong);
    border-radius: var(--radius-md);
    overflow: hidden;
    box-shadow: var(--shadow-md);
  }

  .e-cell {
    position: relative;
    width: 100%;
    height: 100%;
    padding: 0;
    border-right: 1px solid #e2e8f0;
    border-bottom: 1px solid #e2e8f0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    transition: background-color 0.08s ease;
  }

  .e-cell:hover {
    background: rgba(59, 130, 246, 0.08);
  }

  .e-cell.blocked {
    background: #111827;
    border-color: #1f2937;
    box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
  }

  .e-cell.blocked:hover {
    background: #1f2937;
  }

  .e-piece {
    width: 74%;
    height: 74%;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    box-shadow:
      0 2px 5px rgba(15, 23, 42, 0.18),
      inset 0 0 0 1px rgba(15, 23, 42, 0.08);
    container-type: size;
  }

  .e-piece-letter {
    font-size: clamp(9px, 52cqmin, 22px);
    line-height: 1;
  }

  .canvas-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
    padding: 8px 12px;
    border-radius: var(--radius-sm);
    background: #ffffff;
    border: 1px solid var(--border-subtle);
  }

  .stats {
    display: flex;
    gap: 12px;
    flex-wrap: wrap;
    font-size: 0.78rem;
    color: var(--text-secondary);
  }

  .stats strong {
    color: var(--text-primary);
  }

  .clear-btns {
    display: flex;
    gap: 6px;
  }

  .mini-btn {
    padding: 4px 9px;
    border-radius: 6px;
    font-size: 0.75rem;
    font-weight: 700;
    background: #f1f5f9;
    color: var(--text-secondary);
  }

  .mini-btn:hover:not(:disabled) {
    background: #e2e8f0;
    color: var(--text-primary);
  }

  .mini-btn.danger {
    background: #fff1f2;
    color: #be123c;
  }

  .mini-btn.danger:hover:not(:disabled) {
    background: #ffe4e6;
  }

  .tip-line {
    font-size: 0.76rem;
    color: var(--text-muted);
    text-align: center;
  }

  .editor-notice {
    align-self: center;
    padding: 5px 12px;
    border-radius: 999px;
    background: #0f172a;
    color: #ffffff;
    font-size: 0.78rem;
    font-weight: 600;
  }

  .side-pane {
    display: flex;
    flex-direction: column;
    gap: 12px;
    min-width: 0;
  }

  .panel-card {
    background: #ffffff;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .panel-title {
    font-size: 0.82rem;
    font-weight: 800;
    color: var(--text-primary);
  }

  .mini-palette {
    display: grid;
    grid-template-columns: repeat(6, minmax(0, 1fr));
    gap: 5px;
  }

  .pal-item {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 4px 2px;
    border-radius: 8px;
    background: #ffffff;
    border: 1.5px solid var(--border-subtle);
  }

  .pal-item:hover {
    background: #f8fafc;
    border-color: var(--border-strong);
  }

  .pal-item.selected {
    border-color: #2563eb;
    background: #eff6ff;
  }

  .pal-item.full {
    opacity: 0.55;
  }

  .pal-dot {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 0.76rem;
    font-weight: 800;
  }

  .pal-count {
    font-size: 0.64rem;
    font-weight: 700;
    color: var(--text-muted);
  }

  .name-input {
    width: 100%;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--border-strong);
    background: #ffffff;
    color: var(--text-primary);
    font-size: 0.88rem;
    outline: none;
  }

  .name-input:focus {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.16);
  }

  .save-btn-row {
    display: flex;
    gap: 8px;
  }

  .save-btn-row .btn {
    flex: 1;
  }

  .saved-list-card {
    flex: 1;
    min-height: 120px;
  }

  .empty-saved {
    font-size: 0.78rem;
    color: var(--text-muted);
    line-height: 1.45;
    padding: 6px 2px;
  }

  .saved-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    max-height: 220px;
    overflow-y: auto;
    padding-right: 2px;
  }

  .saved-item {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 7px;
    border-radius: var(--radius-sm);
    background: #f8fafc;
    border: 1px solid var(--border-subtle);
  }

  .saved-item.active {
    border-color: #3b82f6;
    background: #eff6ff;
  }

  .saved-info {
    flex: 1;
    min-width: 0;
  }

  .saved-name {
    font-size: 0.82rem;
    font-weight: 700;
    color: var(--text-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .saved-meta {
    font-size: 0.71rem;
    color: var(--text-muted);
    margin-top: 2px;
  }

  .saved-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  @media (max-width: 920px) {
    .editor-body {
      grid-template-columns: 1fr;
    }
  }
</style>
