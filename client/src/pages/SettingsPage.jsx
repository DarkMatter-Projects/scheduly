import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listUsers, createUser, updateUser, deactivateUser } from '../api/usersApi';
import { getYoutubeQuota } from '../api/socialApi';
import toast from 'react-hot-toast';
import { Plus, Pencil, Trash2, X, ExternalLink } from 'lucide-react';
import clsx from 'clsx';

const ROLES = ['admin', 'manager', 'editor', 'viewer'];

function UserModal({ user, onClose, onSave }) {
  const [form, setForm] = useState(
    user
      ? { email: user.email, firstName: user.firstName, lastName: user.lastName, role: user.role, password: '' }
      : { email: '', firstName: '', lastName: '', role: 'editor', password: '' }
  );
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = { ...form };
      if (user && !data.password) delete data.password;
      await onSave(data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to save user');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900">
            {user ? 'Edit User' : 'Add User'}
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">First Name</label>
              <input
                type="text"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Last Name</label>
              <input
                type="text"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password {user && <span className="text-gray-400">(leave blank to keep current)</span>}
            </label>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
              {...(!user && { required: true, minLength: 8 })}
              placeholder={user ? 'Leave blank to keep current' : 'Min 8 characters'}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full px-3 py-2 rounded-lg border border-gray-300 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none text-sm"
            >
              {ROLES.map(r => (
                <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
              ))}
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition disabled:opacity-50"
            >
              {saving ? 'Saving...' : user ? 'Update' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: listUsers });
  const { data: youtubeQuota } = useQuery({
    queryKey: ['youtubeQuota'],
    queryFn: getYoutubeQuota,
    refetchInterval: 60000,
  });
  const [modalUser, setModalUser] = useState(null);
  const [showModal, setShowModal] = useState(false);

  const handleSave = async (data) => {
    if (modalUser) {
      await updateUser(modalUser.id, data);
      toast.success('User updated');
    } else {
      await createUser(data);
      toast.success('User created');
    }
    queryClient.invalidateQueries({ queryKey: ['users'] });
  };

  const handleDeactivate = async (user) => {
    if (!confirm(`Deactivate ${user.firstName} ${user.lastName}?`)) return;
    try {
      await deactivateUser(user.id);
      toast.success('User deactivated');
      queryClient.invalidateQueries({ queryKey: ['users'] });
    } catch (err) {
      toast.error('Failed to deactivate user');
    }
  };

  const roleBadgeColor = {
    admin: 'bg-red-100 text-red-700',
    manager: 'bg-blue-100 text-blue-700',
    editor: 'bg-green-100 text-green-700',
    viewer: 'bg-gray-100 text-gray-700',
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
      </div>

      {/* User Management */}
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="flex items-center justify-between p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">User Management</h2>
          <button
            onClick={() => { setModalUser(null); setShowModal(true); }}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-4 h-4" />
            Add User
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading users...</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100">
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Name</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Email</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Role</th>
                  <th className="text-left text-xs font-medium text-gray-500 uppercase px-5 py-3">Status</th>
                  <th className="text-right text-xs font-medium text-gray-500 uppercase px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map(u => (
                  <tr key={u.id} className="border-b border-gray-50 hover:bg-gray-50">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                          <span className="text-xs font-medium text-blue-700">
                            {u.firstName[0]}{u.lastName[0]}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-gray-900">{u.firstName} {u.lastName}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600">{u.email}</td>
                    <td className="px-5 py-3">
                      <span className={clsx('px-2.5 py-0.5 rounded-full text-xs font-medium', roleBadgeColor[u.role])}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-5 py-3">
                      <span className={clsx(
                        'px-2.5 py-0.5 rounded-full text-xs font-medium',
                        u.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                      )}>
                        {u.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => { setModalUser(u); setShowModal(true); }}
                          className="p-2 rounded-lg text-gray-400 hover:text-blue-600 hover:bg-blue-50 transition"
                        >
                          <Pencil className="w-4 h-4" />
                        </button>
                        {u.isActive && (
                          <button
                            onClick={() => handleDeactivate(u)}
                            className="p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* YouTube quota panel — shows the rolling 24h usage and links to the
          Google form for requesting a higher daily quota. */}
      <div className="bg-white rounded-xl border border-gray-200 mt-6">
        <div className="p-5 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">YouTube API Quota</h2>
          <p className="text-sm text-gray-500 mt-1">
            YouTube Data API v3 caps free-tier Google Cloud projects at 10,000 quota units per day.
            Each video upload costs 1,600 units.
          </p>
        </div>
        <div className="p-5 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">Uploads today</p>
            <p className="text-2xl font-bold text-slate-900">{youtubeQuota?.uploadsToday ?? '—'}</p>
            <p className="text-[11px] text-slate-500 mt-1">Rolling last 24 hours</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">Uploads remaining</p>
            <p className={clsx(
              'text-2xl font-bold',
              !youtubeQuota ? 'text-slate-400'
                : youtubeQuota.uploadsRemaining === 0 ? 'text-rose-600'
                : youtubeQuota.uploadsRemaining < 2 ? 'text-amber-600'
                : 'text-emerald-600'
            )}>
              {youtubeQuota?.uploadsRemaining ?? '—'}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              of {youtubeQuota ? Math.floor(youtubeQuota.dailyLimit / youtubeQuota.costPerUpload) : '—'} per day
            </p>
          </div>
          <div className="rounded-lg border border-slate-200 p-4">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 mb-1">Units consumed</p>
            <p className="text-2xl font-bold text-slate-900">{youtubeQuota?.unitsUsed ?? '—'}</p>
            <p className="text-[11px] text-slate-500 mt-1">of {youtubeQuota?.dailyLimit ?? '—'} units</p>
          </div>
        </div>
        <div className="px-5 pb-5">
          <div className="bg-blue-50/50 border border-blue-100 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-900 mb-1">Need more uploads per day?</p>
            <p className="text-xs text-blue-800 leading-relaxed">
              Google grants higher quotas after a brief audit. Approvals usually take 2–8 weeks.
              Fill out the YouTube API Services Audit &amp; Quota Extension form below, describing
              Scheduly's use case (multi-channel social scheduling for agencies). Once approved,
              set the new daily limit on the <code className="px-1 bg-white rounded text-[11px]">YOUTUBE_QUOTA_DAILY</code> env var.
            </p>
            <a
              href="https://support.google.com/youtube/contact/yt_api_form"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 mt-3 px-3 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
            >
              <ExternalLink className="w-3 h-3" />
              Request a quota increase
            </a>
          </div>
        </div>
      </div>

      {showModal && (
        <UserModal
          user={modalUser}
          onClose={() => setShowModal(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
