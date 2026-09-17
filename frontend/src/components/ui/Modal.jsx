import { useEffect, useRef } from 'react';

/**
 * Modal — redesigned with the new design token layer.
 * Supports: sm / md / lg / xl sizes.
 * Children can use .modal-body and .modal-footer classes for standard padding.
 */
export default function Modal({ open, onClose, title, children, size = 'md', footer, closeOnBackdrop = true }) {
  const ref = useRef(null);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [open, onClose]);

  useEffect(() => { if (open) ref.current?.focus(); }, [open]);

  if (!open) return null;

  const maxW = { sm: 420, md: 540, lg: 740, xl: 960 }[size] || 540;

  return (
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label={title}>
      {/* Backdrop */}
      <div style={{ position: 'absolute', inset: 0 }} onClick={closeOnBackdrop ? onClose : undefined} aria-hidden="true" />

      {/* Panel */}
      <div
        ref={ref}
        tabIndex={-1}
        className="modal animate-slide-up"
        style={{ maxWidth: maxW, position: 'relative', outline: 'none' }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <h3 style={{
            fontFamily: 'Fraunces, Georgia, serif', fontStyle: 'italic',
            fontWeight: 700, fontSize: 17, color: 'var(--text-primary)', letterSpacing: '-0.01em',
          }}>
            {title}
          </h3>
          <button onClick={onClose}
            style={{ width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 7, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', transition: 'all 0.1s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-muted)'; e.currentTarget.style.color = 'var(--text-primary)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--text-muted)'; }}
            aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M2 2l10 10M12 2L2 12"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {children}
        </div>

        {/* Footer */}
        {footer && (
          <div style={{
            padding: '0.875rem 1.25rem',
            borderTop: '1px solid var(--border)',
            flexShrink: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8,
            background: 'var(--surface-muted)',
            borderRadius: '0 0 20px 20px',
          }}>
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

export function ConfirmModal({ open, onClose, onConfirm, title = 'Confirm', message = 'Are you sure?', confirmLabel = 'Confirm', danger = false, loading = false }) {
  return (
    <Modal open={open} onClose={onClose} title={title} size="sm"
      footer={<>
        <button onClick={onClose} disabled={loading} className="btn-secondary btn-sm">Cancel</button>
        <button onClick={onConfirm} disabled={loading} className={danger ? 'btn-danger btn-sm' : 'btn-primary btn-sm'}>
          {loading ? <><span style={{ width: 13, height: 13, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.3)', borderTopColor: 'white', display: 'inline-block' }} className="animate-spin" /> Processing…</> : confirmLabel}
        </button>
      </>}>
      <div style={{ padding: '1rem 1.25rem' }}>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.6 }}>{message}</p>
      </div>
    </Modal>
  );
}
