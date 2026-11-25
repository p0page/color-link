<script lang="ts">
  import type { RoundResult } from '../lib/types';

  interface Props {
    result: RoundResult;
    isMatchOver: boolean;
    playerNames: [string, string];
    scores: [number, number];
    targetWins: number;
    onNextRound: () => void;
    onRematch: () => void;
    onBackToSetup: () => void;
  }

  let {
    result,
    isMatchOver,
    playerNames,
    scores,
    targetWins,
    onNextRound,
    onRematch,
    onBackToSetup,
  }: Props = $props();

  let inspectingBoard = $state(false);

  const winnerName = $derived(playerNames[result.winner]);

  const reasonText = $derived.by(() => {
    const verifierName = result.verifier !== undefined ? playerNames[result.verifier] : '';
    const declarerName = result.declarer !== undefined ? playerNames[result.declarer] : '';
    switch (result.reason) {
      case 'verify_success':
        return `${verifierName} 成功完成所有合法连线验证，证明盘面可解！`;
      case 'verify_resign':
        return `${verifierName} 选择认输，${declarerName} 认定不可能成立！`;
      case 'verify_timeout':
        return `${verifierName} 连线验证超时，${declarerName} 赢得本局！`;
      case 'move_timeout':
        return `${playerNames[result.winner === 0 ? 1 : 0]} 落子超时，${winnerName} 直接获胜！`;
    }
  });
</script>

{#if inspectingBoard}
  <div class="peek-bar">
    <div class="peek-info">
      <span class="peek-badge">{isMatchOver ? '最终胜出' : `第 ${result.roundNumber} 局胜出`}</span>
      <strong>{winnerName}</strong>
    <span class="peek-score tabular">
      <strong class="p0">{scores[0]}</strong>
      <span class="peek-sep">:</span>
      <strong class="p1">{scores[1]}</strong>
    </span>
    </div>
    <div class="peek-actions">
      <button type="button" class="btn btn-ghost" onclick={() => (inspectingBoard = false)}>展开结算</button>
      {#if isMatchOver}
        <button type="button" class="btn btn-primary" onclick={onRematch}>再来一赛</button>
      {:else}
        <button type="button" class="btn btn-primary" onclick={onNextRound}>下一局</button>
      {/if}
    </div>
  </div>
{:else}
  <div class="modal-backdrop">
    <div class="modal-card" class:champion={isMatchOver}>
      <div class="result-badge" class:gold={isMatchOver}>
        {isMatchOver ? `🏆 比赛结束 · 率先达成 ${targetWins} 胜` : `第 ${result.roundNumber} 局结束`}
      </div>

      <h2>
        <span class:p0={result.winner === 0} class:p1={result.winner === 1}>{winnerName}</span>
        {isMatchOver ? ' 赢得最终胜利！' : ' 获得 1 分'}
      </h2>

      <p class="reason">{reasonText}</p>

      <div class="score-board tabular">
        <div class="score-side" class:lead={result.winner === 0}>
          <span class="name p0">{playerNames[0]}</span>
          <span class="num p0-box">{scores[0]}</span>
        </div>
        <div class="vs">:</div>
        <div class="score-side" class:lead={result.winner === 1}>
          <span class="name p1">{playerNames[1]}</span>
          <span class="num p1-box">{scores[1]}</span>
        </div>
      </div>

      <div class="actions">
        {#if isMatchOver}
          <button type="button" class="btn btn-primary" onclick={onRematch}>同配置再来一赛</button>
          <button type="button" class="btn btn-ghost" onclick={onBackToSetup}>修改游戏配置</button>
        {:else}
          <button type="button" class="btn btn-primary" onclick={onNextRound}>进入第 {result.roundNumber + 1} 局（选先手）</button>
        {/if}
        <button type="button" class="btn btn-ghost" onclick={() => (inspectingBoard = true)}>
          查看最终棋盘与连线
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 45;
    background: var(--modal-overlay);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .modal-card {
    width: 100%;
    max-width: 480px;
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: clamp(16px, 5vw, 30px);
    text-align: center;
    box-shadow: var(--shadow-lg);
  }

  .modal-card.champion {
    border-color: #fcd34d;
    box-shadow:
      0 0 0 4px rgba(251, 191, 36, 0.15),
      var(--shadow-lg);
  }

  .result-badge {
    display: inline-block;
    font-size: 0.78rem;
    font-weight: 700;
    padding: 4px 12px;
    border-radius: 999px;
    background: #f0fdf4;
    color: #15803d;
    border: 1px solid #bbf7d0;
    margin-bottom: 12px;
  }

  .result-badge.gold {
    background: #fffbeb;
    color: #b45309;
    border-color: #fde68a;
  }

  h2 {
    margin: 0;
    font-size: 1.55rem;
  }

  .p0 {
    color: var(--player-p0-ink);
  }

  .p1 {
    color: var(--player-p1-ink);
  }

  .reason {
    margin: 10px 0 20px;
    color: var(--text-secondary);
    font-size: 0.9rem;
    line-height: 1.5;
  }

  .score-board {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 14px 18px;
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    margin-bottom: 22px;
  }

  .score-side {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    min-width: 0;
  }

  .score-side .name {
    font-size: 0.84rem;
    font-weight: 700;
    overflow-wrap: anywhere;
    max-width: 100%;
  }

  .score-side .num {
    min-width: 60px;
    padding: 8px 14px;
    border-radius: 12px;
    font-size: 2rem;
    font-weight: 900;
    line-height: 1;
    border: 1.5px solid var(--border-subtle);
    background: #ffffff;
  }

  .score-side .num.p0-box {
    color: var(--player-p0-ink);
    background: var(--player-p0-tint);
  }

  .score-side .num.p1-box {
    color: var(--player-p1-ink);
    background: var(--player-p1-tint);
  }

  .vs {
    font-size: 1.5rem;
    color: var(--text-muted);
    font-weight: 800;
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: 9px;
  }

  .peek-bar {
    position: fixed;
    bottom: max(18px, env(safe-area-inset-bottom));
    left: 50%;
    transform: translateX(-50%);
    z-index: 45;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    width: max-content;
    max-width: calc(100% - 24px);
    gap: 10px 18px;
    padding: 10px 16px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.96);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow-lg);
    backdrop-filter: blur(10px);
  }

  .peek-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 0.9rem;
  }

  .peek-badge {
    font-size: 0.72rem;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 999px;
    background: #dcfce7;
    color: #15803d;
  }

  .peek-score {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    font-size: 0.95rem;
  }

  .peek-sep {
    color: var(--text-muted);
    font-weight: 800;
  }

  .peek-actions {
    display: flex;
    gap: 8px;
  }
</style>
