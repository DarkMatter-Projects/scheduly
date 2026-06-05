import { useState, useRef, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '../../context/AuthContext';
import { formatRelative } from '../../utils/time';
import { listThreads } from '../../api/engageApi';
import { listNotifications, markNotificationRead, markAllNotificationsRead } from '../../api/notificationsApi';
import { Menu, LogOut, ChevronDown, Search, Bell, Plus, Inbox, AlertTriangle, CheckCheck } from 'lucide-react';
import ClientSwitcher from './ClientSwitcher';

const pageTitles = {
  '/dashboard': 'Dashboard',
  '/posts': 'Posts',
  '/calendar': 'Calendar',
  '/posts/new': 'Create Post',
  '/media': 'Media Library',
  '/analytics': 'Analytics',
  '/ads': 'Ads',
  '/dashboards': 'Dashboards',
  '/engage': 'Engage',
  '/accounts': 'Social Accounts',
  '/settings': 'Settings',
};

export default function Header({ onMenuToggle }) {
  const { user, logout, isAuthenticated } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [bellOpen, setBellOpen] = useState(false);
  const dropdownRef = useRef(null);
  const bellRef = useRef(null);

  const queryClient = useQueryClient();
  // Recent unread Engage threads for the notification bell. Polls every 60s.
  const { data: unreadThreads = [] } = useQuery({
    queryKey: ['engage-unread-recent'],
    queryFn: () => listThreads({ feed: 'unread', limit: 10 }),
    refetchInterval: 60000,
    staleTime: 30000,
    enabled: isAuthenticated,
  });
  // System notifications (sentiment spikes etc). Same poll interval.
  const { data: notifications = [] } = useQuery({
    queryKey: ['notifications-recent'],
    queryFn: () => listNotifications(),
    refetchInterval: 60000,
    staleTime: 30000,
    enabled: isAuthenticated,
  });
  const unreadNotifs = notifications.filter(n => !n.isRead);
  const unreadCount = unreadThreads.length + unreadNotifs.length;
  const markRead = useMutation({
    mutationFn: (id) => markNotificationRead(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications-recent'] }),
  });
  const markAllRead = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['notifications-recent'] }),
  });

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
      if (bellRef.current && !bellRef.current.contains(e.target)) {
        setBellOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const title = pageTitles[location.pathname] ||
    (location.pathname.startsWith('/posts/') && location.pathname.endsWith('/edit') ? 'Edit Post' :
     location.pathname.startsWith('/posts/') ? 'Post' : '');

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 lg:px-8 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuToggle}
          className="lg:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100"
        >
          <Menu className="w-5 h-5" />
        </button>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
      </div>

      <div className="flex items-center gap-2">
        <ClientSwitcher />

        {/* Search placeholder */}
        <div className="hidden md:flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-lg text-slate-500 w-64">
          <Search className="w-4 h-4" />
          <span className="text-xs">Search posts, media...</span>
        </div>

        {/* Quick create */}
        <Link
          to="/posts/new"
          className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 shadow-sm shadow-blue-600/20"
        >
          <Plus className="w-4 h-4" />
          New Post
        </Link>

        {/* Notifications */}
        <div className="relative" ref={bellRef}>
          <button
            onClick={() => setBellOpen(o => !o)}
            className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 relative"
            title="Unread Engage threads"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {bellOpen && (
            <div className="absolute right-0 mt-2 w-96 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50 max-h-[520px] flex flex-col">
              {/* System alerts header */}
              {unreadNotifs.length > 0 && (
                <>
                  <div className="px-4 py-2.5 border-b border-slate-100 flex items-center justify-between bg-amber-50">
                    <p className="text-xs font-semibold text-amber-900 uppercase tracking-wide">Alerts</p>
                    <button
                      onClick={() => markAllRead.mutate()}
                      className="text-[10px] font-semibold text-amber-700 hover:underline inline-flex items-center gap-0.5"
                    >
                      <CheckCheck className="w-3 h-3" /> Mark all read
                    </button>
                  </div>
                  <div className="border-b border-slate-100">
                    {unreadNotifs.slice(0, 5).map(n => (
                      <button
                        key={n.id}
                        onClick={() => {
                          markRead.mutate(n.id);
                          setBellOpen(false);
                          if (n.link) navigate(n.link);
                        }}
                        className="w-full text-left px-4 py-2.5 border-b border-slate-100 last:border-b-0 hover:bg-amber-50/40"
                      >
                        <div className="flex items-start gap-2">
                          <AlertTriangle className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${n.severity === 'error' ? 'text-rose-500' : n.severity === 'warning' ? 'text-amber-500' : 'text-blue-500'}`} />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-slate-900">{n.title}</p>
                            {n.body && <p className="text-[11px] text-slate-600 mt-0.5 line-clamp-2">{n.body}</p>}
                            <p className="text-[10px] text-slate-400 mt-0.5">{formatRelative(n.createdAt)}</p>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </>
              )}
              <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-900">Unread inbox</p>
                {unreadThreads.length > 0 && (
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-rose-600">
                    {unreadThreads.length} new
                  </span>
                )}
              </div>
              <div className="overflow-y-auto flex-1">
                {unreadThreads.length === 0 ? (
                  <div className="px-4 py-8 text-center">
                    <Inbox className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs text-slate-500">You're all caught up.</p>
                  </div>
                ) : (
                  unreadThreads.map(t => (
                    <button
                      key={t.id}
                      onClick={() => { setBellOpen(false); navigate(`/engage?thread=${t.id}`); }}
                      className="w-full text-left px-4 py-2.5 border-b border-slate-100 last:border-b-0 hover:bg-slate-50"
                    >
                      <div className="flex items-center justify-between mb-0.5">
                        <p className="text-xs font-semibold text-slate-900 truncate">
                          {t.participantName || t.participantHandle || `@${t.participantId}`}
                        </p>
                        <span className="text-[10px] text-slate-400 ml-2 flex-shrink-0">
                          {formatRelative(t.lastMessageAt)}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 line-clamp-2">{t.lastMessagePreview || '(no preview)'}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 capitalize">{t.sourceType} · {t.accountName}</p>
                    </button>
                  ))
                )}
              </div>
              <button
                onClick={() => { setBellOpen(false); navigate('/engage'); }}
                className="px-4 py-2 text-[11px] font-semibold text-blue-600 hover:bg-slate-50 border-t border-slate-100"
              >
                Open Engage inbox →
              </button>
            </div>
          )}
        </div>

        {/* User menu */}
        <div className="relative" ref={dropdownRef}>
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 p-1 rounded-lg hover:bg-slate-100"
          >
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
              <span className="text-xs font-bold text-white">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </span>
            </div>
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </button>

          {dropdownOpen && (
            <div className="absolute right-0 mt-2 w-56 bg-white rounded-xl shadow-lg border border-slate-200 py-1 z-50">
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-900">{user?.firstName} {user?.lastName}</p>
                <p className="text-xs text-slate-500">{user?.email}</p>
                <span className="inline-block mt-1.5 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide rounded bg-blue-50 text-blue-700 capitalize">
                  {user?.role}
                </span>
              </div>
              <button
                onClick={() => { setDropdownOpen(false); logout(); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-rose-600 hover:bg-rose-50"
              >
                <LogOut className="w-4 h-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
