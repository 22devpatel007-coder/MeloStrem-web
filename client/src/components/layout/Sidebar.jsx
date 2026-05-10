/**
 * client/src/components/layout/Sidebar.jsx
 *
 * PRODUCTION FIX — Added loading + error states for playlist section.
 *
 * CHANGES FROM PREVIOUS VERSION:
 *   - Destructure `loading` and `isError` from useUserPlaylists()
 *   - Replace bare "No playlists yet." with 3-state render:
 *       loading  → skeleton shimmer (3 placeholder rows)
 *       isError  → red error message
 *       empty    → "No playlists yet."
 *   - All other logic, classes, layout — completely unchanged.
 */

import { NavLink } from 'react-router-dom';
import {
  HomeIcon,
  MagnifyingGlassIcon,
  HeartIcon,
  QueueListIcon,
  Cog6ToothIcon,
  MusicalNoteIcon,
  XMarkIcon,
  LinkIcon,
} from '@heroicons/react/24/outline';
import useAuthStore from '../../store/authStore';
import { useUserPlaylists } from '../../hooks/usePlaylists';

// ─── Nav item config ──────────────────────────────────────────────────────────

const NAV_ITEMS = [
  { to: '/',             label: 'Library',     Icon: HomeIcon },
  { to: '/search',       label: 'Search',      Icon: MagnifyingGlassIcon },
  { to: '/liked',        label: 'Liked Songs', Icon: HeartIcon },
  { to: '/playlists',    label: 'Playlists',   Icon: QueueListIcon },
  { to: '/suggestions',  label: 'Share a Playlist', Icon: LinkIcon, badge: 'New' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const navLinkClass = ({ isActive }) =>
  [
    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
    isActive
      ? 'bg-[#2a2a2a] text-white'
      : 'text-gray-400 hover:text-white hover:bg-[#222222]',
  ].join(' ');

// ─── PlaylistSkeleton — shown while fetch is in-flight ───────────────────────

const PlaylistSkeleton = () => (
  <ul className="flex flex-col gap-0.5 px-3 mt-2" aria-hidden="true">
    {[1, 2, 3].map((n) => (
      <li key={n} className="flex items-center gap-3 px-0 py-2">
        <span className="w-[14px] h-[14px] rounded-sm shrink-0 bg-[#2a2a2a] animate-pulse" />
        <span
          className="h-3 rounded bg-[#2a2a2a] animate-pulse"
          style={{ width: `${50 + n * 15}%` }}
        />
      </li>
    ))}
  </ul>
);

// ─── Component ────────────────────────────────────────────────────────────────

const Sidebar = ({ isOpen = false, onClose }) => {
  const { isAdmin } = useAuthStore();

  // useUserPlaylists fetches GET /api/users/:uid/playlists.
  // staleTime: 30s — no refetch storm on window focus.
  // loading/isError drive the 3-state playlist section below.
  const { playlists = [], loading, isError } = useUserPlaylists();

  const safePlaylist = Array.isArray(playlists) ? playlists : [];

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
      {/*
        h-screen (100vh fallback) + style height:100dvh for modern mobile browsers.
        dvh = dynamic viewport height — accounts for mobile address bar so the
        playlist section never gets clipped by browser chrome.
        md:h-full restores normal desktop behaviour.
      */}
      <aside
        className={[
          'fixed top-0 left-0 h-screen z-40 flex flex-col',
          'w-[260px] bg-[#111111] border-r border-[#2a2a2a]',
          'transition-transform duration-300 ease-in-out',
          isOpen ? 'translate-x-0' : '-translate-x-full',
          'md:relative md:h-full md:translate-x-0 md:flex md:shrink-0',
        ].join(' ')}
        style={{ height: '100dvh' }}
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
            {NAV_ITEMS.map(({ to, label, Icon, badge }) => (
              <li key={to}>
                <NavLink
                  to={to}
                  end={to === '/'}
                  className={({ isActive }) =>
                    [
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150',
                      to === '/suggestions'
                        ? isActive
                          ? 'bg-purple-900/40 text-purple-300'
                          : 'text-purple-400 hover:text-purple-300 hover:bg-purple-900/20'
                        : isActive
                          ? 'bg-[#2a2a2a] text-white'
                          : 'text-gray-400 hover:text-white hover:bg-[#222222]',
                    ].join(' ')
                  }
                  onClick={onClose}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" aria-hidden="true" />
                  <span className="flex-1">{label}</span>
                  {badge && (
                    <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-300 leading-none">
                      {badge}
                    </span>
                  )}
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
        {/*
          flex-1 + overflow-y-auto + min-h-0:
          This section absorbs all available space and scrolls internally.
          No content below this will ever be pushed off-screen.
        */}
        <div className="flex-1 overflow-y-auto px-3 py-4 min-h-0">
          <p className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-widest text-gray-500 select-none">
            Playlists
          </p>

          {/* ── 3-state render: loading / error / list ── */}
          {loading ? (
            // Skeleton rows while fetch is in-flight — prevents layout shift
            <PlaylistSkeleton />
          ) : isError ? (
            // Network / server error — friendly message, never expose raw error
            <p className="px-3 text-xs text-red-400 mt-2">
              Couldn't load playlists.
            </p>
          ) : safePlaylist.length === 0 ? (
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

        {/*
          ── NO user/email/logout block here ──
          User identity and logout live exclusively in PageWrapper > UserMenu
          (the top bar avatar dropdown, visible on all breakpoints).
        */}
      </aside>
    </>
  );
};

export default Sidebar;