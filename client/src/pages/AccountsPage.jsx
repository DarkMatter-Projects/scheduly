import { useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { listAccounts, startFacebookAuth, startInstagramAuth, disconnectAccount, reconnectAccount } from '../api/socialApi';
import { useAuth } from '../context/AuthContext';
import { useClientScope } from '../context/ClientContext';
import toast from 'react-hot-toast';
import { Unlink, CheckCircle, AlertTriangle, XCircle, Plus, Lock } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { PLATFORMS, PLATFORM_ORDER, getPlatform } from '../utils/platforms';

const tokenStatusConfig = {
  valid: { label: 'Connected', icon: CheckCircle, color: 'text-emerald-600' },
  expiring: { label: 'Expiring Soon', icon: AlertTriangle, color: 'text-amber-600' },
  expired: { label: 'Expired', icon: XCircle, color: 'text-rose-600' },
};

function PlatformTile({ platform, accounts, onConnect, onDisconnect, onReconnect, isAdmin }) {
  const Icon = platform.icon;
  const platformAccounts = accounts.filter(a => a.platform === platform.key);
  const hasAccounts = platformAccounts.length > 0;

  return (
    <div className={clsx(
      'bg-white rounded-xl border p-5 relative',
      platform.available ? 'border-slate-200' : 'border-slate-200 opacity-90'
    )}>
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={clsx('w-11 h-11 rounded-xl flex items-center justify-center text-white', platform.bg)}>
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-slate-900">{platform.label}</h3>
            <p className="text-xs text-slate-500">{platform.sublabel}</p>
          </div>
        </div>
        {!platform.available && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            <Lock className="w-2.5 h-2.5" />
            Soon
          </span>
        )}
      </div>

      {/* Connected accounts */}
      {hasAccounts ? (
        <div className="space-y-2 mb-3">
          {platformAccounts.map(account => {
            const tokenStatus = tokenStatusConfig[account.tokenStatus] || tokenStatusConfig.valid;
            const StatusIcon = tokenStatus.icon;

            return (
              <div key={account.id} className="flex items-center gap-2 p-2 rounded-lg border border-slate-200 bg-slate-50/50">
                {account.profilePictureUrl ? (
                  <img src={account.profilePictureUrl} alt="" className="w-7 h-7 rounded-full object-cover flex-shrink-0" />
                ) : (
                  <div className={clsx('w-7 h-7 rounded-full flex-shrink-0', platform.bgSoft)} />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-900 truncate">{account.accountName}</p>
                  <div className="flex items-center gap-1.5">
                    <StatusIcon className={clsx('w-2.5 h-2.5', tokenStatus.color)} />
                    <span className={clsx('text-[10px]', tokenStatus.color)}>{tokenStatus.label}</span>
                    {account.clientName && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-px rounded-full"
                        style={{
                          backgroundColor: `${account.clientColor || '#3b82f6'}1a`,
                          color: account.clientColor || '#3b82f6',
                        }}
                        title={`Client: ${account.clientName}`}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: account.clientColor || '#3b82f6' }} />
                        {account.clientName}
                      </span>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <button
                    onClick={() => { if (confirm(`Remove ${account.accountName}? You'll need to reconnect to use it again.`)) onDisconnect(account.id); }}
                    className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded"
                    title="Remove"
                  >
                    <Unlink className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-xs text-slate-400 mb-3 italic">No accounts connected</p>
      )}

      {/* Connect button */}
      {isAdmin && (
        platform.available ? (
          <button
            onClick={() => onConnect(platform)}
            className={clsx(
              'w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-semibold rounded-lg transition',
              hasAccounts
                ? 'text-slate-700 bg-white border border-slate-200 hover:bg-slate-50'
                : clsx('text-white', platform.bg, 'hover:opacity-90')
            )}
          >
            <Plus className="w-3.5 h-3.5" />
            {hasAccounts ? `Add another ${platform.label}` : `Connect ${platform.label}`}
          </button>
        ) : (
          <button
            disabled
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-xs font-medium rounded-lg bg-slate-100 text-slate-400 cursor-not-allowed"
          >
            Coming Soon
          </button>
        )
      )}
    </div>
  );
}

export default function AccountsPage() {
  const { hasRole } = useAuth();
  const { activeClientId, activeClient } = useClientScope();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();

  const { data: allAccounts = [], isLoading } = useQuery({
    queryKey: ['socialAccounts'],
    queryFn: listAccounts,
  });

  // Scope to active client's accounts only (when set)
  const accounts = useMemo(
    () => activeClientId ? allAccounts.filter(a => a.clientId === activeClientId) : allAccounts,
    [allAccounts, activeClientId]
  );

  useEffect(() => {
    const connected = searchParams.get('connected');
    const error = searchParams.get('error');

    if (connected) {
      toast.success(`Successfully connected ${connected} account(s)!`);
      queryClient.invalidateQueries({ queryKey: ['socialAccounts'] });
      setSearchParams({});
    } else if (error) {
      const messages = {
        oauth_denied: 'Authorization was denied',
        invalid_state: 'Invalid session. Please try again.',
        connection_failed: 'Failed to connect accounts. Please try again.',
      };
      toast.error(messages[error] || 'Connection failed');
      setSearchParams({});
    }
  }, [searchParams]);

  const connectFacebookMutation = useMutation({
    mutationFn: () => startFacebookAuth(),
    onSuccess: (data) => { window.location.href = data.authUrl; },
    onError: () => toast.error('Failed to start connection. Check Facebook App settings.'),
  });

  const connectInstagramMutation = useMutation({
    mutationFn: () => startInstagramAuth(),
    onSuccess: (data) => { window.location.href = data.authUrl; },
    onError: () => toast.error('Failed to start Instagram connection. Check Instagram App settings.'),
  });

  const disconnectMut = useMutation({
    mutationFn: disconnectAccount,
    onSuccess: () => {
      toast.success('Account removed');
      queryClient.invalidateQueries({ queryKey: ['socialAccounts'] });
    },
  });

  const reconnectMut = useMutation({
    mutationFn: reconnectAccount,
    onSuccess: () => {
      toast.success('Account reconnected');
      queryClient.invalidateQueries({ queryKey: ['socialAccounts'] });
    },
  });

  const handleConnect = (platform) => {
    if (platform.connectVia === 'facebook') {
      connectFacebookMutation.mutate();
    } else if (platform.connectVia === 'instagram') {
      connectInstagramMutation.mutate();
    } else {
      toast(`${platform.label} integration coming soon!`, { icon: '🚀' });
    }
  };

  const isAdmin = hasRole('admin');
  const activeCount = accounts.filter(a => a.isActive).length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Social Accounts</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-slate-500 px-3 py-1 rounded-full bg-slate-100">
              {activeCount} connected
            </span>
          </div>
        </div>
        <p className="text-sm text-slate-500">
          {activeClient
            ? `Showing ${activeClient.name}'s connected accounts. Switch to "All clients" in the header to manage every account.`
            : 'Connect your social profiles to start scheduling posts.'}
        </p>
      </div>

      {/* Current Social Sets (inspired by Later) */}
      {activeCount > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-5 mb-6">
          <h2 className="text-sm font-semibold text-slate-900 mb-3">Main Group</h2>
          <div className="flex items-center gap-3 flex-wrap p-4 rounded-xl border border-dashed border-slate-200 bg-slate-50/50">
            {PLATFORM_ORDER.map(key => {
              const platform = PLATFORMS[key];
              const connectedAccount = accounts.find(a => a.platform === key && a.isActive);
              const Icon = platform.icon;

              if (connectedAccount) {
                return (
                  <div key={key} className="relative group" title={connectedAccount.accountName}>
                    {connectedAccount.profilePictureUrl ? (
                      <img
                        src={connectedAccount.profilePictureUrl}
                        alt={connectedAccount.accountName}
                        className="w-11 h-11 rounded-full object-cover ring-2 ring-white shadow"
                      />
                    ) : (
                      <div className={clsx('w-11 h-11 rounded-full flex items-center justify-center text-white ring-2 ring-white shadow', platform.bg)}>
                        <Icon className="w-5 h-5" />
                      </div>
                    )}
                    <div className={clsx(
                      'absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full flex items-center justify-center border-2 border-white',
                      platform.bg
                    )}>
                      <Icon className="w-2.5 h-2.5 text-white" />
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={key}
                  className={clsx(
                    'w-11 h-11 rounded-full border-2 border-dashed flex items-center justify-center',
                    platform.available ? 'border-slate-300' : 'border-slate-200'
                  )}
                  title={`${platform.label} - ${platform.available ? 'Not connected' : 'Coming soon'}`}
                >
                  <Icon className={clsx('w-4 h-4', platform.available ? 'text-slate-400' : 'text-slate-300')} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Platform Grid */}
      {isLoading ? (
        <div className="text-center py-12 text-slate-400">Loading accounts...</div>
      ) : (
        <div>
          <h2 className="text-sm font-semibold text-slate-700 mb-3 uppercase tracking-wider">Available Platforms</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {PLATFORM_ORDER.map(key => (
              <PlatformTile
                key={key}
                platform={PLATFORMS[key]}
                accounts={accounts}
                onConnect={handleConnect}
                onDisconnect={(id) => disconnectMut.mutate(id)}
                onReconnect={(id) => reconnectMut.mutate(id)}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        </div>
      )}

      {/* Setup guide if no accounts */}
      {accounts.length === 0 && !isLoading && isAdmin && (
        <div className="mt-6 bg-blue-50 border border-blue-200 rounded-xl p-5">
          <h3 className="text-sm font-semibold text-blue-900 mb-2">Getting started with Facebook & Instagram</h3>
          <ol className="text-sm text-blue-800 space-y-1 list-decimal list-inside">
            <li>Create a Facebook App at developers.facebook.com</li>
            <li>Add your App ID and Secret to the server .env file</li>
            <li>Set the OAuth redirect URI in your Facebook App settings</li>
            <li>Click "Connect Facebook" above to authorize</li>
          </ol>
        </div>
      )}
    </div>
  );
}
