import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

export default function LegalLayout({ title, lastUpdated, children }) {
  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-sm">
              <span className="text-white text-sm font-bold">S</span>
            </div>
            <div>
              <div className="text-slate-900 text-[15px] font-bold tracking-tight">Scheduly</div>
              <div className="text-slate-500 text-[10px] font-medium uppercase tracking-wider">by DMM</div>
            </div>
          </Link>
          <Link to="/" className="text-sm font-medium text-slate-600 hover:text-slate-900 flex items-center gap-1.5">
            <ArrowLeft className="w-4 h-4" />
            Back to app
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10">
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight mb-2">{title}</h1>
        {lastUpdated && (
          <p className="text-sm text-slate-500 mb-8">Last updated: {lastUpdated}</p>
        )}
        <div className="prose-legal space-y-6 text-[15px] leading-relaxed text-slate-700">
          {children}
        </div>
      </main>

      <footer className="border-t border-slate-200 mt-12 bg-white">
        <div className="max-w-3xl mx-auto px-6 py-6 flex items-center justify-between text-xs text-slate-500">
          <span>© {new Date().getFullYear()} Dark Matter Media (Pty) Ltd</span>
          <div className="flex items-center gap-4">
            <Link to="/terms" className="hover:text-slate-700">Terms</Link>
            <Link to="/privacy-policy" className="hover:text-slate-700">Privacy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

// Small heading/sub-heading helpers so each legal page reads consistently.
export function H2({ children }) {
  return <h2 className="text-xl font-semibold text-slate-900 mt-8 mb-2">{children}</h2>;
}
export function H3({ children }) {
  return <h3 className="text-base font-semibold text-slate-900 mt-4 mb-1">{children}</h3>;
}
export function P({ children }) {
  return <p>{children}</p>;
}
export function UL({ children }) {
  return <ul className="list-disc pl-6 space-y-1">{children}</ul>;
}
