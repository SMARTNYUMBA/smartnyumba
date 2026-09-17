import { useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { getProperties } from '../../api';
import { useProperty } from '../../context/PropertyContext';
import { useAuth } from '../../context/AuthContext';

export default function PropertySelector() {
  const { user } = useAuth();
  const { propertyId, setPropertyId } = useProperty();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const ref = useRef();

  const canFilter = user?.role === 'super_admin' || user?.role === 'property_manager';
  if (!canFilter) return null;

  const { data: props } = useQuery({
    queryKey: ['properties'],
    queryFn: () => getProperties().then(r => r.data.properties),
    staleTime: 60000,
  });

  const properties = props || [];
  const selected = properties.find(p => String(p.id) === String(propertyId));
  const filtered = search ? properties.filter(p => p.name.toLowerCase().includes(search.toLowerCase()) || p.location?.toLowerCase().includes(search.toLowerCase())) : properties;
  const showSearch = properties.length > 8;

  // Close on outside click
  useEffect(() => {
    const h = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const select = (id) => { setPropertyId(id ? String(id) : ''); setOpen(false); setSearch(''); };

  if (!properties.length) return null;

  // Simple select for ≤8 properties
  if (!showSearch) {
    return (
      <select
        className="input py-1.5 text-xs w-auto max-w-[200px] dark:bg-slate-700 dark:border-slate-600"
        value={propertyId}
        onChange={e => setPropertyId(e.target.value)}  /* e.target.value is always string */
        title="Filter by property"
      >
        <option value="">🌐 All properties</option>
        {properties.map(p => (
          <option key={p.id} value={p.id}>🏢 {p.name}</option>
        ))}
      </select>
    );
  }

  // Searchable dropdown for 9+ properties
  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-slate-50 dark:hover:bg-slate-600 transition text-xs font-medium text-slate-700 dark:text-slate-200 max-w-[200px]"
      >
        <span>{propertyId ? '🏢' : '🌐'}</span>
        <span className="truncate">{selected ? selected.name : 'All properties'}</span>
        <span className="text-slate-400 shrink-0">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="absolute top-10 left-0 z-50 w-64 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 overflow-hidden">
          <div className="p-2 border-b border-slate-100 dark:border-slate-700">
            <input
              autoFocus
              className="w-full px-3 py-1.5 text-xs rounded-lg bg-slate-50 dark:bg-slate-700 border border-slate-200 dark:border-slate-600 outline-none"
              placeholder="Search properties..."
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>
          <div className="max-h-60 overflow-y-auto py-1">
            <button onClick={() => select('')}
              className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition ${!propertyId ? 'text-brand-600 font-semibold' : 'text-slate-700 dark:text-slate-300'}`}>
              <span>🌐</span> All properties
            </button>
            {filtered.map(p => (
              <button key={p.id} onClick={() => select(String(p.id))}
                className={`w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-slate-50 dark:hover:bg-slate-700 transition text-left ${String(propertyId) === String(p.id) ? 'text-brand-600 font-semibold' : 'text-slate-700 dark:text-slate-300'}`}>
                <span>🏢</span>
                <div className="min-w-0">
                  <p className="truncate">{p.name}</p>
                  {p.location && <p className="text-slate-400 text-[10px] truncate">{p.location}</p>}
                </div>
                {String(propertyId) === String(p.id) && <span className="ml-auto shrink-0 text-brand-600">✓</span>}
              </button>
            ))}
            {filtered.length === 0 && <p className="text-center py-3 text-xs text-slate-400">No matches</p>}
          </div>
        </div>
      )}
    </div>
  );
}
