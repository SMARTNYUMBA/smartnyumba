/**
 * ConfirmModal — replaces window.confirm() everywhere.
 * Usage:
 *   <ConfirmModal
 *     open={confirming}
 *     title="Delete property?"
 *     message="This will also remove all 12 units. This cannot be undone."
 *     confirmLabel="Delete permanently"
 *     danger
 *     onConfirm={doDelete}
 *     onClose={() => setConfirming(false)}
 *   />
 */
export default function ConfirmModal({ open, title, message, confirmLabel = 'Confirm', danger = false, onConfirm, onClose, busy = false }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="bg-white dark:bg-slate-800 rounded-t-2xl sm:rounded-2xl w-full sm:max-w-sm shadow-xl">
        <div className="p-5">
          <h3 className="font-semibold text-slate-800 dark:text-white text-base mb-2">{title}</h3>
          {message && <p className="text-slate-500 dark:text-slate-400 text-sm leading-relaxed">{message}</p>}
        </div>
        <div className="px-5 pb-5 flex gap-3">
          <button
            className="btn-secondary flex-1"
            onClick={onClose}
            disabled={busy}
          >Cancel</button>
          <button
            className={`flex-1 ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? 'Please wait…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
