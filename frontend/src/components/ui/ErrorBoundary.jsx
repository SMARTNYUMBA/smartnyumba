import { Component } from 'react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, retries: 0 };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    // Log to console in dev; in production could send to Sentry
    if (process.env.NODE_ENV !== 'production') {
      console.error('[ErrorBoundary]', error.message, info.componentStack);
    }
  }

  retry = () => {
    this.setState(s => ({ hasError: false, error: null, retries: s.retries + 1 }));
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    const isChunkError = this.state.error?.message?.includes('Loading chunk') ||
                         this.state.error?.message?.includes('Failed to fetch');

    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-slate-50 dark:bg-slate-900 p-6">
        <div className="max-w-md w-full bg-white dark:bg-slate-800 rounded-2xl shadow-xl p-8 text-center">
          <div className="text-5xl mb-4">{isChunkError ? '📦' : '⚠️'}</div>
          <h1 className="text-xl font-bold text-slate-800 dark:text-white mb-2">
            {isChunkError ? 'Update available' : 'Something went wrong'}
          </h1>
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-6">
            {isChunkError
              ? 'A new version of SmartNyumba was deployed. Please refresh to load the latest version.'
              : this.props.message || 'An unexpected error occurred. Try again or return to your dashboard.'}
          </p>

          {process.env.NODE_ENV !== 'production' && this.state.error && !isChunkError && (
            <details className="text-left mb-5">
              <summary className="text-xs text-slate-400 cursor-pointer mb-1">Error details</summary>
              <pre className="text-xs bg-slate-100 dark:bg-slate-700 rounded-xl p-3 overflow-auto text-red-600 dark:text-red-400 max-h-32">
                {this.state.error.message}
              </pre>
            </details>
          )}

          <div className="flex gap-3 justify-center flex-wrap">
            <button onClick={this.retry} className="btn-secondary">
              ↺ Try again
            </button>
            <button onClick={() => window.location.reload()} className="btn-primary">
              🔄 Reload page
            </button>
            {!isChunkError && (
              <button onClick={() => window.location.href = '/'} className="btn-ghost">
                ← Dashboard
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }
}
