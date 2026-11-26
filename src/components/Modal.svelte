<script lang="ts">
  import type { Snippet } from 'svelte';
  import { attachModal } from '../lib/modal';

  let {
    id,
    label,
    labelledBy,
    describedBy,
    layout = 'centered',
    fullscreenOnMobile = false,
    dismissOnBackdrop = false,
    onDismiss,
    children,
  }: {
    id?: string;
    label?: string;
    labelledBy?: string;
    describedBy?: string;
    layout?: 'centered' | 'sheet' | 'preview';
    fullscreenOnMobile?: boolean;
    dismissOnBackdrop?: boolean;
    onDismiss?: () => void;
    children: Snippet;
  } = $props();

  let backdropPress: { x: number; y: number } | undefined;

  function isBackdrop(event: MouseEvent & { currentTarget: HTMLDialogElement }) {
    if (event.target !== event.currentTarget) return false;
    const { left, right, top, bottom } = event.currentTarget.getBoundingClientRect();
    return event.clientX < left || event.clientX > right || event.clientY < top || event.clientY > bottom;
  }

  function cancelBackdropTap(event: MouseEvent) {
    if (backdropPress && Math.hypot(event.clientX - backdropPress.x, event.clientY - backdropPress.y) > 10) {
      backdropPress = undefined;
    }
  }
</script>

<dialog
  {id}
  class={layout}
  class:fullscreen-on-mobile={fullscreenOnMobile}
  aria-label={label}
  aria-labelledby={labelledBy}
  aria-describedby={describedBy}
  {@attach attachModal}
  oncancel={(event) => { event.preventDefault(); onDismiss?.(); }}
  onpointerdown={(event) => {
    backdropPress = dismissOnBackdrop && event.button === 0 && isBackdrop(event)
      ? { x: event.clientX, y: event.clientY } : undefined;
  }}
  onpointermove={cancelBackdropTap}
  onpointercancel={() => (backdropPress = undefined)}
  onclick={(event) => {
    cancelBackdropTap(event);
    const dismiss = backdropPress && isBackdrop(event);
    backdropPress = undefined;
    if (dismiss) onDismiss?.();
  }}
>
  {@render children()}
</dialog>

<style>
  dialog {
    color: var(--text-primary);
    overscroll-behavior: contain;
  }

  dialog::backdrop {
    background: var(--modal-overlay);
    touch-action: none;
  }

  dialog:not(.sheet)::backdrop {
    backdrop-filter: blur(4px);
  }

  .centered {
    position: fixed;
    inset: 0;
    width: 100%;
    height: 100%;
    max-width: none;
    max-height: none;
    margin: 0;
    border: 0;
    padding: 16px;
    background: transparent;
    overflow: hidden;
    align-items: center;
    justify-content: center;
  }

  .centered[open] {
    display: flex;
  }

  .sheet {
    position: fixed;
    inset: auto 0 0;
    width: 100%;
    max-width: none;
    max-height: 78dvh;
    margin: 0;
    padding: 0;
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg) var(--radius-lg) 0 0;
    background: var(--bg-surface);
    box-shadow: var(--shadow-lg);
    overflow: hidden;
    text-align: start;
  }

  .sheet[open] {
    display: flex;
    flex-direction: column;
  }

  .preview {
    width: min(526px, max(286px, calc(70dvh + 46px)));
    max-width: calc(100% - 24px);
    max-height: calc(100% - 24px);
    margin: auto;
    padding: clamp(14px, 4vw, 22px);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-lg);
    background: var(--bg-surface);
    box-shadow: var(--shadow-lg);
    overflow: auto;
  }

  @media (prefers-reduced-motion: no-preference) {
    dialog[open],
    dialog[open]::backdrop {
      animation: layer-fade-in 180ms ease-out;
    }

    .sheet[open] {
      animation: sheet-enter 260ms cubic-bezier(0.22, 1, 0.36, 1);
    }
  }

  @keyframes sheet-enter {
    from {
      opacity: 0;
      transform: translateY(100%);
    }
    to {
      opacity: 1;
      transform: none;
    }
  }

  @media (max-width: 680px) {
    .fullscreen-on-mobile {
      padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
    }
  }
</style>
