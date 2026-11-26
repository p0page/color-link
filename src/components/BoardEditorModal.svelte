<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { getPieceColor, PIECE_COLORS } from '../lib/colors';
  import { cellKey, coordKey, parseCellKey } from '../lib/engine';
  import { boardHasRoom, boardLayoutKey, generateRandomBoard } from '../lib/round-boards';
  import { generateId, sanitizeBlueprint } from '../lib/storage';
  import type { BoardBlueprint, CellKey, MatchBoard, SavedBoard } from '../lib/types';
  import BoardPreview from './BoardPreview.svelte';
  import BoardViewport from './BoardViewport.svelte';

  interface Props {
    initialBlueprint: BoardBlueprint;
    initialBoard?: MatchBoard;
    roundNumber: number;
    minimum: number;
    savedBoards: SavedBoard[];
    onSaveBoard: (board: SavedBoard) => void;
    onDeleteBoard: (id: string) => void;
    onApply: (board: SavedBoard) => void;
    onClose: () => void;
  }

  let {
    initialBlueprint,
    initialBoard,
    roundNumber,
    minimum,
    savedBoards,
    onSaveBoard,
    onDeleteBoard,
    onApply,
    onClose,
  }: Props = $props();

  const seed = untrack(() => ({
    blueprint: sanitizeBlueprint(initialBlueprint),
    savedBoard: initialBoard,
  }));

  type SupportedLayout = Pick<SavedBoard, 'blueprint' | 'supportedMinPathLength'>;
  interface EditorDraft {
    blueprint: BoardBlueprint;
    id: string | null;
    name: string;
    supportedLayout: SupportedLayout | undefined;
  }

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

  let editingBoardId = $state<string | null>(seed.savedBoard?.id ?? null);
  let boardName = $state(seed.savedBoard?.name ?? '');
  let supportedLayout = $state.raw<SupportedLayout | undefined>(seed.savedBoard);
  let beforeRoll = $state.raw<EditorDraft>();
  let tool = $state<'block' | 'piece' | 'erase'>('block');
  let selectedColorId = $state(0);
  let dragAction = $state<'block' | 'unblock' | 'erase' | null>(null);
  let paintedOnPointerDown = false;
  let notice = $state<string | null>(null);
  let noticeTimer: ReturnType<typeof setTimeout> | null = null;
  let dialog: HTMLDialogElement;
  let nameInput: HTMLInputElement;

  onMount(() => {
    dialog.showModal();
    return () => {
      if (noticeTimer) clearTimeout(noticeTimer);
    };
  });

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

  function loadBlueprint(blueprint: BoardBlueprint) {
    rows = blueprint.rows;
    cols = blueprint.cols;
    blockedMap = buildBlockedRecord(blueprint);
    presetMap = buildPresetRecord(blueprint);
  }

  function rollBoard() {
    if (rows * cols < minimum) return;
    beforeRoll ??= { blueprint: currentBlueprint(), id: editingBoardId, name: boardName, supportedLayout };
    const generated = generateRandomBoard(rows, cols, minimum);
    loadBlueprint(generated.blueprint);
    if (editingBoardId) boardName = '';
    editingBoardId = null;
    supportedLayout = { blueprint: generated.blueprint, supportedMinPathLength: generated.supportedMinPathLength };
    showNotice('已生成新棋盘。满意后可保存到地图库。');
  }

  function undoRoll() {
    if (!beforeRoll) return;
    loadBlueprint(beforeRoll.blueprint);
    editingBoardId = beforeRoll.id;
    boardName = beforeRoll.name;
    supportedLayout = beforeRoll.supportedLayout;
    beforeRoll = undefined;
    showNotice('已恢复随机生成之前的棋盘。');
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

  function editCell(key: CellKey, allowDrag = false) {
    if (tool === 'block') {
      const shouldBlock = !blockedMap[key];
      if (allowDrag) dragAction = shouldBlock ? 'block' : 'unblock';
      setCellBlocked(key, shouldBlock);
      return;
    }

    if (tool === 'erase') {
      if (allowDrag) dragAction = 'erase';
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

  function handleCellPointerDown(event: PointerEvent, key: CellKey) {
    paintedOnPointerDown = event.pointerType === 'mouse' && event.button === 0;
    if (paintedOnPointerDown) {
      event.preventDefault();
      editCell(key, true);
    }
  }

  function handleCellClick(event: MouseEvent, key: CellKey) {
    if (event.detail === 0 || !paintedOnPointerDown) {
      editCell(key);
    }
    paintedOnPointerDown = false;
  }

  function handleCellPointerEnter(event: PointerEvent, key: CellKey) {
    if (event.pointerType !== 'mouse' || !(event.buttons & 1) || !dragAction) {
      return;
    }
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

  function stopPainting() {
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

  function handleSave(asNew: boolean, apply = false) {
    const bp = currentBlueprint();
    const finalName = boardName.trim();
    if (!finalName) {
      showNotice('请先给地图取名。');
      nameInput.focus();
      return;
    }
    const id = asNew || !editingBoardId ? generateId('board') : editingBoardId;
    const verified = supportedLayout && boardLayoutKey(supportedLayout.blueprint) === boardLayoutKey(bp)
      ? supportedLayout.supportedMinPathLength : undefined;
    const board: SavedBoard = {
      id,
      name: finalName,
      updatedAt: new Date().toISOString(),
      blueprint: bp,
      supportedMinPathLength: verified,
    };
    if (apply) {
      if (!boardHasRoom(board, minimum)) {
        showNotice(`这张地图不符合本场至少 ${minimum} 格的连线要求。`);
        return;
      }
      onApply(board);
      return;
    }
    editingBoardId = id;
    boardName = finalName;
    supportedLayout = board;
    beforeRoll = undefined;
    onSaveBoard(board);
    showNotice(`已保存棋盘「${finalName}」到本地`);
  }

  function handleLoadSaved(board: SavedBoard) {
    loadBlueprint(sanitizeBlueprint(board.blueprint));
    editingBoardId = board.id;
    boardName = board.name;
    supportedLayout = board;
    beforeRoll = undefined;
    showNotice(`已载入棋盘「${board.name}」`);
  }

  function handleDeleteSaved(board: SavedBoard) {
    onDeleteBoard(board.id);
    if (editingBoardId === board.id) {
      editingBoardId = null;
    }
    if (beforeRoll?.id === board.id) beforeRoll = { ...beforeRoll, id: null };
    showNotice(`已删除棋盘「${board.name}」`);
  }

</script>

<svelte:window onpointerup={stopPainting} onpointercancel={stopPainting} onblur={stopPainting} />

<dialog class="modal-backdrop" bind:this={dialog} aria-label="棋盘编辑器"
  oncancel={(event) => { event.preventDefault(); onClose(); }}>
  <div class="editor-shell">
    <header class="editor-header">
      <h2>第 {roundNumber} 局 · 自定义地图</h2>
      <label class="name-field">
        <span>地图名称</span>
        <input type="text" maxlength="24" placeholder="给地图取名" bind:value={boardName} bind:this={nameInput} class="name-input" />
      </label>
      <div class="header-actions">
        <button type="button" class="btn btn-ghost small" onclick={onClose}>取消</button>
        <button type="button" class="btn btn-primary small" onclick={() => handleSave(false, true)}>
          保存并用在第 {roundNumber} 局
        </button>
      </div>
      {#if notice}<div class="editor-notice" role="status">{notice}</div>{/if}
    </header>

    <div class="editor-body">
      <section class="canvas-pane">
        <div class="toolbar-row">
          <div class="tool-group">
            <button
              type="button"
              class="tool-btn"
              class:active={tool === 'block'}
              aria-pressed={tool === 'block'}
              onclick={() => (tool = 'block')}
            >
              <span class="swatch-black"></span>
              障碍（黑块）
            </button>
            <button
              type="button"
              class="tool-btn"
              class:active={tool === 'piece'}
              aria-pressed={tool === 'piece'}
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
              aria-pressed={tool === 'erase'}
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

        <div class="roll-toolbar">
          <button type="button" class="btn btn-ghost small" disabled={rows * cols < minimum} onclick={rollBoard}>随机生成棋盘</button>
          {#if rows * cols < minimum}<span class="tip-line">扩大棋盘以满足至少 {minimum} 格的连线要求。</span>{/if}
          {#if beforeRoll}
            <button type="button" class="mini-btn" onclick={undoRoll}>恢复生成前的棋盘</button>
          {/if}
        </div>

        {#if tool === 'piece'}
          <div class="panel-card">
            <div class="panel-title">选择预设棋子颜色（A–Z）</div>
            <div class="mini-palette">
              {#each PIECE_COLORS as color (color.id)}
                {@const placed = colorCounts.get(color.id) ?? 0}
                <button
                  type="button"
                  class="pal-item"
                  class:selected={selectedColorId === color.id}
                  class:full={placed >= 2}
                  aria-pressed={selectedColorId === color.id}
                  onclick={() => (selectedColorId = color.id)}
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
        {/if}

        <BoardViewport {rows} {cols}>
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

            <div class="editor-stage" style="aspect-ratio: {cols} / {rows};">
            <div
              class="editor-grid"
              style="grid-template-columns: repeat({cols}, minmax(0, 1fr)); grid-template-rows: repeat({rows}, minmax(0, 1fr));"
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
                    onpointerdown={(event) => handleCellPointerDown(event, key)}
                    onpointerenter={(event) => handleCellPointerEnter(event, key)}
                    onclick={(event) => handleCellClick(event, key)}
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
        </div>
        </BoardViewport>

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
            轻点格子添加或移除黑块。<span class="mouse-tip">也可按住鼠标拖动批量编辑。</span>
          {:else if tool === 'piece'}
            选好颜色后点击格子放置棋子。再次点击同色棋子可移除。
          {:else}
            轻点格子擦除障碍或棋子。<span class="mouse-tip">也可按住鼠标拖动批量擦除。</span>
          {/if}
        </div>

      </section>

      <aside class="side-pane">
        <div class="panel-card">
          <div class="save-btn-row">
            <button type="button" class="btn btn-ghost small" onclick={() => handleSave(false)}>
              {editingBoardId ? '更新保存' : '保存到地图库'}
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
</dialog>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 60;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    border: 0;
    color: var(--text-primary);
    background: transparent;
    overflow: hidden;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .modal-backdrop[open] {
    display: flex;
  }

  .modal-backdrop::backdrop {
    background: var(--modal-overlay);
    backdrop-filter: blur(4px);
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

  .name-field {
    display: flex;
    align-items: center;
    flex: 1 1 180px;
    gap: 8px;
    font-size: 0.78rem;
    color: var(--text-muted);
  }

  .name-field span {
    flex-shrink: 0;
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

  .editor-stage {
    position: relative;
    align-self: start;
    min-width: 0;
  }

  .editor-grid {
    position: absolute;
    inset: 0;
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
    touch-action: manipulation;
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

  .roll-toolbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .roll-toolbar button {
    min-height: 44px;
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
    flex-wrap: wrap;
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
    flex-basis: 100%;
    color: var(--text-secondary);
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
    grid-template-columns: repeat(13, minmax(0, 1fr));
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
    min-width: 0;
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

  @media (hover: none) {
    .mouse-tip {
      display: none;
    }
  }

  @media (max-width: 680px), (hover: none) and (pointer: coarse) and (max-width: 960px) {
    .editor-board-wrap {
      max-width: none;
    }
  }

  @media (max-width: 680px) {
    .modal-backdrop {
      padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    }

    .editor-shell {
      height: 100%;
      max-height: 100%;
      border-radius: 0;
    }

    .editor-header,
    .editor-body {
      padding: 10px 12px;
    }

    .editor-header {
      flex-shrink: 0;
      gap: 8px;
    }

    .name-field {
      flex-basis: 100%;
    }

    .editor-body {
      min-height: 0;
      grid-template-columns: minmax(0, 1fr);
      overscroll-behavior: contain;
    }

    .mini-palette {
      grid-template: repeat(2, auto) / none;
      grid-auto-flow: column;
      grid-auto-columns: 44px;
      overflow-x: auto;
      padding: 3px 3px 7px;
    }

    .tool-btn,
    .pal-item,
    .header-actions .btn,
    .mini-btn {
      min-height: 40px;
    }

    .dim-field input,
    .name-input {
      font-size: 16px;
    }
  }
</style>
