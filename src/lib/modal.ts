let activeModals = 0;
let scrollX = 0;
let scrollY = 0;

export function isModalOpen() {
  return activeModals > 0;
}

export function attachModal(dialog: HTMLDialogElement) {
  const root = document.documentElement;
  const previousFocus = document.activeElement;
  if (activeModals === 0) {
    scrollX = window.scrollX;
    scrollY = window.scrollY;
    root.style.setProperty('--modal-scroll-x', `${-scrollX}px`);
    root.style.setProperty('--modal-scroll-y', `${-scrollY}px`);
    root.classList.add('modal-open');
  }

  activeModals += 1;
  dialog.showModal();

  return () => {
    if (dialog.open) dialog.close();
    activeModals -= 1;
    if (activeModals === 0) {
      root.classList.remove('modal-open');
      root.style.removeProperty('--modal-scroll-x');
      root.style.removeProperty('--modal-scroll-y');
      window.scrollTo({ left: scrollX, top: scrollY, behavior: 'instant' });
    }
    if (previousFocus instanceof HTMLElement && previousFocus.isConnected) {
      previousFocus.focus({ preventScroll: true });
    }
  };
}
