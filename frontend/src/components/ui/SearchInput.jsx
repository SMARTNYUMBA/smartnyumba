import { MagnifyingGlassIcon } from '@heroicons/react/24/outline';
export default function SearchInput({ value, onChange, placeholder = 'Search...' }) {
  return (
    <div className="relative">
      <MagnifyingGlassIcon className="absolute left-3 top-2.5 w-4 h-4 text-slate-400" />
      <input className="input pl-9 w-64" value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  );
}
