import { useQuery } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import api from '../../api';
import { fmt, fmtDate } from '../../utils/helpers';

const TYPE_ICONS  = { water: '💧', electricity: '⚡', gas: '🔥', other: '📊' };
const TYPE_COLORS = { water: 'text-[--blue]', electricity: 'text-[--amber]', gas: 'text-orange-600', other: 'text-[--text-secondary]' };

export default function TenantUtilities() {
  const { data, isLoading } = useQuery({
    queryKey: ['my-utility-readings'],
    queryFn:  () => api.get('/utilities/my').then(r => r.data),
  });

  const readings = data?.readings || [];
  const unit     = data?.unit;

  // Group by utility type for summary cards
  const summary = readings.reduce((acc, r) => {
    const t = r.utility_type || 'other';
    if (!acc[t]) acc[t] = { count: 0, total_amount: 0, latest: null };
    acc[t].count++;
    acc[t].total_amount += Number(r.total_amount || 0);
    if (!acc[t].latest || r.reading_date > acc[t].latest.reading_date) acc[t].latest = r;
    return acc;
  }, {});

  return (
    <AppLayout title="Utility Bills">
      <div style={{display:"flex",flexDirection:"column",gap:20}}>

        {/* Unit header */}
        {unit && (
          <div className="card card-body py-3 flex items-center gap-3">
            <span className="text-2xl">🏠</span>
            <div>
              <p className="font-semibold text-[--text-primary]">Unit {unit.unit_number}</p>
              <p className="text-sm text-[--text-muted]">{unit.property_name}</p>
            </div>
          </div>
        )}

        {/* Summary cards */}
        {Object.keys(summary).length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {Object.entries(summary).map(([type, s]) => (
              <div key={type} className="card card-body">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xl">{TYPE_ICONS[type] || '📊'}</span>
                  <p className="font-semibold capitalize text-[--text-primary]">{type}</p>
                </div>
                <p className={`text-2xl font-bold ${TYPE_COLORS[type] || 'text-[--text-secondary]'}`}>
                  {s.latest ? `${Number(s.latest.units_consumed || 0).toFixed(1)} units` : '—'}
                </p>
                <p className="text-xs text-[--text-muted] mt-1">
                  Latest: {s.latest ? fmtDate(s.latest.reading_date) : '—'}
                </p>
                <p className="text-sm text-[--text-muted] mt-1">
                  Last bill: <span className="font-medium">{fmt(s.latest?.total_amount || 0)}</span>
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Reading history table */}
        <div className="card card-body">
          <h2 className="text-sm font-semibold text-[--text-primary] mb-4">
            Reading history
          </h2>

          {isLoading ? (
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {[...Array(4)].map((_,i) => (
                <div key={i} className="h-12 bg-[--surface-muted] rounded animate-pulse" />
              ))}
            </div>
          ) : !readings.length ? (
            <div className="text-center py-10 text-[--text-muted]">
              <p className="text-3xl mb-3">📊</p>
              <p className="font-medium text-[--text-muted]">No utility readings yet</p>
              <p className="text-sm mt-1">Your caretaker will record water and electricity readings here</p>
            </div>
          ) : (
            <>
              {/* Header */}
              <div className="grid grid-cols-12 gap-2 text-xs font-semibold text-[--text-muted] uppercase tracking-wide pb-2 border-b border-[--border]">
                <div className="col-span-2">Date</div>
                <div className="col-span-2">Type</div>
                <div className="col-span-2 text-right">Previous</div>
                <div className="col-span-2 text-right">Current</div>
                <div className="col-span-2 text-right">Consumed</div>
                <div className="col-span-2 text-right">Bill</div>
              </div>

              {/* Rows */}
              {readings.map((r, i) => (
                <div key={i}
                  className="grid grid-cols-12 gap-2 py-3 border-b border-slate-50 text-sm items-center hover:bg-[--surface-muted] transition-colors">
                  <div className="col-span-2 text-[--text-muted] text-xs">{fmtDate(r.reading_date)}</div>
                  <div className="col-span-2">
                    <span className="flex items-center gap-1">
                      <span>{TYPE_ICONS[r.utility_type] || '📊'}</span>
                      <span className={`capitalize text-xs font-medium ${TYPE_COLORS[r.utility_type] || ''}`}>
                        {r.utility_type}
                      </span>
                    </span>
                  </div>
                  <div className="col-span-2 text-right text-[--text-muted]">
                    {Number(r.previous_reading || 0).toFixed(1)}
                  </div>
                  <div className="col-span-2 text-right text-[--text-primary] font-medium">
                    {Number(r.current_reading || 0).toFixed(1)}
                  </div>
                  <div className="col-span-2 text-right">
                    <span className="font-semibold text-[--text-primary]">
                      {Number(r.units_consumed || 0).toFixed(1)}
                    </span>
                    <span className="text-xs text-[--text-muted] ml-1">units</span>
                  </div>
                  <div className="col-span-2 text-right">
                    {Number(r.total_amount) > 0 ? (
                      <span className="font-bold text-[--text-primary]">{fmt(r.total_amount)}</span>
                    ) : (
                      <span className="text-[--text-muted] text-xs">—</span>
                    )}
                  </div>
                </div>
              ))}

              <p className="text-xs text-[--text-muted] text-center mt-4">
                Showing last {readings.length} readings for your unit
              </p>
            </>
          )}
        </div>

        {/* Note */}
        <p className="text-xs text-center text-[--text-muted]">
          Utility charges are billed separately from rent.
          Check <a href="/tenant/invoices" className="text-[--brand] hover:underline">My Invoices</a> to see outstanding utility bills.
        </p>
      </div>
    </AppLayout>
  );
}
