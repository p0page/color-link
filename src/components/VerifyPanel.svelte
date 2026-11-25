<script lang="ts">
  import { getPieceColor } from '../lib/colors';
  import type { VerificationEvaluation } from '../lib/types';

  interface Props {
    verifierName: string;
    declarerName: string;
    minPathLength: number;
    evaluation: VerificationEvaluation;
    verifyTool: 'draw' | 'erase';
    placingSingletonColorId: number | null;
    hasVerifyPieces: boolean;
    hasAnyPath: boolean;
    onSetTool: (tool: 'draw' | 'erase') => void;
    onTogglePlaceSingleton: (colorId: number) => void;
    onClearColorPath: (colorId: number) => void;
    onClearAllPaths: () => void;
    onResetVerifyPieces: () => void;
    onHoverColor: (colorId: number | null) => void;
    onResign: () => void;
  }

  let {
    verifierName,
    declarerName,
    minPathLength,
    evaluation,
    verifyTool,
    placingSingletonColorId,
    hasVerifyPieces,
    hasAnyPath,
    onSetTool,
    onTogglePlaceSingleton,
    onClearColorPath,
    onClearAllPaths,
    onResetVerifyPieces,
    onHoverColor,
    onResign,
  }: Props = $props();

  let confirmResign = $state(false);

  const singletons = $derived(evaluation.colors.filter((item) => item.needsPair));
</script>

