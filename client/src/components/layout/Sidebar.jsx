/**
 * client/src/components/layout/Sidebar.jsx
 *
 * PERMANENT FIX: Navbar removed from all pages.
 * Sidebar now owns ALL navigation + user identity + logout.
 *
 * - User email shown at bottom
 * - Logout button pinned to bottom
 * - Navbar.jsx is no longer used anywhere and can be deleted
 */

import { useNavigate, NavLink } from 'react-router-dom';
import {
  HomeIcon,
  MagnifyingGlassIcon,
  HeartIcon,
  QueueListIcon,
  Cog6ToothIcon,
  MusicalNoteIcon,
  XMarkIcon,
  ArrowRightOnRectangleIcon,
} from '@heroicons/react/24/outline';
import useAuthStore from '../../store/authStore';
import { usePlaylists } from '../../hooks/usePlaylists';

// ─── Nav item config ──────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { to: '/',          label: 'Library',     Icon: HomeIcon },
  { to: '/search',    label: 'Search',      Icon: MagnifyingGlassIcon },
  { to: '/liked',     label: 'Liked Songs', Icon: HeartIcon },
  { to: '/playlists', label: 'Playlists',   Icon: QueueListIcon },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const navLinkClass = ({ isActive }) =>
  [
    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
    isActive
      ? 'bg-[#2a2a2a] text-white'
      : 'text-gray-400 hover:text-white hover:bg-[#222222]',
  ].join(' ');

// ─── Component ────────────────────────────────────────────────────────────────

const Sidebar = ({ isOpen = false, onClose }) => {
  const { user, isAdmin, logout } = useAuthStore();
  const navigate = useNavigate();
  const { playlists = [] } = usePlaylists(user?.uid) ?? {};

  const safePlaylist = Array.isArray(playlists) ? playlists : [];

  const handleLogout = async () => {
    onClose?.();
    await logout();
    navigate('/login');
  };

  return (
    <>
      {/* ── Mobile backdrop ── */}
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-30 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* ── Sidebar panel ── */}
      <aside
        className={[
          'fixed top-0 left-0 h-full z-40 flex flex-col',
          'w-[260px] bg-[#111111] border-r border-[#2a2a2a]',
          'transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'md:relative md:translate-x-0 md:flex md:shrink-0',
        ].join(' ')}
        aria-label="Main navigation"
      >
        {/* ── Logo ── */}
        <div className="flex items-center justify-between px-5 py-5 shrink-0">
          <NavLink
            to="/"
            className="flex items-center gap-2.5 group"
            onClick={onClose}
          >
            <span className="w-8 h-8 rounded-lg bg-emerald-500 flex items-center justify-center shrink-0">
              <MusicalNoteIcon className="w-4 h-4 text-white" />
            </span>
            <span className="text-white font-bold text-lg tracking-tight">
              MeloStream
            </span>
          </NavLink>

          {/* Mobile close button */}
          <button
            className="md:hidden p-1 text-gray-400 hover:text-white transition-colors"
            onClick={onClose}
            aria-label="Close menu"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
        </div>

        {/* ── Primary navigation ── */}
        <nav className="px-3 mb-6 shrink-0" aria-label="Primary">
          <ul className="flex flex-col gap-1">
            {NAV_ITEMS.map(({ to, label, Icon }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === '/'}
                  className={navLinkClass}
                  onClick={onClose}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
                  {label}
                </NavLink>
              </li>
            ))}

            {isAdmin && (
              <li>
                <NavLink
                  to="/admin"
                  className={navLinkClass}
                  onClick={onClose}
                >
                  <Cog6ToothIcon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
                  Admin
                </NavLink>
              </li>
            )}
          </ul>
        </nav>

        {/* ── Divider ── */}
        <div className="mx-5 border-t border-[#2a2a2a] shrink-0" />

        {/* ── Playlists section (scrollable) ── */}
        <div className="flex-1 overflow-y-auto px-3 py-4 min-h-0">
          <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-widest text-gray-500 select-none">
            Playlists
          </p>

          {safePlaylist.length === 0 ? (
            <p className="px-3 text-xs text-gray-600 mt-2">No playlists yet.</p>
          ) : (
            <ul className="flex flex-col gap-0.5">
              {safePlaylist.map((playlist) => (
                <li key={playlist.id}>
                  <NavLink
                    to={`/playlists/${playlist.id}`}
                    className={({ isActive }) =>
                      [
                        'flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors duration-150',
                        isActive
                          ? 'bg-[#2a2a2a] text-white'
                          : 'text-gray-400 hover:text-white hover:bg-[#1e1e1e]',
                      ].join(' ')
                    }
                    onClick={onClose}
                  >
                    <span
                      className="w-[14px] h-[14px] rounded-sm shrink-0"
                      style={{ backgroundColor: playlist.color ?? '#555555' }}
                      aria-hidden="true"
                    />
                    <span className="truncate">{playlist.name ?? 'Untitled'}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* ── Divider ── */}
        <div className="mx-5 border-t border-[#2a2a2a] shrink-0" />

        {/* ── User + Logout (pinned to bottom) ── */}
        <div className="px-3 py-4 shrink-0">
          {user?.email && (
            <div className="px-3 mb-2 flex items-center gap-2 min-w-0">
              {/* Avatar initial */}
              <span className="w-7 h-7 rounded-full bg-[#2a2a2a] flex items-center justify-center text-xs font-bold text-gray-300 shrink-0">
                {user.email[0].toUpperCase()}
              </span>
              <span className="text-xs text-gray-500 truncate min-w-0">
                {user.email}
              </span>
            </div>
          )}

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-gray-400 hover:text-red-400 hover:bg-[#1e1e1e] transition-colors duration-150"
            aria-label="Log out"
          >
            <ArrowRightOnRectangleIcon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;