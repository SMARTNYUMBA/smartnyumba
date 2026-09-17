import Modal from './Modal';

export default function Confirm({
  open, onClose, onConfirm,
  title, message, danger,
  confirmLabel,      // custom button label
  cancelLabel = 'Cancel',
  loading = false,
}) {
  const btnLabel = confirmLabel || (danger ? 'Delete' : 'Confirm');

  return (
    <Modal open={open} onClose={onClose} title={title || 'Confirm action'} size="sm">
      <div className="modal-body">
        <p className="text-slate-700 dark:text-slate-200 text-sm">{message}</p>
      </div>
      <div className="modal-footer">
        <button className="btn-secondary" onClick={onClose} disabled={loading}>
          {cancelLabel}
        </button>
        <button
          className={danger ? 'btn-danger' : 'btn-primary'}
          onClick={() => { onConfirm(); onClose(); }}
          disabled={loading}>
          {loading ? (
            <span className="flex items-center gap-2">
              <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              Processing…
            </span>
          ) : btnLabel}
        </button>
      </div>
    </Modal>
  );
}
