/**
 * SkeletonRow — animated placeholder while data loads.
 * Usage: {isLoading ? <SkeletonTable rows={5}/> : <Table .../>}
 */
export function SkeletonRow({ cols = 4 }) {
  return (
    <tr className="animate-pulse">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded" style={{ width: `${60 + (i * 17) % 35}%` }} />
        </td>
      ))}
    </tr>
  );
}

export function SkeletonTable({ rows = 5, cols = 4 }) {
  return (
    <tbody>
      {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} cols={cols} />)}
    </tbody>
  );
}

export function SkeletonCard() {
  return (
    <div className="animate-pulse bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
      <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-3" />
      <div className="h-8 bg-slate-200 dark:bg-slate-700 rounded w-1/2 mb-2" />
      <div className="h-3 bg-slate-100 dark:bg-slate-700/50 rounded w-2/3" />
    </div>
  );
}

export function SkeletonKpiRow({ count = 4 }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </div>
  );
}

export default SkeletonTable;
