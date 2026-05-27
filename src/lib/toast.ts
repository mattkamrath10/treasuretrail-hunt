/**
 * Tiny ephemeral toast for lightweight success / error feedback.
 *
 * Intentionally framework-free — appends a div to <body> and removes it
 * after a short delay. Good enough for "Saved", "Link copied", "Failed to
 * add item" — for anything richer (action buttons, queueing, undo) we'd
 * want a real toast system.
 */

export type ToastKind = 'success' | 'error' | 'info';

const COLORS: Record<ToastKind, string> = {
  success: 'rgba(22, 101, 52, 0.95)',   // green-800
  error:   'rgba(153, 27, 27, 0.95)',   // red-800
  info:    'rgba(17, 17, 17, 0.92)',    // neutral
};

export function flashToast(msg: string, kind: ToastKind = 'info', durationMs = 2200) {
  if (typeof document === 'undefined') return;
  const el = document.createElement('div');
  el.textContent = msg;
  el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '88px',
    left: '50%',
    transform: 'translateX(-50%)',
    background: COLORS[kind],
    color: '#fff',
    padding: '10px 16px',
    borderRadius: '20px',
    fontSize: '13px',
    fontWeight: '600',
    zIndex: '9999',
    boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
    transition: 'opacity 200ms',
    opacity: '0',
    maxWidth: 'calc(100% - 32px)',
    textAlign: 'center',
  } as CSSStyleDeclaration);
  document.body.appendChild(el);
  requestAnimationFrame(() => { el.style.opacity = '1'; });
  setTimeout(() => {
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 250);
  }, durationMs);
}
