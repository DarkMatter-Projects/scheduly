import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ChevronDown, FileText, Plus, Pencil, Trash2, X, Save } from 'lucide-react';
import clsx from 'clsx';
import toast from 'react-hot-toast';
import {
  listReplyTemplates, createReplyTemplate, updateReplyTemplate, deleteReplyTemplate,
} from '../../api/engageApi';

// "Templates" button + dropdown for the Engage reply box. Picks a template
// and inserts the body into the parent's draft via onInsert.
export default function ReplyTemplatesMenu({ onInsert }) {
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const containerRef = useRef(null);

  const { data: templates = [] } = useQuery({
    queryKey: ['engage-templates'],
    queryFn: listReplyTemplates,
    staleTime: 30 * 1000,
  });

  // Close dropdown when clicking outside.
  useEffect(() => {
    if (!open) return;
    const onClick = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  return (
    <>
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-slate-600 hover:bg-slate-100 rounded"
          title="Insert a saved reply"
        >
          <FileText className="w-3 h-3" />
          Templates
          <ChevronDown className="w-3 h-3" />
        </button>
        {open && (
          <div className="absolute left-0 bottom-full mb-1 w-72 bg-white border border-slate-200 rounded-lg shadow-lg z-20 max-h-[320px] flex flex-col">
            <div className="overflow-y-auto flex-1">
              {templates.length === 0 ? (
                <p className="px-3 py-4 text-xs text-slate-400 text-center">
                  No templates yet. Save your common replies to reuse them across conversations.
                </p>
              ) : (
                templates.map(t => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => { onInsert(t.body); setOpen(false); }}
                    className="w-full text-left px-3 py-2 hover:bg-slate-50 border-b border-slate-100 last:border-b-0"
                  >
                    <p className="text-xs font-semibold text-slate-900 truncate">{t.name}</p>
                    <p className="text-[11px] text-slate-500 line-clamp-2 mt-0.5">{t.body}</p>
                  </button>
                ))
              )}
            </div>
            <button
              type="button"
              onClick={() => { setOpen(false); setManageOpen(true); }}
              className="px-3 py-2 text-[11px] font-semibold text-blue-600 hover:bg-slate-50 border-t border-slate-200 flex items-center gap-1.5"
            >
              <Plus className="w-3 h-3" />
              Manage templates
            </button>
          </div>
        )}
      </div>

      {manageOpen && <ManageTemplatesModal onClose={() => setManageOpen(false)} />}
    </>
  );
}

// ── Management modal ──

function ManageTemplatesModal({ onClose }) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(null); // { id?, name, body }

  const { data: templates = [] } = useQuery({
    queryKey: ['engage-templates'],
    queryFn: listReplyTemplates,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['engage-templates'] });

  const saveMut = useMutation({
    mutationFn: (payload) => payload.id
      ? updateReplyTemplate(payload.id, { name: payload.name, body: payload.body })
      : createReplyTemplate({ name: payload.name, body: payload.body }),
    onSuccess: () => {
      invalidate();
      setEditing(null);
      toast.success('Saved');
    },
    onError: (err) => toast.error(err.response?.data?.error || 'Save failed'),
  });

  const deleteMut = useMutation({
    mutationFn: deleteReplyTemplate,
    onSuccess: () => { invalidate(); toast.success('Deleted'); },
    onError: (err) => toast.error(err.response?.data?.error || 'Delete failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
      <div className="bg-white w-full max-w-2xl rounded-2xl shadow-2xl flex flex-col max-h-[85vh]">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-900">Reply templates</h2>
          <button onClick={onClose} className="p-1.5 rounded hover:bg-slate-100 text-slate-500">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {editing ? (
            <TemplateForm
              initial={editing}
              onCancel={() => setEditing(null)}
              onSave={(form) => saveMut.mutate(form)}
              saving={saveMut.isPending}
            />
          ) : (
            <>
              {templates.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-8">
                  Saved replies will live here. Create your first one with the button below.
                </p>
              ) : (
                <div className="space-y-2">
                  {templates.map(t => (
                    <div key={t.id} className="border border-slate-200 rounded-lg p-3 flex items-start gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-900">{t.name}</p>
                        <p className="text-xs text-slate-600 whitespace-pre-wrap mt-1">{t.body}</p>
                        <p className="text-[10px] text-slate-400 mt-1.5">Saved by {t.userName}</p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        <button
                          onClick={() => setEditing(t)}
                          className="p-1.5 rounded hover:bg-slate-100 text-slate-500"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            if (confirm(`Delete "${t.name}"?`)) deleteMut.mutate(t.id);
                          }}
                          className="p-1.5 rounded hover:bg-rose-50 text-rose-600"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              <button
                onClick={() => setEditing({ name: '', body: '' })}
                className="mt-4 w-full text-xs font-semibold uppercase tracking-wide text-blue-700 border border-blue-200 bg-blue-50 hover:bg-blue-100 rounded-lg py-2 flex items-center justify-center gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" /> New template
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function TemplateForm({ initial, onSave, onCancel, saving }) {
  const [name, setName] = useState(initial.name || '');
  const [body, setBody] = useState(initial.body || '');

  return (
    <div>
      <div className="mb-3">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          maxLength={120}
          placeholder="e.g. Thanks for support"
          className="w-full text-sm px-3 py-2 rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>
      <div className="mb-4">
        <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">Body</label>
        <textarea
          value={body}
          onChange={e => setBody(e.target.value)}
          rows={6}
          placeholder="The text that gets inserted into the reply box…"
          className="w-full text-sm px-3 py-2 rounded-lg border border-slate-300 resize-y focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>
      <div className="flex justify-end gap-2">
        <button
          onClick={onCancel}
          className="px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-slate-600 hover:bg-slate-100 rounded"
        >
          Cancel
        </button>
        <button
          onClick={() => onSave({ id: initial.id, name: name.trim(), body: body.trim() })}
          disabled={saving || !name.trim() || !body.trim()}
          className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 rounded"
        >
          <Save className="w-3 h-3" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
