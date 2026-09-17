/**
 * Badge — updated to use CSS custom property tokens
 * Status values: active, inactive, paid, unpaid, overdue, partial, pending,
 *                completed, cancelled, open, closed, approved, rejected,
 *                in_progress, assigned, urgent, high, medium, low
 */
const STATUS = {
  active:      'badge-green',
  approved:    'badge-green',
  paid:        'badge-green',
  completed:   'badge-green',
  resolved:    'badge-green',
  inactive:    'badge-gray',
  cancelled:   'badge-gray',
  closed:      'badge-gray',
  none:        'badge-gray',
  pending:     'badge-amber',
  partial:     'badge-amber',
  in_progress: 'badge-amber',
  assigned:    'badge-amber',
  medium:      'badge-amber',
  unpaid:      'badge-red',
  overdue:     'badge-red',
  open:        'badge-red',
  rejected:    'badge-red',
  urgent:      'badge-red',
  high:        'badge-amber',
  low:         'badge-blue',
  verified:    'badge-teal',
  processing:  'badge-blue',
  trial:       'badge-purple',
  enterprise:  'badge-purple',
  professional:'badge-blue',
  starter:     'badge-gray',
};

export default function Badge({ status, label, className = '' }) {
  const cls = STATUS[status?.toLowerCase?.()] || 'badge-gray';
  return (
    <span className={`badge ${cls} ${className}`}>
      {label || status || '—'}
    </span>
  );
}
