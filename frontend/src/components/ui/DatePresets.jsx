import { subMonths, startOfMonth, endOfMonth, startOfYear, format } from 'date-fns';

/**
 * DatePresets — quick-select date range buttons.
 * Usage:
 *   <DatePresets onSelect={(from, to) => setFilters(p => ({...p, from, to}))} />
 */
const fmt = d => d ? format(d, 'yyyy-MM-dd') : '';

const PRESETS = [
  { label: 'This month',  getRange: () => { const n=new Date(); return [fmt(startOfMonth(n)), fmt(n)]; } },
  { label: 'Last month',  getRange: () => { const m=subMonths(new Date(),1); return [fmt(startOfMonth(m)), fmt(endOfMonth(m))]; } },
  { label: 'Last 3mo',    getRange: () => [fmt(subMonths(new Date(),3)), fmt(new Date())] },
  { label: 'This year',   getRange: () => [fmt(startOfYear(new Date())), fmt(new Date())] },
  { label: 'All time',    getRange: () => ['', ''] },
];

export default function DatePresets({ onSelect, className = '' }) {
  return (
    <div className={`flex flex-wrap gap-1.5 ${className}`}>
      {PRESETS.map(({ label, getRange }) => (
        <button
          key={label}
          type="button"
          onClick={() => { const [f,t] = getRange(); onSelect(f, t); }}
          className="px-3 py-1 text-xs rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:bg-brand-100 dark:hover:bg-brand-900/40 hover:text-brand-700 dark:hover:text-brand-300 transition-colors font-medium"
        >
          {label}
        </button>
      ))}
    </div>
  );
}
