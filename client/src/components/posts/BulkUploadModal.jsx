import { useState } from 'react';
import Papa from 'papaparse';
import { useMutation } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Upload, X, Download, CheckCircle, AlertTriangle } from 'lucide-react';
import { bulkCreatePosts } from '../../api/postsApi';

// Bulk CSV upload — designer hands off a spreadsheet, we parse on the
// client and submit the array to /api/posts/bulk in one request. Per-row
// failures come back in the response so we can show what worked and what
// needs fixing.
//
// Expected CSV columns (case-insensitive headers):
//   caption       (required)        — the post body
//   accounts      (required)        — comma-separated account names, IDs, or @handles
//   scheduled_at  (optional)        — ISO datetime, schedules + publishes
//   title         (optional)        — internal title
//   first_comment (optional)        — Instagram first comment text

const TEMPLATE_CSV = [
  'caption,accounts,scheduled_at,title,first_comment',
  '"Hello world from our brand!","@dmmtiu, Glow Bright","2026-06-10T09:00:00","Welcome post","#welcome #darkmatter"',
  '"Don\'t miss our launch this Friday","@dmmtiu","2026-06-12T16:00:00","Launch teaser",',
].join('\n');

export default function BulkUploadModal({ accounts, onClose, onDone }) {
  const [rows, setRows] = useState(null);
  const [errors, setErrors] = useState([]);
  const [results, setResults] = useState(null);

  // Resolve a comma-separated cell into actual account IDs. We try
  // three formats in order:
  //   1. Numeric ID — "42"
  //   2. Exact friendly name — "DarkMatter Marketing"
  //   3. @handle — "@dmmtiu" matches X's @dmmtiu, IG's dmmtiu, TikTok's
  //      dmmtiu. We strip the leading @ from both the token and the
  //      stored name before comparing so the CSV can be written
  //      naturally regardless of platform convention.
  function resolveAccountIds(value) {
    if (!value) return [];
    const tokens = String(value).split(',').map(t => t.trim()).filter(Boolean);
    const strip = (s) => String(s || '').replace(/^@/, '').toLowerCase();
    return tokens.map(t => {
      const byId   = accounts.find(a => String(a.id) === t);
      if (byId) return byId.id;
      const byName = accounts.find(a => a.accountName?.toLowerCase() === t.toLowerCase());
      if (byName) return byName.id;
      const byHandle = accounts.find(a => strip(a.accountName) === strip(t));
      if (byHandle) return byHandle.id;
      return null;
    }).filter(Boolean);
  }

  const handleFile = (file) => {
    setErrors([]);
    setResults(null);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase().replace(/\s+/g, '_'),
      complete: (out) => {
        const parsed = [];
        const localErrors = [];
        for (let i = 0; i < out.data.length; i++) {
          const r = out.data[i];
          const caption = r.caption || r.content || r.body || '';
          const targetAccountIds = resolveAccountIds(r.accounts || r.account || '');
          if (!caption.trim()) {
            localErrors.push({ index: i, error: 'caption empty' });
            continue;
          }
          if (targetAccountIds.length === 0) {
            localErrors.push({ index: i, error: `couldn't resolve accounts: ${r.accounts || '(empty)'}` });
            continue;
          }
          parsed.push({
            content: caption,
            title: r.title || undefined,
            targetAccountIds,
            scheduledAt: r.scheduled_at || r.scheduledat || undefined,
            instagramFirstComment: r.first_comment || r.firstcomment || undefined,
          });
        }
        setRows(parsed);
        setErrors(localErrors);
        if (parsed.length === 0 && localErrors.length === 0) {
          toast.error('No rows found — check the CSV format');
        }
      },
      error: (err) => toast.error(`Parse failed: ${err.message}`),
    });
  };

  const submitMut = useMutation({
    mutationFn: () => bulkCreatePosts(rows),
    onSuccess: (data) => {
      setResults(data);
      if (data.failed === 0) {
        toast.success(`${data.ok} posts created`);
        setTimeout(onDone, 1500);
      } else {
        toast(`${data.ok} created, ${data.failed} failed`, { icon: '⚠️' });
      }
    },
    onError: (err) => toast.error(err.response?.data?.error || err.message),
  });

  const downloadTemplate = () => {
    const blob = new Blob([TEMPLATE_CSV], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'scheduly-bulk-template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <div className="flex items-center gap-2">
            <Upload className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-slate-900">Bulk upload posts</h3>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-auto px-5 py-4 space-y-4">
          {!rows && !results && (
            <>
              <p className="text-xs text-slate-600 leading-relaxed">
                Upload a CSV where each row is a post. Required columns: <code className="bg-slate-100 px-1 rounded">caption</code>{' '}
                and <code className="bg-slate-100 px-1 rounded">accounts</code> (comma-separated account names, numeric IDs, or @handles).
                Optional: <code className="bg-slate-100 px-1 rounded">scheduled_at</code> (ISO datetime),
                <code className="bg-slate-100 px-1 rounded ml-1">title</code>,
                <code className="bg-slate-100 px-1 rounded ml-1">first_comment</code>.
              </p>
              <button
                onClick={downloadTemplate}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-blue-700 hover:underline"
              >
                <Download className="w-3 h-3" /> Download template CSV
              </button>
              <label className="block border-2 border-dashed border-slate-300 rounded-lg p-8 text-center cursor-pointer hover:border-blue-400 transition">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                  className="hidden"
                />
                <Upload className="w-8 h-8 mx-auto text-slate-400 mb-2" />
                <p className="text-sm font-medium text-slate-700">Click to upload CSV</p>
                <p className="text-[10px] text-slate-400 mt-1">or drag and drop</p>
              </label>
            </>
          )}

          {rows && !results && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-slate-700">
                  Parsed {rows.length} valid row{rows.length === 1 ? '' : 's'}
                  {errors.length > 0 && <span className="text-amber-700"> · {errors.length} skipped</span>}
                </p>
                <button onClick={() => { setRows(null); setErrors([]); }} className="text-[11px] text-slate-500 hover:underline">
                  Re-upload
                </button>
              </div>
              {errors.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 max-h-32 overflow-auto text-xs space-y-1">
                  {errors.map(e => (
                    <div key={e.index} className="text-amber-800">Row {e.index + 1}: {e.error}</div>
                  ))}
                </div>
              )}
              <div className="border border-slate-200 rounded-lg overflow-auto max-h-96">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium text-slate-500">Caption</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-500">Accounts</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-500">Scheduled</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, i) => (
                      <tr key={i} className="border-b border-slate-100">
                        <td className="px-2 py-2 text-slate-800 max-w-md truncate">{r.content}</td>
                        <td className="px-2 py-2 text-slate-600">{r.targetAccountIds.length}</td>
                        <td className="px-2 py-2 text-slate-500 tabular-nums whitespace-nowrap">{r.scheduledAt || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {results && (
            <div className="space-y-2 text-xs">
              <p className="font-medium text-slate-700">
                {results.ok} created · {results.failed} failed
              </p>
              <div className="border border-slate-200 rounded-lg overflow-auto max-h-96">
                <table className="min-w-full text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                    <tr>
                      <th className="px-2 py-2 text-left font-medium text-slate-500">Row</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-500">Status</th>
                      <th className="px-2 py-2 text-left font-medium text-slate-500">Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {results.results.map(r => (
                      <tr key={r.index} className="border-b border-slate-100">
                        <td className="px-2 py-1.5 tabular-nums text-slate-600">{r.index + 1}</td>
                        <td className="px-2 py-1.5">
                          {r.ok
                            ? <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle className="w-3 h-3" /> ok</span>
                            : <span className="inline-flex items-center gap-1 text-rose-700"><AlertTriangle className="w-3 h-3" /> failed</span>}
                        </td>
                        <td className="px-2 py-1.5 text-slate-600">{r.ok ? `post #${r.postId}` : r.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-slate-200 px-5 py-3 flex items-center justify-end gap-2 bg-white">
          <button onClick={onClose} className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-md">
            {results ? 'Close' : 'Cancel'}
          </button>
          {rows && !results && (
            <button
              onClick={() => submitMut.mutate()}
              disabled={rows.length === 0 || submitMut.isPending}
              className="px-4 py-1.5 text-xs font-semibold rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
            >
              {submitMut.isPending ? `Creating ${rows.length}…` : `Create ${rows.length} posts`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
