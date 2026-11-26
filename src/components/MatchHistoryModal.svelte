<script lang="ts">
  import Modal from './Modal.svelte';
  import type { MatchHistoryRecord, RoundEndReason } from '../lib/types';

  interface Props {
    records: MatchHistoryRecord[];
    onClose: () => void;
    onDelete: (id: string) => void;
    onClearAll: () => void;
  }

  let { records, onClose, onDelete, onClearAll }: Props = $props();

  let expandedIds = $state<Record<string, boolean>>({});
  let confirmingClear = $state(false);

  function toggleExpand(id: string) {
    expandedIds = {
      ...expandedIds,
      [id]: !expandedIds[id],
    };
  }

  function formatDate(iso: string): string {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) {
      return iso;
    }
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    const hh = String(date.getHours()).padStart(2, '0');
    const mm = String(date.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${d} ${hh}:${mm}`;
  }

  function reasonLabel(reason: RoundEndReason): string {
    switch (reason) {
      case 'verify_success':
        return '连线验证通过';
      case 'verify_resign':
        return '验证方认输';
      case 'verify_timeout':
        return '验证超时';
      case 'move_timeout':
        return '落子超时';
    }
  }
</script>

<Modal label="历史对决记录" onDismiss={onClose}>
  <div class="modal-card">
    <header class="modal-header">
      <div>
        <h2>历史对决记录</h2>
        <p class="subtitle">已保存在本地浏览器（共 {records.length} 场完赛记录）</p>
      </div>
      <div class="header-actions">
        {#if records.length > 0}
          {#if confirmingClear}
            <button
              type="button"
              class="btn btn-danger small"
              onclick={() => {
                onClearAll();
                confirmingClear = false;
              }}
            >
              确认清空
            </button>
            <button
              type="button"
              class="btn btn-ghost small"
              onclick={() => (confirmingClear = false)}
            >
              取消
            </button>
          {:else}
            <button
              type="button"
              class="btn btn-outline-danger small"
              onclick={() => (confirmingClear = true)}
            >
              清空全部
            </button>
          {/if}
        {/if}
        <button type="button" class="btn btn-ghost small" onclick={onClose}>关闭</button>
      </div>
    </header>

    <div class="records-body">
      {#if records.length === 0}
        <div class="empty-state">
          <div class="empty-icon">🏆</div>
          <div class="empty-title">暂无历史对决记录</div>
          <p class="empty-desc">完成一场完整比赛（率先达到获胜局数）后，系统会自动将战绩保存到本地。</p>
        </div>
      {:else}
        <div class="record-list">
          {#each records as rec (rec.id)}
            {@const isExpanded = Boolean(expandedIds[rec.id])}
            {@const multipleBoards = rec.rounds.some((round) => round.board && round.board.id !== rec.rounds[0]?.board?.id)}
            <article class="record-card">
              <div class="record-top">
                <span class="record-time tabular">{formatDate(rec.playedAt)}</span>
                <div class="record-meta-tags">
                  {#if multipleBoards}
                    <span class="meta-pill">多张棋盘</span>
                  {:else}
                    <span class="meta-pill">{rec.boardName}</span>
                    <span class="meta-pill tabular">{rec.rows}×{rec.cols}</span>
                    {#if rec.blockedCount > 0}
                      <span class="meta-pill dark tabular">{rec.blockedCount} 黑块</span>
                    {/if}
                    {#if rec.presetCount > 0}
                      <span class="meta-pill tabular">{rec.presetCount} 预设子</span>
                    {/if}
                  {/if}
                  <span class="meta-pill tabular">最短 {rec.minPathLength} 格 · {rec.targetWins} 胜</span>
                </div>
              </div>

              <div class="record-score-row tabular">
                <div class="rec-player p0" class:winner={rec.winner === 0}>
                  {#if rec.winner === 0}
                    <span class="win-tag">胜</span>
                  {/if}
                  <span class="rec-name">{rec.playerNames[0]}</span>
                  <span class="rec-score">{rec.scores[0]}</span>
                </div>

                <span class="rec-sep">:</span>

                <div class="rec-player p1" class:winner={rec.winner === 1}>
                  <span class="rec-score">{rec.scores[1]}</span>
                  <span class="rec-name">{rec.playerNames[1]}</span>
                  {#if rec.winner === 1}
                    <span class="win-tag">胜</span>
                  {/if}
                </div>
              </div>

              <div class="record-footer">
                {#if rec.rounds.length > 0}
                  <button
                    type="button"
                    class="link-btn"
                    onclick={() => toggleExpand(rec.id)}
                  >
                    {isExpanded ? '收起每局详情 ▲' : `查看 ${rec.rounds.length} 局详情 ▼`}
                  </button>
                {:else}
                  <span></span>
                {/if}

                <button
                  type="button"
                  class="delete-btn"
                  onclick={() => onDelete(rec.id)}
                >
                  删除
                </button>
              </div>

              {#if isExpanded && rec.rounds.length > 0}
                <div class="rounds-detail">
                  {#each rec.rounds as round (round.roundNumber)}
                    <div class="round-line">
                      <span class="r-idx tabular">第 {round.roundNumber} 局</span>
                      <span class="r-winner" class:p0={round.winner === 0} class:p1={round.winner === 1}>
                        {rec.playerNames[round.winner]} +1 分
                      </span>
                      <span class="r-reason">{reasonLabel(round.reason)}</span>
                      {#if round.board}
                        {@const size = `${round.board.rows}×${round.board.cols}`}
                        <span class="r-map">{round.board.name}{round.board.name.endsWith(size) ? '' : ` · ${size}`}</span>
                      {/if}
                    </div>
                  {/each}
                </div>
              {/if}
            </article>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</Modal>

<style>
  .modal-card {
    width: 100%;
    max-width: 720px;
    max-height: 86dvh;
    display: flex;
    flex-direction: column;
    background: var(--bg-surface);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
    padding: 18px 22px 14px;
    border-bottom: 1px solid var(--border-subtle);
    background: #ffffff;
  }

  h2 {
    margin: 0;
    font-size: 1.25rem;
    color: var(--text-primary);
  }

  .subtitle {
    margin: 3px 0 0;
    font-size: 0.8rem;
    color: var(--text-muted);
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .btn.small {
    padding: 6px 11px;
    font-size: 0.8rem;
  }

  .records-body {
    padding: 16px 22px 20px;
    overflow-y: auto;
    background: var(--bg-base);
    flex: 1;
    min-height: 0;
    overscroll-behavior: contain;
  }

  .empty-state {
    text-align: center;
    padding: 44px 16px;
    color: var(--text-secondary);
  }

  .empty-icon {
    font-size: 2.2rem;
    margin-bottom: 8px;
  }

  .empty-title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--text-primary);
  }

  .empty-desc {
    margin: 6px auto 0;
    max-width: 380px;
    font-size: 0.84rem;
    line-height: 1.5;
    color: var(--text-muted);
  }

  .record-list {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .record-card {
    background: #ffffff;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-md);
    padding: clamp(12px, 3vw, 18px);
    box-shadow: var(--shadow-card);
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .record-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-wrap: wrap;
  }

  .record-time {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--text-muted);
  }

  .record-meta-tags {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }

  .meta-pill {
    font-size: 0.72rem;
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 999px;
    background: #f1f5f9;
    color: var(--text-secondary);
  }

  .meta-pill.dark {
    background: #1e293b;
    color: #f8fafc;
  }

  .record-score-row {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    padding: 8px 10px;
    border-radius: var(--radius-sm);
    background: #f8fafc;
    border: 1px solid var(--border-subtle);
  }

  .rec-player {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .rec-name {
    font-size: 0.92rem;
    font-weight: 700;
    color: var(--text-secondary);
    overflow-wrap: anywhere;
  }

  .rec-player.p0.winner .rec-name {
    color: var(--player-p0-ink);
  }

  .rec-player.p1.winner .rec-name {
    color: var(--player-p1-ink);
  }

  .rec-score {
    min-width: 34px;
    height: 30px;
    padding: 0 9px;
    border-radius: 8px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.2rem;
    font-weight: 900;
    line-height: 1;
    border: 1.5px solid var(--border-subtle);
    background: #ffffff;
  }

  .rec-player.p0 .rec-score {
    color: var(--player-p0-ink);
    background: var(--player-p0-tint);
  }

  .rec-player.p1 .rec-score {
    color: var(--player-p1-ink);
    background: var(--player-p1-tint);
  }

  .win-tag {
    font-size: 0.7rem;
    font-weight: 800;
    padding: 2px 6px;
    border-radius: 6px;
    background: #dcfce7;
    color: #15803d;
  }

  .rec-sep {
    font-size: 1.2rem;
    font-weight: 900;
    color: var(--text-muted);
  }

  .record-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .link-btn {
    font-size: 0.78rem;
    font-weight: 600;
    color: #2563eb;
    padding: 2px 4px;
  }

  .link-btn:hover {
    text-decoration: underline;
  }

  .delete-btn {
    font-size: 0.76rem;
    font-weight: 600;
    color: var(--text-muted);
    padding: 3px 8px;
    border-radius: 6px;
  }

  .delete-btn:hover {
    background: #fff1f2;
    color: #be123c;
  }

  .rounds-detail {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding-top: 8px;
    border-top: 1px dashed var(--border-subtle);
  }

  .round-line {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    font-size: 0.79rem;
    padding: 4px 8px;
    border-radius: 6px;
    background: #f8fafc;
  }

  .r-idx {
    font-weight: 700;
    color: var(--text-secondary);
  }

  .r-winner {
    font-weight: 700;
  }

  .r-winner.p0 {
    color: var(--accent-p0);
  }

  .r-winner.p1 {
    color: var(--accent-p1);
  }

  .r-reason {
    color: var(--text-muted);
  }

  .r-map {
    grid-column: 1 / -1;
    font-size: 0.74rem;
    color: var(--text-secondary);
    overflow-wrap: anywhere;
  }

  @media (max-width: 680px) {
    .modal-header,
    .records-body {
      padding: 12px;
    }

    .header-actions .btn {
      min-height: 40px;
    }

    .round-line {
      flex-wrap: wrap;
    }
  }
</style>
