import { useQuery } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import KpiCard   from '../../components/ui/KpiCard';
import api from '../../api';
import { fmt } from '../../utils/helpers';

export default function OwnerProperties() {
  const { data, isLoading } = useQuery({
    queryKey: ['owner-properties'],
    queryFn: () => api.get('/owner/properties').then(r => r.data.properties),
  });

  const totals = (data||[]).reduce((acc, p) => {
    acc.units    += Number(p.total_units||0);
    acc.occupied += Number(p.occupied_units||0);
    acc.vacant   += Number(p.vacant_units||0);
    return acc;
  }, { units:0, occupied:0, vacant:0 });

  return (
    <AppLayout title="My Properties">
      <div className="grid grid-cols-3 gap-4 mb-6">
        <KpiCard label="Properties"    value={data?.length||0}  icon="🏢" color="brand" />
        <KpiCard label="Total units"   value={totals.units}     icon="🚪" color="teal"  />
        <KpiCard label="Vacant units"  value={totals.vacant}    icon="⚠️" color="amber" />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-20"><div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin"/></div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          {(data||[]).map((p, i) => {
            const occ = p.total_units > 0 ? Math.round((p.occupied_units / p.total_units) * 100) : 0;
            return (
              <div key={i} className="card card-body space-y-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-bold text-lg text-[--text-primary]">{p.name}</h3>
                    <p className="text-sm text-[--text-muted]">{p.location}</p>
                    {p.management_fee_pct > 0 && (
                      <span className="inline-block mt-1 text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full">
                        Mgmt fee: {p.management_fee_pct}%
                      </span>
                    )}
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold text-[--brand]">{occ}%</p>
                    <p className="text-xs text-[--text-muted]">occupied</p>
                  </div>
                </div>

                {/* Occupancy bar */}
                <div>
                  <div className="h-2 bg-[--surface-muted] rounded-full overflow-hidden">
                    <div className="h-full bg-[--brand] rounded-full transition-all" style={{ width: `${occ}%` }} />
                  </div>
                  <div className="flex justify-between text-xs text-[--text-muted] mt-1">
                    <span>{p.occupied_units} occupied</span>
                    <span>{p.vacant_units} vacant</span>
                    <span>{p.total_units} total</span>
                  </div>
                </div>

                {/* Manager info */}
                {p.manager_name && (
                  <div className="pt-3 border-t border-[--border]">
                    <p className="text-xs text-[--text-muted] uppercase tracking-wide mb-1">Property Manager</p>
                    <p className="text-sm font-medium">{p.manager_name}</p>
                    <div className="flex gap-3 mt-1">
                      {p.manager_phone && <a href={`tel:${p.manager_phone}`} className="text-xs text-[--brand] hover:underline">📞 {p.manager_phone}</a>}
                      {p.manager_email && <a href={`mailto:${p.manager_email}`} className="text-xs text-[--brand] hover:underline">✉️ Email</a>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </AppLayout>
  );
}
