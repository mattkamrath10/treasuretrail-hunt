import { type CSSProperties } from 'react';
import { TriangleAlert as AlertTriangle, Loader } from 'lucide-react';
import { useScrollLock } from '../../hooks/useScrollLock';

/**
 * Reusable destructive-action confirmation modal.
 *
 * Every destructive action in the app (delete event, delete featured item,
 * etc.) routes through this so the styling, scroll-lock, and Apple-review
 * "confirm before destroy" requirement stay consistent. The confirm button
 * is red by default; pass `danger={false}` for a neutral confirmation.
 */
export default function ConfirmDialog({
  title,
  message,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  busy = false,
  danger = true,
  onConfirm,
  onCancel,
}: {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useScrollLock(true);

  return (
    <div
      className="tt-modal-overlay"
      style={st.overlay}
      onClick={() => { if (!busy) onCancel(); }}
      role="presentation"
    >
      <div
        className="tt-sheet"
        style={st.modal}
        data-scroll-lock-allow
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ ...st.iconWrap, background: danger ? 'var(--color-error-50, #fef2f2)' : 'var(--color-neutral-100)' }}>
          <AlertTriangle size={24} style={{ color: danger ? 'var(--color-error-600)' : 'var(--color-neutral-600)' }} />
        </div>
        <h2 style={st.title}>{title}</h2>
        <p style={st.desc}>{message}</p>

        <button
          onClick={onConfirm}
          disabled={busy}
          style={{
            ...st.confirmBtn,
            background: danger ? 'var(--color-error-600)' : 'var(--color-primary-600)',
            opacity: busy ? 0.6 : 1,
            cursor: busy ? 'not-allowed' : 'pointer',
          }}
        >
          {busy && <Loader size={16} style={{ color: '#fff', animation: 'spin 0.8s linear infinite' }} />}
          <span style={st.confirmText}>{confirmLabel}</span>
        </button>

        <button onClick={onCancel} disabled={busy} style={st.cancelBtn}>
          <span style={st.cancelText}>{cancelLabel}</span>
        </button>
      </div>
    </div>
  );
}

const st: Record<string, CSSProperties> = {
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    zIndex: 300,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 'var(--space-4)',
  },
  modal: {
    backgroundColor: 'var(--color-neutral-0)',
    borderRadius: 'var(--radius-xl)',
    width: '100%',
    maxWidth: '380px',
    padding: 'var(--space-5)',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    textAlign: 'center',
    boxShadow: 'var(--shadow-xl)',
    overflowY: 'auto',
  },
  iconWrap: {
    width: 52,
    height: 52,
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 'var(--space-3)',
  },
  title: {
    fontSize: 'var(--font-size-lg)',
    fontWeight: 'var(--font-weight-bold)',
    color: 'var(--color-neutral-900)',
    margin: 0,
  },
  desc: {
    fontSize: 'var(--font-size-sm)',
    color: 'var(--color-neutral-600)',
    lineHeight: 1.5,
    margin: 'var(--space-2) 0 var(--space-4)',
  },
  confirmBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 'var(--space-2)',
    width: '100%',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    border: 'none',
  },
  confirmText: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-bold)',
    color: '#fff',
  },
  cancelBtn: {
    width: '100%',
    padding: 'var(--space-3)',
    borderRadius: 'var(--radius-md)',
    background: 'transparent',
    border: 'none',
    marginTop: 'var(--space-2)',
  },
  cancelText: {
    fontSize: 'var(--font-size-sm)',
    fontWeight: 'var(--font-weight-semibold)',
    color: 'var(--color-neutral-600)',
  },
};
