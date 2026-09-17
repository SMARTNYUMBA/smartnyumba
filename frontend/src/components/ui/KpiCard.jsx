/**
 * KpiCard — redesigned with Fraunces italic numbers.
 * The big value is displayed in a serif italic weight that makes
 * metrics feel premium and distinct from body copy.
 */

const COLOR_MAP = {
  brand:  { dot: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: '#B45309' },
  green:  { dot: '#16A34A', bg: '#F0FDF4', border: '#BBF7D0', label: '#15803D' },
  red:    { dot: '#DC2626', bg: '#FFF1F2', border: '#FECDD3', label: '#BE123C' },
  amber:  { dot: '#F59E0B', bg: '#FFFBEB', border: '#FDE68A', label: '#92400E' },
  blue:   { dot: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: '#1D4ED8' },
  purple: { dot: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', label: '#5B21B6' },
  teal:   { dot: '#0D9488', bg: '#F0FDFA', border: '#99F6E4', label: '#0F766E' },
  slate:  { dot: '#475569', bg: '#F8FAFC', border: '#E2E8F0', label: '#334155' },
};

export default function KpiCard({ label, value, icon, color = 'brand', sub, loading = false, onClick, trend }) {
  const c = COLOR_MAP[color] || COLOR_MAP.brand;

  if (loading) {
    return (
      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '1.125rem' }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: '#ECEAE4' }} className="skeleton flex-shrink-0" />
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ width: 80, height: 10, borderRadius: 5 }} className="skeleton" />
            <div style={{ width: 120, height: 26, borderRadius: 6 }} className="skeleton" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--surface)',
        borderRadius: 14,
        border: '1px solid var(--border)',
        padding: '1.125rem',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 0.15s ease',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.boxShadow = '0 4px 20px rgba(0,0,0,0.08)'; e.currentTarget.style.transform = 'translateY(-1px)'; }}}
      onMouseLeave={e => { e.currentTarget.style.boxShadow = ''; e.currentTarget.style.transform = ''; }}
    >
      {/* Subtle accent bar at top */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: c.dot, borderRadius: '14px 14px 0 0', opacity: 0.6 }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
        {/* Icon */}
        <div style={{ width: 36, height: 36, borderRadius: 9, background: c.bg, border: `1px solid ${c.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 16 }}>
          {icon}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-muted)', marginBottom: 2 }}>
            {label}
          </p>
          {/* Fraunces italic value — the signature of this redesign */}
          <p style={{
            fontFamily: 'Fraunces, Georgia, serif',
            fontStyle: 'italic',
            fontWeight: 700,
            fontSize: 26,
            lineHeight: 1,
            color: 'var(--text-primary)',
            letterSpacing: '-0.02em',
            marginBottom: sub ? 4 : 0,
          }}>
            {value}
          </p>
          {sub && (
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>{sub}</p>
          )}
        </div>

        {/* Trend indicator */}
        {trend !== undefined && (
          <div style={{ fontSize: 11, fontWeight: 700, color: trend >= 0 ? 'var(--green)' : 'var(--red)', background: trend >= 0 ? 'var(--green-bg)' : 'var(--red-bg)', borderRadius: 100, padding: '2px 7px', flexShrink: 0 }}>
            {trend >= 0 ? '↑' : '↓'} {Math.abs(trend)}%
          </div>
        )}
      </div>
    </div>
  );
}
