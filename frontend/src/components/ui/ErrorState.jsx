import { useState } from 'react';

/**
 * ErrorState — shown when a useQuery fails.
 * Usage: {isError && <ErrorState message={error?.message} onRetry={refetch} />}
 */
export default function ErrorState({ message, onRetry, compact = false }) {
  if (compact) return (
    <div className="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800 text-sm">
      <span className="text-red-500 text-lg">⚠️</span>
      <span className="text-red-700 dark:text-red-400 flex-1">{message || 'Failed to load'}</span>
      {onRetry && <button onClick={onRetry} className="text-xs text-red-600 dark:text-red-400 hover:underline font-medium">Retry</button>}
    </div>
  );
  return (
    <div className="card card-body text-center py-10">
      <div className="text-4xl mb-3">⚠️</div>
      <p className="text-slate-600 dark:text-slate-400 font-medium mb-1">Failed to load data</p>
      {message && process.env.NODE_ENV !== 'production' && (
        <p className="text-slate-400 text-xs mb-3 font-mono">{message}</p>
      )}
      {onRetry && (
        <button onClick={onRetry} className="btn-secondary btn-sm mx-auto">
          ↻ Try again
        </button>
      )}
    </div>
  );
}
