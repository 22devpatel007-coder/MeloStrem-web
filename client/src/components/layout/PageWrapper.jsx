/**
 * client/src/components/layout/PageWrapper.jsx
 *
 * PRODUCTION FIX — position:fixed restoration
 *
 * ROOT CAUSE (two stacked issues):
 *
 *   1. The inner column div had `overflow-hidden` → any ancestor with
 *      overflow:hidden creates a new containing block that traps ALL
 *      position:fixed descendants (OptionsSheet, AddToPlaylist drawer,
 *      modals, etc.) — they scroll with the page instead of sticking
 *      to the viewport.
 *      FIX: removed overflow-hidden from the inner column div entirely.
 *
 *   2. <main> had `overflow-x-hidden` → in Safari this also creates a
 *      containing block, breaking fixed children rendered inside pages.
 *      FIX: removed overflow-x-hidden from <main>. Horizontal overflow
 *      is now suppressed at the html/body level (add `overflow-x: hidden`
 *      to body in your global CSS — index.css — which does NOT break fixed).
 *
 * SCROLL CONTRACT (unchanged):
 *   - <main> is the only scroll region: overflow-y-auto stays.
 *   - Sidebar, header, bottom nav are NOT in the scroll flow.
 *
 * WHAT DID NOT CHANGE:
 *   - MobileBottomNav — unchanged
 *   - Mobile top bar — unchanged
 *   - .pb-page-safe padding values — unchanged
 *   - Props: { title, children } — unchanged
 *   - Desktop layout — unchanged
 */

import { useState } from 'react';
import {
  Bars3Icon,
  MusicalNoteIcon,
  HomeIcon,
  MagnifyingGlassIcon,
  HeartIcon,
  QueueListIcon,
} from '@heroicons/react/24/outline';
import {
  HomeIcon            as HomeIconSolid,
  MagnifyingGlassIcon as SearchIconSolid,
  HeartIcon           as HeartIconSolid,
  QueueListIcon       as PlaylistIconSolid,
} from '@heroicons/react/24/solid';
import { NavLink } from 'react-router-dom';
import Sidebar from './Sidebar';

// ── Bottom nav config ─────────────────────────────────────────────────────────
const BOTTOM_NAV_ITEMS = [
  { to: '/',          label: 'Library',   Icon: HomeIcon,            ActiveIcon: HomeIconSolid },
  { to: '/search',    label: 'Search',    Icon: MagnifyingGlassIcon, ActiveIcon: SearchIconSolid },
  { to: '/liked',     label: 'Liked',     Icon: HeartIcon,           ActiveIcon: HeartIconSolid },
  { to: '/playlists', label: 'Playlists', Icon: QueueListIcon,       ActiveIcon: PlaylistIconSolid },
];

// ── MobileBottomNav ───────────────────────────────────────────────────────────
const MobileBottomNav = () => (
  <>
    <style>{NAV_STYLES}</style>
    <nav className="m-bottom-nav" aria-label="Primary navigation">
      {BOTTOM_NAV_ITEMS.map(({ to, label, Icon, ActiveIcon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          className={({ isActive }) =>
            ['m-bottom-nav__tab', isActive ? 'm-bottom-nav__tab--on' : ''].join(' ')
          }
          aria-label={label}
        >
          {({ isActive }) => (
            <>
              <span className="m-bottom-nav__icon" aria-hidden="true">
                {isActive ? <ActiveIcon /> : <Icon />}
              </span>
              <span className="m-bottom-nav__label">{label}</span>
            </>
          )}
        </NavLink>
      ))}
    </nav>
  </>
);

// ── PageWrapper ───────────────────────────────────────────────────────────────
export const PageWrapper = ({ title, children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <style>{WRAPPER_STYLES}</style>

      {/*
        FIXED: overflow-visible on both wrapper divs.
        Neither div should have overflow:hidden — that breaks position:fixed
        for ALL descendants. Scroll is handled only by <main> below.
      */}
      <div className="flex h-full w-full min-w-0">

        {/* ── Sidebar ── */}
        <Sidebar
          isOpen={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
        />

        {/* ── Main content column ── */}
        {/*
          FIXED: was `overflow-hidden` — removed entirely.
          This div just needs to flex-fill; it must NOT clip its children.
        */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0">

          {/* ── Mobile top bar ── */}
          <header className="md:hidden flex items-center gap-3 px-4 py-3 bg-[#111111] border-b border-[#2a2a2a] shrink-0 z-20">
            <button
              className="p-1.5 text-gray-400 hover:text-white transition-colors rounded-md hover:bg-[#2a2a2a]"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
            >
              <Bars3Icon className="w-5 h-5" />
            </button>

            <NavLink to="/" className="flex items-center gap-2">
              <span className="w-7 h-7 rounded-md bg-emerald-500 flex items-center justify-center">
                <MusicalNoteIcon className="w-3.5 h-3.5 text-white" />
              </span>
              <span className="text-white font-bold text-base tracking-tight">
                MeloStream
              </span>
            </NavLink>
          </header>

          {/*
            Scroll region.
            FIXED: removed overflow-x-hidden — in Safari this creates a
            containing block that traps position:fixed children.
            Horizontal scroll suppression belongs on body in index.css:
              body { overflow-x: hidden; }
            That is safe and does NOT break position:fixed.

            .pb-page-safe responsive values (unchanged):
              mobile  → 136px  (player 64 + nav 56 + gap 16)
              desktop → 112px  (player only)
          */}
          <main className="flex-1 min-h-0 overflow-y-auto pb-page-safe">
            {title && (
              <div className="px-6 pt-6 pb-2">
                <h1 className="text-2xl font-bold text-white">{title}</h1>
              </div>
            )}
            {children}
          </main>
        </div>
      </div>

      {/* Mobile bottom nav — hidden at md+ via CSS */}
      <MobileBottomNav />
    </>
  );
};

export default PageWrapper;

// ── Styles ────────────────────────────────────────────────────────────────────

const WRAPPER_STYLES = `
  .pb-page-safe {
    padding-bottom: 136px;
  }
  @media (min-width: 768px) {
    .pb-page-safe {
      padding-bottom: 112px;
    }
  }
`;

const NAV_STYLES = `
  @media (min-width: 768px) {
    .m-bottom-nav { display: none !important; }
  }

  .m-bottom-nav {
    position: fixed;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 90;
    display: flex;
    align-items: stretch;
    background: #111111;
    border-top: 1px solid #1f1f1f;
    padding-bottom: env(safe-area-inset-bottom, 0px);
  }

  .m-bottom-nav__tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    padding: 8px 4px;
    min-height: 56px;
    color: #6b7280;
    text-decoration: none;
    transition: color 0.15s ease;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }

  .m-bottom-nav__tab--on {
    color: #22c55e;
  }

  .m-bottom-nav__tab:not(.m-bottom-nav__tab--on):active {
    color: #9ca3af;
  }

  .m-bottom-nav__icon {
    width: 22px;
    height: 22px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .m-bottom-nav__icon svg {
    width: 22px;
    height: 22px;
  }

  .m-bottom-nav__label {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.01em;
    line-height: 1;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
`;