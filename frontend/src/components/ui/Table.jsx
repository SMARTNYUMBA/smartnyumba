import { useState } from 'react';

/**
 * Table — redesigned with new design token layer.
 * Sortable columns, skeleton loading, empty state, row click.
 */
export function Table({
  columns = [], data = [], loading = false,
  skeletonCount = 6, emptyMsg = 'No records found',
  onRow, rowKey = 'id', compact = false,
}) {
  const [sortKey, setSortKey] = useState(null);
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (key) => {
    if (!key) return;
    setSortKey(k => { setSortDir(d => k === key ? (d === 'asc' ? 'desc' : 'asc') : 'asc'); return key; });
  };

  const sorted = (() => {
    if (!sortKey || !data?.length) return data;
    return [...data].sort((a, b) => {
      const cmp = String(a[sortKey] ?? '').localeCompare(String(b[sortKey] ?? ''), undefined, { numeric: true });
      return sortDir === 'asc' ? cmp : -cmp;
    });
  })();

  const py = compact ? '0.5rem' : '0.875rem';

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {columns.map((col, i) => (
              <th key={i}
                onClick={() => col.sortKey && handleSort(col.sortKey)}
                style={{
                  cursor: col.sortKey ? 'pointer' : 'default',
                  textAlign: col.align || 'left',
                  width: col.width,
                  userSelect: 'none',
                }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  {col.label}
                  {col.sortKey && (
                    <span style={{ fontSize: 10, opacity: sortKey === col.sortKey ? 1 : 0.35 }}>
                      {sortKey === col.sortKey ? (sortDir === 'asc' ? '↑' : '↓') : '↕'}
                    </span>
                  )}
                </span>
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {/* Skeleton */}
          {loading && Array.from({ length: skeletonCount }).map((_, ri) => (
            <tr key={ri}>
              {columns.map((_, ci) => (
                <td key={ci} style={{ padding: `${py} 1rem` }}>
                  <div className="skeleton" style={{ height: 14, width: `${50 + ((ri * 13 + ci * 17) % 40)}%` }} />
                </td>
              ))}
            </tr>
          ))}

          {/* Empty */}
          {!loading && !sorted?.length && (
            <tr>
              <td colSpan={columns.length} style={{ padding: '4rem 1rem', textAlign: 'center' }}>
                <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
                  {emptyMsg}
                </div>
              </td>
            </tr>
          )}

          {/* Rows */}
          {!loading && sorted?.map((row, ri) => (
            <tr key={row[rowKey] ?? ri}
              onClick={() => onRow?.(row)}
              style={{ cursor: onRow ? 'pointer' : 'default' }}>
              {columns.map((col, ci) => (
                <td key={ci}
                  style={{ padding: `${py} 1rem`, textAlign: col.align || 'left' }}>
                  {col.render ? col.render(row) : (row[col.key] ?? '—')}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * Pagination — clean token-based design.
 */
export function Pagination({ page, pages, total, limit, onChange }) {
  if (!pages || pages <= 1) return null;
  const start = (page - 1) * limit + 1;
  const end   = Math.min(page * limit, total);

  const visiblePages = (() => {
    if (pages <= 5) return Array.from({ length: pages }, (_, i) => i + 1);
    const start = Math.max(1, Math.min(pages - 4, page - 2));
    return Array.from({ length: 5 }, (_, i) => start + i);
  })();

  const BtnStyle = (active) => ({
    minWidth: 32, height: 32, borderRadius: 8, border: '1px solid',
    borderColor: active ? 'var(--brand)' : 'var(--border)',
    background: active ? 'var(--brand)' : 'var(--surface)',
    color: active ? 'white' : 'var(--text-secondary)',
    fontSize: 13, fontWeight: active ? 700 : 500, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    padding: '0 8px', transition: 'all 0.1s',
  });

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem', fontSize: 13, color: 'var(--text-muted)', flexWrap: 'wrap', gap: 8 }}>
      <span>Showing {start}–{end} of {total}</span>
      <div style={{ display: 'flex', gap: 4 }}>
        <button disabled={page <= 1} onClick={() => onChange(page - 1)} style={{ ...BtnStyle(false), opacity: page <= 1 ? 0.4 : 1 }}>← Prev</button>
        {visiblePages.map(p => (
          <button key={p} onClick={() => onChange(p)} style={BtnStyle(p === page)}>{p}</button>
        ))}
        <button disabled={page >= pages} onClick={() => onChange(page + 1)} style={{ ...BtnStyle(false), opacity: page >= pages ? 0.4 : 1 }}>Next →</button>
      </div>
    </div>
  );
}

export default Table;
