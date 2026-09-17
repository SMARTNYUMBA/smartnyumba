import { useQuery } from '@tanstack/react-query';
import AppLayout from '../../components/layout/AppLayout';
import { getAnnouncements } from '../../api';
import { fmtDate } from '../../utils/helpers';

const priority = { urgent:'bg-red-100 text-red-700', high:'bg-orange-100 text-orange-700', normal:'bg-blue-100 text-blue-700', low:'bg-[--surface-muted] text-[--text-secondary]' };

export default function CaretakerAnnouncements() {
  const { data, isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn:  () => getAnnouncements().then(r => r.data.announcements || []),
  });

  return (
    <AppLayout title="Announcements">
      <div style={{display:"flex",flexDirection:"column",gap:12}}>
        {isLoading && <div className="text-center py-12 text-[--text-muted]">Loading…</div>}
        {!isLoading && !(data||[]).length && (
          <div className="card card-body text-center py-12">
            <p className="text-3xl mb-2">📢</p>
            <p className="text-[--text-muted]">No announcements</p>
          </div>
        )}
        {(data||[]).map(a => (
          <div key={a.id} className="card card-body">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${priority[a.priority]||priority.normal}`}>
                    {a.priority?.toUpperCase()}
                  </span>
                  {a.property_name && <span className="text-xs text-[--text-muted]">{a.property_name}</span>}
                </div>
                <h3 className="font-semibold text-[--text-primary]">{a.title}</h3>
                <p className="text-sm text-[--text-secondary] mt-1">{a.message}</p>
              </div>
              <span className="text-xs text-[--text-muted] whitespace-nowrap">{fmtDate(a.created_at)}</span>
            </div>
          </div>
        ))}
      </div>
    </AppLayout>
  );
}
