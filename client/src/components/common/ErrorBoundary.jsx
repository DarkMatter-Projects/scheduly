import { Component } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

// Catches any render-time error in the subtree (incl. lazy chunk load
// failures after a redeploy) and replaces the screen with a recovery card
// instead of letting React unmount the whole app to a white screen.
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    // Surface to the console for dev — no remote logger wired up yet.
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary caught:', error, info?.componentStack);
  }

  render() {
    if (this.state.error) {
      // Distinguish lazy-chunk failures from runtime errors so we can prompt
      // a reload (which fetches the latest build) instead of a blank retry.
      const isChunkError = /Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i
        .test(this.state.error?.message || '');

      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
          <div className="max-w-md w-full bg-white border border-slate-200 rounded-2xl p-6 text-center shadow-sm">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <h2 className="text-base font-semibold text-slate-900 mb-1">
              {isChunkError ? 'A new version was deployed' : 'Something went wrong'}
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              {isChunkError
                ? 'Reload the page to grab the latest version of the app.'
                : 'The page hit an unexpected error. Reloading usually fixes it.'}
            </p>
            <div className="text-[10px] text-slate-400 bg-slate-50 rounded p-2 mb-4 text-left font-mono break-words">
              {this.state.error?.message || String(this.state.error)}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              <RefreshCw className="w-4 h-4" />
              Reload
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