<div class="verify-panel">
  <div class="verify-banner">
    <div class="banner-title">连线验证模式</div>
    <p class="banner-desc">
      <strong>{declarerName}</strong> 认定不可能，现由上一手落子方
      <strong>{verifierName}</strong> 证明所有已出现颜色可合法连通（每条路径 ≥ <strong>{minPathLength}</strong> 格，满足后自动通过）。
    </p>
  </div>

  <div class="tool-bar">
    <button
      type="button"
      class="tool-btn"
      class:active={verifyTool === 'draw' && placingSingletonColorId === null}
      onclick={() => onSetTool('draw')}
    >
      画线
    </button>
    <button
      type="button"
      class="tool-btn"
      class:active={verifyTool === 'erase' && placingSingletonColorId === null}
      onclick={() => onSetTool('erase')}
    >
      擦除
    </button>
  </div>

  <p class="tool-hint">
    {#if placingSingletonColorId !== null}
      正在补放 <strong>{getPieceColor(placingSingletonColorId).letter}</strong> 的配对棋子：点击棋盘空格或该色连线末端即可放置，再点按钮或按 Esc 取消。
    {:else if verifyTool === 'erase'}
      点击任意连线格即可从该格截断擦除；点击验证期补放的棋子可将其移除。
    {:else}
      先点击棋子或已有线格选中起点，再多次点击同行/同列高亮格即可折线延伸；点击已画路径格可回退，再次点击当前端点或按 Esc 取消选中。
    {/if}
  </p>

  {#if singletons.length > 0}
    <div class="singleton-box">
      <div class="section-label">待补放配对单子（先连线或先补子均可）</div>
      <div class="singleton-chips">
        {#each singletons as item (item.colorId)}
          {@const color = getPieceColor(item.colorId)}
          <button
            type="button"
            class="singleton-btn"
            class:active={placingSingletonColorId === item.colorId}
            style="--c-bg: {color.hex}; --c-fg: {color.textColor};"
            onclick={() => onTogglePlaceSingleton(item.colorId)}
            onmouseenter={() => onHoverColor(item.colorId)}
            onmouseleave={() => onHoverColor(null)}
          >
            <span class="dot">{color.letter}</span>
            <span>{placingSingletonColorId === item.colorId ? '取消放置' : `补放 ${color.letter}`}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <div class="checklist-section">
    <div class="checklist-header">
      <span class="section-label">盘面颜色进度</span>
      <span class="progress-pill tabular" class:done={evaluation.allValid}>
        {evaluation.validColors} / {evaluation.totalColors} 已合法
      </span>
    </div>

    <div class="checklist">
      {#each evaluation.colors as item (item.colorId)}
        {@const color = getPieceColor(item.colorId)}
        <div
          class="check-row"
          class:valid={item.valid}
          class:short={item.connected && !item.lengthValid}
          role="listitem"
          onmouseenter={() => onHoverColor(item.colorId)}
          onmouseleave={() => onHoverColor(null)}
        >
          <div class="row-left">
            <span class="mini-piece" style="background: {color.hex}; color: {color.textColor};">
              {color.letter}
            </span>
            <span class="status-text">
              {#if item.valid}
                <span class="tag ok">已连通 · {item.length} 格 ✓</span>
              {:else if item.needsPair}
                <span class="tag warn">
                  缺第 2 枚{item.length > 1 ? `（已画 ${item.length} 格）` : ''}
                </span>
              {:else if item.connected && !item.lengthValid}
                <span class="tag err">长度不足 {item.length}/{minPathLength} 格</span>
              {:else if item.length > 1}
                <span class="tag progress">绘制中 · {item.length} 格</span>
              {:else}
                <span class="tag idle">未连通</span>
              {/if}
            </span>
          </div>

          <div class="row-actions">
            {#if item.needsPair}
              <button
                type="button"
                class="mini-action place"
                onclick={() => onTogglePlaceSingleton(item.colorId)}
              >
                {placingSingletonColorId === item.colorId ? '放置中' : '补放'}
              </button>
            {/if}
            {#if item.length > 0}
              <button
                type="button"
                class="mini-action clear"
                title="清除 {color.letter} 的连线"
                onclick={() => onClearColorPath(item.colorId)}
              >
                清线
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  </div>

  <div class="verify-actions">
    <div class="utility-row">
      <button type="button" class="btn btn-ghost" disabled={!hasAnyPath} onclick={onClearAllPaths}>
        清空全部连线
      </button>
      <button
        type="button"
        class="btn btn-ghost"
        disabled={!hasVerifyPieces}
        onclick={onResetVerifyPieces}
      >
        撤回补放棋子
      </button>
    </div>

    {#if confirmResign}
      <div class="resign-confirm">
        <span>确认认输？{declarerName} 将得 1 分</span>
        <div class="resign-btns">
          <button type="button" class="btn btn-ghost" onclick={() => (confirmResign = false)}>取消</button>
          <button type="button" class="btn btn-danger" onclick={onResign}>确认认输</button>
        </div>
      </div>
    {:else}
      <button type="button" class="btn btn-outline-danger resign-btn" onclick={() => (confirmResign = true)}>
        放弃验证 · 直接认输
      </button>
    {/if}
  </div>
</div>

<style>
  .verify-panel {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .verify-banner {
    padding: 14px;
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
  }

  .banner-title {
    font-size: 0.95rem;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .banner-desc {
    margin: 0;
    font-size: 0.8rem;
    line-height: 1.48;
    color: #475569;
  }

  .tool-bar {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 4px;
    padding: 4px;
    border-radius: var(--radius-pill);
    background: var(--bg-subtle);
  }

  .tool-btn {
    padding: 9px 10px;
    border-radius: var(--radius-pill);
    font-size: 0.86rem;
    font-weight: 700;
    color: var(--text-secondary);
    transition: background-color 0.14s ease, color 0.14s ease;
  }

  .tool-btn:hover {
    color: var(--text-primary);
    background: #ffffff;
  }

  .tool-btn.active {
    background: var(--ink-dark);
    color: #ffffff;
  }

  .tool-hint {
    margin: 0;
    font-size: 0.78rem;
    line-height: 1.45;
    color: var(--text-secondary);
    padding: 0 2px;
  }

  .singleton-box {
    padding: 10px 11px;
    border-radius: var(--radius-md);
    background: #fffbeb;
    border: 1px solid #fde68a;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .section-label {
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--text-secondary);
  }

  .singleton-box .section-label {
    color: #b45309;
  }

  .singleton-chips {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .singleton-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px 5px 6px;
    border-radius: 999px;
    background: #ffffff;
    border: 1.5px solid var(--border-strong);
    font-size: 0.8rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .singleton-btn.active {
    border-color: #f59e0b;
    background: #fef3c7;
    box-shadow: 0 0 0 2px rgba(245, 158, 11, 0.25);
  }

  .dot {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: var(--c-bg);
    color: var(--c-fg);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.76rem;
    font-weight: 800;
  }

  .checklist-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .checklist-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .progress-pill {
    font-size: 0.76rem;
    font-weight: 700;
    padding: 2px 9px;
    border-radius: 999px;
    background: #f1f5f9;
    color: var(--text-secondary);
  }

  .progress-pill.done {
    background: #dcfce7;
    color: #15803d;
  }

  .checklist {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 240px;
    overflow-y: auto;
    padding-right: 2px;
  }

  .check-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 6px 9px;
    border-radius: var(--radius-sm);
    background: #ffffff;
    border: 1px solid var(--border-subtle);
  }

  .check-row.valid {
    border-color: #bbf7d0;
    background: #f0fdf4;
  }

  .check-row.short {
    border-color: #fed7aa;
    background: #fff7ed;
  }

  .row-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .mini-piece {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 800;
    font-size: 0.78rem;
  }

  .status-text {
    font-size: 0.79rem;
    font-weight: 600;
  }

  .tag.ok {
    color: #15803d;
  }

  .tag.warn {
    color: #b45309;
  }

  .tag.err {
    color: #c2410c;
  }

  .tag.progress {
    color: #2563eb;
  }

  .tag.idle {
    color: var(--text-muted);
  }

  .row-actions {
    display: flex;
    gap: 4px;
    flex-shrink: 0;
  }

  .mini-action {
    padding: 3px 7px;
    border-radius: 6px;
    font-size: 0.72rem;
    font-weight: 700;
  }

  .mini-action.place {
    background: #fef3c7;
    color: #b45309;
  }

  .mini-action.clear {
    background: #f1f5f9;
    color: var(--text-secondary);
  }

  .mini-action:hover {
    filter: brightness(0.95);
  }

  .verify-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-top: 4px;
    border-top: 1px solid var(--border-subtle);
  }

  .utility-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }

  .utility-row .btn {
    font-size: 0.8rem;
    padding: 8px 8px;
  }

  .resign-btn {
    width: 100%;
  }

  .resign-confirm {
    padding: 10px 12px;
    border-radius: var(--radius-sm);
    background: #fff1f2;
    border: 1px solid #fda4af;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 0.82rem;
    color: #9f1239;
    text-align: center;
  }

  .resign-btns {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 8px;
  }
</style>
