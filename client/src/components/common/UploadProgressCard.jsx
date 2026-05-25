import { Upload, CheckCircle2, XCircle } from 'lucide-react';
import clsx from 'clsx';

// Floating bottom-right card that shows upload status. `state` drives the
// shape: 'uploading' → progress bar, 'success' → green tick (auto-dismiss
// via the parent), 'error' → red icon with retry hint.
//
// Bytes are stringified to MB so the user can sanity-check huge videos.
export default function UploadProgressCard({ state, percent = 0, loaded = 0, total = 0, fileCount = 1, errorMessage }) {
  if (state === 'idle') return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 bg-white border border-slate-200 rounded-xl shadow-2xl p-4 w-80 animate-in fade-in slide-in-from-bottom-2">
      <div className="flex items-center gap-3 mb-2">
        {state === 'uploading' && (
          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
            <Upload className="w-4 h-4 text-blue-600 animate-pulse" />
          </div>
        )}
        {state === 'success' && (
          <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
        )}
        {state === 'error' && (
          <div className="w-8 h-8 rounded-full bg-rose-50 flex items-center justify-center flex-shrink-0">
            <XCircle className="w-4 h-4 text-rose-600" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-slate-900">
            {state === 'uploading' && `Uploading ${fileCount} file${fileCount === 1 ? '' : 's'}…`}
            {state === 'success' && 'Upload complete'}
            {state === 'error' && 'Upload failed'}
          </p>
          <p className="text-[10px] text-slate-500">
            {state === 'uploading' && total > 0 && `${formatMB(loaded)} of ${formatMB(total)}`}
            {state === 'error' && errorMessage}
            {state === 'success' && 'Ready to attach'}
          </p>
        </div>
        {state === 'uploading' && (
          <span className="text-xs font-bold text-blue-600 tabular-nums">{percent}%</span>
        )}
      </div>

      {state === 'uploading' && (
        <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-[width] duration-200"
            style={{ width: `${percent}%` }}
          />
        </div>
      )}
    </div>
  );
}

function formatMB(bytes) {
  if (!bytes) return '0 MB';
  const mb = bytes / 1024 / 1024;
  if (mb < 1) return `${(mb * 1024).toFixed(0)} KB`;
  return `${mb.toFixed(1)} MB`;
}
