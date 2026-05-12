import { NavLink } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import {
  LayoutDashboard,
  CalendarDays,
  PenSquare,
  Image,
  BarChart3,
  Users,
  Share2,
  Settings,
  FileText,
  FolderClosed,
} from 'lucide-react';
import clsx from 'clsx';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/posts', icon: FileText, label: 'Posts' },
  { to: '/calendar', icon: CalendarDays, label: 'Calendar' },
  { to: '/posts/new', icon: PenSquare, label: 'New Post', highlight: true },
  { to: '/media', icon: Image, label: 'Library' },
  { to: '/analytics', icon: BarChart3, label: 'Analytics' },
];

const secondaryItems = [
  { to: '/team', icon: Users, label: 'Team' },
  { to: '/clients', icon: FolderClosed, label: 'Clients' },
  { to: '/accounts', icon: Share2, label: 'Accounts' },
];

const adminItems = [
  { to: '/settings', icon: Settings, label: 'Settings', roles: ['admin'] },
];

export default function Sidebar({ open, onClose }) {
  const { hasRole, user } = useAuth();

  const linkClass = ({ isActive }) =>
    clsx(
      'group flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all',
      isActive
        ? 'bg-white/10 text-white'
        : 'text-slate-400 hover:bg-white/5 hover:text-white'
    );

  return (
    <>
      {/* Mobile overlay */}
      {open && (
        <div className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm" onClick={onClose} />
      )}

      <aside
        className={clsx(
          'fixed top-0 left-0 z-50 h-full w-64 bg-slate-900 flex flex-col transition-transform duration-200 lg:translate-x-0 lg:static lg:z-auto',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="flex items-center gap-2.5 px-5 py-5 border-b border-white/5">
          <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-600/30">
            <span className="text-white text-sm font-bold">S</span>
          </div>
          <div>
            <div className="text-white text-[15px] font-bold tracking-tight">Scheduly</div>
            <div className="text-slate-500 text-[10px] font-medium uppercase tracking-wider">by DMM</div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 overflow-y-auto">
          <div className="mb-1 px-3">
            <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider">Workspace</p>
          </div>
          <div className="space-y-0.5 mb-6">
            {navItems.map(({ to, icon: Icon, label, highlight }) => (
              <NavLink key={to} to={to} end={to === '/'} onClick={onClose} className={linkClass}>
                {({ isActive }) => (
                  <>
                    <Icon className={clsx('w-4 h-4', highlight && !isActive && 'text-blue-400')} />
                    <span>{label}</span>
                    {highlight && (
                      <span className="ml-auto text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-500/20 text-blue-400 uppercase tracking-wide">New</span>
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </div>

          <div className="mb-1 px-3">
            <p className="text-slate-500 text-[10px] font-semibold uppercase tracking-wider">Manage</p>
          </div>
          <div className="space-y-0.5">
            {secondaryItems.map(({ to, icon: Icon, label }) => (
              <NavLink key={to} to={to} onClick={onClose} className={linkClass}>
                <Icon className="w-4 h-4" />
                <span>{label}</span>
              </NavLink>
            ))}

            {adminItems.map(({ to, icon: Icon, label, roles }) =>
              hasRole(...roles) ? (
                <NavLink key={to} to={to} onClick={onClose} className={linkClass}>
                  <Icon className="w-4 h-4" />
                  <span>{label}</span>
                </NavLink>
              ) : null
            )}
          </div>
        </nav>

        {/* User Card */}
        <div className="px-3 pb-4">
          <div className="flex items-center gap-3 p-3 rounded-lg bg-white/5">
            <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center flex-shrink-0">
              <span className="text-white text-xs font-bold">
                {user?.firstName?.[0]}{user?.lastName?.[0]}
              </span>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white text-sm font-medium truncate">{user?.firstName} {user?.lastName}</p>
              <p className="text-slate-400 text-xs capitalize">{user?.role}</p>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
