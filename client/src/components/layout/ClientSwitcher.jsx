import { useEffect, useRef, useState } from 'react';
import { ChevronDown, FolderClosed, Globe, Check } from 'lucide-react';
import clsx from 'clsx';
import { useClientScope } from '../../context/ClientContext';

export default function ClientSwitcher() {
  const { clients, activeClient, activeClientId, setActiveClientId } = useClientScope();
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (clients.length === 0) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className={clsx(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border transition',
          activeClient
            ? 'border-slate-300 bg-white hover:bg-slate-50'
            : 'border-slate-200 bg-slate-50 hover:bg-slate-100'
        )}
      >
        {activeClient ? (
          <>
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: activeClient.color || '#3b82f6' }}
            />
            <span className="text-sm font-medium text-slate-800 max-w-[140px] truncate">
              {activeClient.name}
            </span>
          </>
        ) : (
          <>
            <Globe className="w-4 h-4 text-slate-500" />
            <span className="text-sm font-medium text-slate-700">All clients</span>
          </>
        )}
        <ChevronDown className={clsx('w-3.5 h-3.5 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>

      {open && (
        <div className="absolute top-full right-0 mt-2 w-64 bg-white rounded-xl shadow-lg border border-slate-200 z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-100">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Workspace</p>
          </div>
          <div className="py-1 max-h-80 overflow-y-auto">
            <button
              onClick={() => { setActiveClientId(null); setOpen(false); }}
              className={clsx(
                'w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50 transition',
                activeClientId == null && 'bg-blue-50/50'
              )}
            >
              <div className="w-7 h-7 rounded-lg bg-slate-100 flex items-center justify-center flex-shrink-0">
                <Globe className="w-3.5 h-3.5 text-slate-500" />
              </div>
              <div className="flex-1 text-left">
                <p className="font-medium text-slate-800">All clients</p>
                <p className="text-[11px] text-slate-500">See everything</p>
              </div>
              {activeClientId == null && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
            </button>

            {clients.map(c => {
              const isActive = c.id === activeClientId;
              return (
                <button
                  key={c.id}
                  onClick={() => { setActiveClientId(c.id); setOpen(false); }}
                  className={clsx(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-slate-50 transition',
                    isActive && 'bg-blue-50/50'
                  )}
                >
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
                    style={{ backgroundColor: c.color || '#3b82f6' }}
                  >
                    <FolderClosed className="w-3.5 h-3.5 text-white" />
                  </div>
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-medium text-slate-800 truncate">{c.name}</p>
                    <p className="text-[11px] text-slate-500">
                      {c.accountCount} account{c.accountCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  {isActive && <Check className="w-4 h-4 text-blue-600 flex-shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
