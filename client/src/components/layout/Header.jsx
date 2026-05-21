import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { Menu, LogOut, ChevronDown, Search, Bell, Plus } from 'lucide-react';
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
  '/accounts': 'Social Accounts',
  '/settings': 'Settings',
};

export default function Header({ onMenuToggle }) {
  const { user, logout } = useAuth();
  const location = useLocation();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
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
        <button className="p-2 rounded-lg text-slate-500 hover:bg-slate-100 relative">
          <Bell className="w-5 h-5" />
        </button>

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
