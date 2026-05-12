import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listClients, createClient, updateClient, deleteClient, assignAccountToClient } from '../api/clientsApi';
import { listAccounts } from '../api/socialApi';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';
import { Plus, FolderClosed, Pencil, Trash2, X, Save, Users } from 'lucide-react';
import clsx from 'clsx';
import { PLATFORMS } from '../utils/platforms';

const COLOR_SWATCHES = [
  '#3b82f6', '#10b981', '#f59e0b', '#ef4444',
  '#8b5cf6', '#ec4899', '#06b6d4', '#64748b',
];

function ClientForm({ initial, onSubmit, onCancel, submitLabel }) {
  const [name, setName] = useState(initial?.name || '');
  const [color, setColor] = useState(initial?.color || COLOR_SWATCHES[0]);
  const [notes, setNotes] = useState(initial?.notes || '');

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!name.trim()) return toast.error('Name is required');
    onSubmit({ name: name.trim(), color, notes: notes.trim() || null });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div>
        <label className="text-xs font-medium text-slate-600">Client name</label>
        <input
          type="text"
          value={name}
          onChange={e => setName(e.target.value)}
          autoFocus
          className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>
      <div>
        <label className="text-xs font-medium text-slate-600">Color</label>
        <div className="flex flex-wrap gap-1.5 mt-1">
          {COLOR_SWATCHES.map(c => (
            <button
              key={c}
              type="button"
              onClick={() => setColor(c)}
              className={clsx(
                'w-7 h-7 rounded-full ring-2 transition',
                color === c ? 'ring-slate-900 ring-offset-2' : 'ring-transparent'
              )}
              style={{ backgroundColor: c }}
              aria-label={`Color ${c}`}
            />
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-medium text-slate-600">Notes (optional)</label>
        <textarea
          value={notes}
          onChange={e => setNotes(e.target.value)}
          rows={2}
          className="w-full mt-1 px-3 py-2 text-sm rounded-lg border border-slate-300 focus:ring-2 focus:ring-blue-500 outline-none"
        />
      </div>
      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="px-3 py-1.5 text-sm rounded-lg text-slate-600 hover:bg-slate-100">
          Cancel
        </button>
        <button type="submit" className="px-3 py-1.5 text-sm font-medium rounded-lg bg-blue-600 text-white hover:bg-blue-700 flex items-center gap-1.5">
          <Save className="w-3.5 h-3.5" />
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

function AccountAssignment({ client, accounts, onAssign }) {
  const assigned = accounts.filter(a => a.clientId === client.id && a.isActive);
  // Only offer accounts that are (1) connected with a working token and
  // (2) not already assigned to any client. To move an account between
  // clients, unassign it from the current owner first.
  const available = accounts.filter(a =>
    a.isActive && a.clientId == null && a.tokenStatus !== 'expired'
  );
  const [picking, setPicking] = useState(false);

  return (
    <div className="mt-3 space-y-2">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">Accounts</p>
      {assigned.length === 0 ? (
        <p className="text-xs text-slate-400 italic">No accounts assigned yet</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {assigned.map(a => {
            const platform = PLATFORMS[a.platform];
            const Icon = platform?.icon;
            return (
              <div key={a.id} className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-slate-50 border border-slate-200">
                {Icon && <Icon className="w-3 h-3 text-slate-500" />}
                <span className="text-xs text-slate-700">{a.accountName}</span>
                <button
                  onClick={() => onAssign(null, a.id)}
                  className="text-slate-400 hover:text-rose-600"
                  title="Unassign"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {picking ? (
        <div className="space-y-1">
          {available.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No unassigned accounts available</p>
          ) : (
            available.map(a => {
              const platform = PLATFORMS[a.platform];
              const Icon = platform?.icon;
              return (
                <button
                  key={a.id}
                  onClick={() => { onAssign(client.id, a.id); setPicking(false); }}
                  className="w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-md hover:bg-slate-50 text-left"
                >
                  {Icon && <Icon className="w-3.5 h-3.5 text-slate-500" />}
                  <span className="text-slate-700">{a.accountName}</span>
                </button>
              );
            })
          )}
          <button onClick={() => setPicking(false)} className="text-xs text-slate-500 hover:text-slate-700">
            Cancel
          </button>
        </div>
      ) : (
        <button
          onClick={() => setPicking(true)}
          className="text-xs font-medium text-blue-600 hover:text-blue-700 flex items-center gap-1"
        >
          <Plus className="w-3 h-3" />
          Assign account
        </button>
      )}
    </div>
  );
}

export default function ClientsPage() {
  const queryClient = useQueryClient();
  const { hasRole } = useAuth();
  const canEdit = hasRole('admin', 'manager');

  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);

  const { data: clients = [], isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: listClients,
  });

  const { data: accounts = [] } = useQuery({
    queryKey: ['socialAccounts'],
    queryFn: listAccounts,
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['clients'] });
    queryClient.invalidateQueries({ queryKey: ['socialAccounts'] });
  };

  const createMut = useMutation({
    mutationFn: createClient,
    onSuccess: () => { toast.success('Client created'); invalidate(); setCreating(false); },
    onError: () => toast.error('Failed to create client'),
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => updateClient(id, data),
    onSuccess: () => { toast.success('Client updated'); invalidate(); setEditingId(null); },
    onError: () => toast.error('Failed to update client'),
  });

  const deleteMut = useMutation({
    mutationFn: deleteClient,
    onSuccess: () => { toast.success('Client deleted'); invalidate(); },
    onError: () => toast.error('Failed to delete client'),
  });

  const assignMut = useMutation({
    mutationFn: ({ clientId, socialAccountId }) => assignAccountToClient(clientId, socialAccountId),
    onSuccess: invalidate,
    onError: () => toast.error('Failed to update assignment'),
  });

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Clients</h1>
          <p className="text-sm text-slate-500 mt-1">Group your social accounts by client so posts stay organised.</p>
        </div>
        {canEdit && (
          <button
            onClick={() => setCreating(true)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            <Plus className="w-4 h-4" />
            New Client
          </button>
        )}
      </div>

      {creating && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-4">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Create client</h2>
          <ClientForm
            onSubmit={(data) => createMut.mutate(data)}
            onCancel={() => setCreating(false)}
            submitLabel="Create"
          />
        </div>
      )}

      {isLoading ? (
        <div className="text-center py-12 text-slate-400">Loading clients...</div>
      ) : clients.length === 0 && !creating ? (
        <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
          <FolderClosed className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500 font-medium">No clients yet</p>
          <p className="text-slate-400 text-sm mt-1">Create your first client to start organising accounts.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {clients.map(client => (
            <div key={client.id} className="bg-white rounded-xl border border-slate-200 p-5">
              {editingId === client.id ? (
                <ClientForm
                  initial={client}
                  onSubmit={(data) => updateMut.mutate({ id: client.id, data })}
                  onCancel={() => setEditingId(null)}
                  submitLabel="Save"
                />
              ) : (
                <>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: client.color || '#3b82f6' }}
                      >
                        <FolderClosed className="w-4 h-4 text-white" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-slate-900 truncate">{client.name}</h3>
                        <p className="text-xs text-slate-500 flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {client.accountCount} account{client.accountCount === 1 ? '' : 's'}
                        </p>
                      </div>
                    </div>
                    {canEdit && (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => setEditingId(client.id)}
                          className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded"
                          title="Edit"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => { if (confirm(`Delete client "${client.name}"? Accounts will be unassigned.`)) deleteMut.mutate(client.id); }}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {client.notes && (
                    <p className="text-xs text-slate-600 mt-3">{client.notes}</p>
                  )}

                  {canEdit && (
                    <AccountAssignment
                      client={client}
                      accounts={accounts}
                      onAssign={(clientId, socialAccountId) => assignMut.mutate({ clientId, socialAccountId })}
                    />
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
