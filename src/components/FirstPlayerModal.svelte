<script lang="ts">
  import type { PlayerId } from '../lib/types';

  interface Props {
    roundNumber: number;
    playerNames: [string, string];
    scores: [number, number];
    targetWins: number;
    onSelect: (player: PlayerId) => void;
    onBackToSetup: () => void;
  }

  let { roundNumber, playerNames, scores, targetWins, onSelect, onBackToSetup }: Props = $props();
</script>

<div class="modal-backdrop">
  <div class="modal-card">
    <div class="round-tag">第 {roundNumber} 局 · 先得 {targetWins} 分获胜</div>
    <h2>请选择本局先手玩家</h2>
    <p class="desc">先手首回合放置 <strong>1 枚</strong> 棋子，之后双方轮流每回合放置 <strong>2 枚不同颜色</strong> 的棋子。</p>

    <div class="score-board tabular" aria-label="当前比分">
      <div class="score-caption">当前比分</div>
      <div class="score-row">
        <div class="score-side p0">
          <span class="score-name">{playerNames[0]}</span>
          <span class="score-value">{scores[0]}</span>
        </div>

        <span class="score-sep">:</span>

        <div class="score-side p1">
          <span class="score-name">{playerNames[1]}</span>
          <span class="score-value">{scores[1]}</span>
        </div>
      </div>
    </div>

    <div class="choice-grid">
      <button type="button" class="choice-btn p0-choice" onclick={() => onSelect(0)}>
        <span class="choice-badge"><span class="badge-dot"></span>PLAYER 1</span>
        <span class="choice-name">{playerNames[0]}</span>
        <span class="choice-sub">作为本局先手开始</span>
      </button>

      <button type="button" class="choice-btn p1-choice" onclick={() => onSelect(1)}>
        <span class="choice-badge"><span class="badge-dot"></span>PLAYER 2</span>
        <span class="choice-name">{playerNames[1]}</span>
        <span class="choice-sub">作为本局先手开始</span>
      </button>
    </div>

    <div class="footer-actions">
      <button type="button" class="btn btn-ghost" onclick={onBackToSetup}>返回修改配置</button>
    </div>
  </div>
</div>

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    background: var(--modal-overlay);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .modal-card {
    width: 100%;
    max-width: 520px;
    max-height: calc(100dvh - 32px);
    overflow-y: auto;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    padding: clamp(16px, 5vw, 30px);
    text-align: center;
    box-shadow: var(--shadow-lg);
  }

  .round-tag {
    display: inline-block;
    font-size: 0.78rem;
    font-weight: 700;
    color: var(--text-secondary);
    background: var(--bg-subtle);
    padding: 4px 12px;
    border-radius: 999px;
    margin-bottom: 10px;
  }

  h2 {
    margin: 0;
    font-size: 1.45rem;
  }

  .desc {
    margin: 8px 0 16px;
    color: var(--text-secondary);
    font-size: 0.88rem;
    line-height: 1.5;
  }

  .score-board {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 14px 18px 16px;
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    border: 1px solid var(--border-subtle);
    margin-bottom: 18px;
  }

  .score-caption {
    font-size: 0.74rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--text-muted);
  }

  .score-row {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    align-items: center;
    gap: 10px;
    width: 100%;
  }

  .score-side {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .score-name {
    font-size: 0.84rem;
    font-weight: 700;
    color: var(--text-secondary);
    overflow-wrap: anywhere;
  }

  .score-value {
    min-width: 56px;
    padding: 6px 14px;
    border-radius: 12px;
    font-size: 1.95rem;
    font-weight: 900;
    line-height: 1;
    background: #ffffff;
    border: 1.5px solid var(--border-subtle);
    box-shadow: var(--shadow-sm);
  }

  .score-side.p0 .score-value {
    color: var(--player-p0-ink);
    background: var(--player-p0-tint);
  }

  .score-side.p1 .score-value {
    color: var(--player-p1-ink);
    background: var(--player-p1-tint);
  }

  .score-sep {
    font-size: 1.65rem;
    font-weight: 900;
    color: var(--text-muted);
    margin-top: 12px;
  }

  .choice-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 12px;
  }

  .choice-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 18px 14px;
    border-radius: var(--radius-md);
    background: var(--bg-elevated);
    border: 1.5px solid var(--border-subtle);
    transition:
      transform 0.14s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease,
      background-color 0.15s ease;
  }

  .choice-btn:hover {
    transform: translateY(-2px);
    background: #ffffff;
  }

  .p0-choice:hover {
    border-color: var(--accent-p0);
    box-shadow: 0 8px 20px rgba(217, 119, 6, 0.14);
  }

  .p1-choice:hover {
    border-color: var(--accent-p1);
    box-shadow: 0 8px 20px rgba(2, 132, 199, 0.14);
  }

  .choice-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.7rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: var(--text-muted);
  }

  .badge-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .p0-choice .badge-dot {
    background: var(--accent-p0);
  }

  .p1-choice .badge-dot {
    background: var(--accent-p1);
  }

  .p0-choice .choice-name {
    color: var(--player-p0-ink);
  }

  .p1-choice .choice-name {
    color: var(--player-p1-ink);
  }

  .choice-name {
    font-size: 1.15rem;
    font-weight: 800;
    overflow-wrap: anywhere;
    max-width: 100%;
  }

  .choice-sub {
    font-size: 0.78rem;
    color: var(--text-secondary);
  }

  .footer-actions {
    margin-top: 18px;
  }
</style>
