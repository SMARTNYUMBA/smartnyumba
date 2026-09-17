/**
 * SmartNyumba Pro — Pagination Component
 *
 * Usage:
 *   <Pagination meta={data.meta} page={page} onPage={setPage} />
 *
 * meta shape: { total, page, limit, pages }
 */

export default function Pagination({ meta, page, onPage, className = '' }) {
  if (!meta || meta.pages <= 1) return null;

  const { total, pages, limit } = meta;
  const current = page || meta.page || 1;

  // Build visible page numbers: always show first, last, current ± 1
  const visible = new Set([1, pages, current, current - 1, current + 1].filter(p => p >= 1 && p <= pages));
  const pageNums = Array.from(visible).sort((a, b) => a - b);

  const from = (current - 1) * limit + 1;
  const to   = Math.min(current * limit, total);

  return (
    <div className={`flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-700 ${className}`}>
      {/* Summary */}
      <p className="text-sm text-slate-500 dark:text-slate-400">
        Showing <span className="font-medium text-slate-700 dark:text-slate-200">{from}–{to}</span> of{' '}
        <span className="font-medium text-slate-700 dark:text-slate-200">{total.toLocaleString()}</span> results
      </p>

      {/* Page controls */}
      <nav className="flex items-center gap-1" aria-label="Pagination">
        {/* Prev */}
        <button
          onClick={() => onPage(current - 1)}
          disabled={current <= 1}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300
            hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Previous page"
        >
          ← Prev
        </button>

        {/* Page numbers */}
        {pageNums.map((p, i) => {
          const prev = pageNums[i - 1];
          return (
            <span key={p} className="flex items-center gap-1">
              {prev && p - prev > 1 && (
                <span className="px-1 text-slate-400" aria-hidden="true">…</span>
              )}
              <button
                onClick={() => onPage(p)}
                aria-label={`Page ${p}`}
                aria-current={p === current ? 'page' : undefined}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition-colors ${
                  p === current
                    ? 'bg-brand-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {p}
              </button>
            </span>
          );
        })}

        {/* Next */}
        <button
          onClick={() => onPage(current + 1)}
          disabled={current >= pages}
          className="px-3 py-1.5 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300
            hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          aria-label="Next page"
        >
          Next →
        </button>
      </nav>
    </div>
  );
}
