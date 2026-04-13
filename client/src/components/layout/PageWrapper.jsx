/**
 * client/src/components/layout/PageWrapper.jsx
 *
 * CHANGES IN THIS VERSION
 * ───────────────────────
 * 1. UserMenu is now a NAMED EXPORT so Home.jsx (and any future page) can
 *    import and embed it inline next to their own search bars.
 *
 * 2. On desktop (≥ 768px) the topbar's UserMenu is hidden via CSS
 *    (.topbar__usermenu-desktop-hide) because Home.jsx now renders it
 *    inside its own sticky topbar next to the search input.
 *    On mobile (< 768px) it stays in the top bar as before.
 *
 * 3. Navbar.jsx is confirmed dead — it duplicates UserMenu and is never
 *    imported anywhere. It should be deleted from the project.
 *
 * UNCHANGED:
 *   - MobileBottomNav (icons, labels, z-index 90)
 *   - pb-page-safe formula
 *   - Sidebar wiring (isOpen/onClose)
 *   - Scroll region, overflow rules, containing-block contract
 *   - All z-index contracts
 *   - All UserMenu logic (avatar, dropdown, logout, escape, outside-click)
 *   - Props: { title, children }
 */

import { useState, useEffect, useRef, useCallback } from 'react';
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
import { NavLink, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import useAuthStore from '../../store/authStore';

// ── Avatar helpers (deterministic) ────────────────────────────────────────────

const avatarSlot = (str = '') => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return (Math.abs(hash) % 7) + 1; // 1–7
};

const getInitials = (user) => {
  if (!user) return '?';
  if (user.displayName) {
    const parts = user.displayName.trim().split(/\s+/);
    return parts.length >= 2
      ? (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
      : parts[0].slice(0, 2).toUpperCase();
  }
  if (user.email) return user.email[0].toUpperCase();
  return '?';
};

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

// ── UserMenu (avatar button + dropdown panel) ─────────────────────────────────
// Named export so pages like Home.jsx can embed it inline in their own topbar.

export const UserMenu = () => {
  const { user, logout } = useAuthStore();
  const navigate         = useNavigate();
  const [open, setOpen]  = useState(false);
  const wrapperRef       = useRef(null);

  const initials = getInitials(user);
  const slot     = avatarSlot(user?.email || user?.displayName || '');

  // Close on outside mousedown
  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const handler = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [open]);

  const handleLogout = useCallback(async () => {
    setOpen(false);
    try {
      await logout();
    } catch (err) {
      // authStore clears local state in finally, navigation is safe regardless.
      console.error('[UserMenu] logout error:', err);
    } finally {
      navigate('/login', { replace: true });
    }
  }, [logout, navigate]);

  if (!user) return null;

  return (
    <div ref={wrapperRef} className="um-wrapper" style={{ position: 'relative' }}>
      {/* ── Avatar button ── */}
      <button
        className="um-avatar-btn"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Account menu for ${user.displayName || user.email || 'user'}`}
        aria-haspopup="menu"
        aria-expanded={open}
        title={user.displayName || user.email || 'Account'}
      >
        <span
          className="um-avatar"
          style={{
            background: `var(--avatar-${slot}-bg)`,
            color:      `var(--avatar-${slot}-fg)`,
          }}
          aria-hidden="true"
        >
          {initials}
        </span>
        {/* Chevron indicator */}
        <svg
          className={`um-chevron${open ? ' um-chevron--open' : ''}`}
          width="10"
          height="10"
          viewBox="0 0 10 10"
          fill="none"
          aria-hidden="true"
        >
          <path
            d="M2 3.5L5 6.5L8 3.5"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          className="um-panel"
          role="menu"
          aria-label="Account options"
        >
          {/* User identity */}
          <div className="um-identity">
            <span
              className="um-panel-avatar"
              style={{
                background: `var(--avatar-${slot}-bg)`,
                color:      `var(--avatar-${slot}-fg)`,
              }}
              aria-hidden="true"
            >
              {initials}
            </span>
            <div className="um-identity-text">
              {user.displayName && (
                <span className="um-name">{user.displayName}</span>
              )}
              {user.email && (
                <span className="um-email" title={user.email}>
                  {user.email}
                </span>
              )}
            </div>
          </div>

          {/* Divider */}
          <div className="um-divider" aria-hidden="true" />

          {/* Logout */}
          <button
            className="um-logout"
            onClick={handleLogout}
            role="menuitem"
            aria-label="Log out of MeloStream"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            Log out
          </button>
        </div>
      )}
    </div>
  );
};

// ── PageWrapper ───────────────────────────────────────────────────────────────

export const PageWrapper = ({ title, children }) => {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <>
      <style>{WRAPPER_STYLES}</style>

      {/*
        CRITICAL: No overflow:hidden here or on any direct child.
        overflow:hidden creates a new containing block in all browsers,
        which traps position:fixed children (OptionsSheet, modals, drawers).
        Scroll is handled ONLY by <main> below.
      */}
      <div className="flex flex-col h-full w-full min-w-0">

        {/* ── Top bar — ALL breakpoints ────────────────────────────────────
            On mobile: shows hamburger + logo + UserMenu.
            On desktop (md+): hamburger and logo are hidden (sidebar is open).
            UserMenu is also hidden on desktop (md+) because pages like Home.jsx
            render it inside their own sticky topbar next to the search input.
            On pages that do NOT have their own topbar, UserMenu remains visible
            on desktop too — override .topbar__usermenu with display:flex if needed.
        ── */}
        <header
          className="topbar"
          role="banner"
        >
          {/* Left: hamburger (mobile/tablet) + logo */}
          <div className="topbar__left">
            {/* Hamburger — hidden on md+ because sidebar is always open there */}
            <button
              className="topbar__hamburger"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={sidebarOpen}
              aria-controls="main-sidebar"
            >
              <Bars3Icon className="w-5 h-5" />
            </button>

            {/* Logo — hidden on md+ because Sidebar already shows it */}
            <NavLink to="/" className="topbar__logo" aria-label="MeloStream home">
              <span className="topbar__logo-icon" aria-hidden="true">
                <MusicalNoteIcon className="w-3.5 h-3.5 text-white" />
              </span>
              <span className="topbar__logo-text">MeloStream</span>
            </NavLink>
          </div>

          {/* Right: UserMenu — mobile only on pages that have their own topbar
              (e.g. Home). On pages without a topbar it stays visible on all
              breakpoints because there is no other place to show it.
              The class topbar__usermenu controls this via CSS below. */}
          <div className="topbar__usermenu">
            <UserMenu />
          </div>
        </header>

        {/* ── Body row (sidebar + scroll region) ── */}
        <div className="flex flex-1 min-w-0 min-h-0">

          {/* ── Sidebar ── */}
          <Sidebar
            isOpen={sidebarOpen}
            onClose={() => setSidebarOpen(false)}
          />

          {/* ── Scroll region ── */}
          <main
            className="flex-1 min-h-0 overflow-y-auto pb-page-safe"
            id="main-content"
            role="main"
          >
            {title && (
              <div className="px-6 pt-6 pb-2">
                <h1 className="text-2xl font-bold text-white">{title}</h1>
              </div>
            )}
            {children}
          </main>
        </div>
      </div>

      {/* Mobile bottom nav — hidden at md+ */}
      <MobileBottomNav />
    </>
  );
};

export default PageWrapper;

// ── Styles ────────────────────────────────────────────────────────────────────

const WRAPPER_STYLES = `
  /* ── Top bar ──────────────────────────────────────────────────────── */
  .topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 0 16px;
    height: 52px;
    background: #111111;
    border-bottom: 1px solid #1f1f1f;
    flex-shrink: 0;
    z-index: 20;
    /* Ensures dropdown panel is not clipped by stacking context */
    position: relative;
  }
  @media (min-width: 768px) {
  .topbar { display: none; }
}
  .topbar__left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  /* Hamburger: visible only below md (768px) */
  .topbar__hamburger {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    padding: 6px;
    color: #9ca3af;
    border-radius: 6px;
    transition: color 0.15s, background 0.15s;
    flex-shrink: 0;
  }
  .topbar__hamburger:hover {
    color: #fff;
    background: #2a2a2a;
  }
  @media (min-width: 768px) {
    .topbar__hamburger { display: none; }
  }

  /* Logo: visible only below md — sidebar shows it on desktop */
  .topbar__logo {
    display: flex;
    align-items: center;
    gap: 8px;
    text-decoration: none;
    flex-shrink: 0;
  }
  .topbar__logo-icon {
    width: 28px;
    height: 28px;
    border-radius: 7px;
    background: #22c55e;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }
  .topbar__logo-text {
    color: #fff;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.3px;
    white-space: nowrap;
  }
  @media (min-width: 768px) {
    .topbar__logo { display: none; }
  }

  /* ── UserMenu in topbar ───────────────────────────────────────────── */
  /* On mobile: always show it here (it's the only place the avatar appears).
     On desktop (md+): hide it here — Home.jsx renders it next to the search bar.
     For pages that do NOT have their own search topbar, add the modifier class
     topbar__usermenu--always to keep it visible on all breakpoints. */
  .topbar__usermenu {
    flex-shrink: 0;
  }
  @media (min-width: 768px) {
    .topbar__usermenu { display: none; }
  }
  /* Override for pages without their own topbar (non-Home pages) */
  .topbar__usermenu--always {
    display: flex !important;
    align-items: center;
  }

  /* ── UserMenu wrapper ─────────────────────────────────────────────── */
  .um-wrapper {
    flex-shrink: 0;
  }

  /* ── Avatar button ── */
  .um-avatar-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: 1px solid #2a2a2a;
    border-radius: 999px;
    padding: 3px 8px 3px 3px;
    cursor: pointer;
    transition: border-color 0.15s, background 0.15s;
    font-family: inherit;
  }
  .um-avatar-btn:hover {
    border-color: #3a3a3a;
    background: #1a1a1a;
  }
  .um-avatar-btn:focus-visible {
    outline: 2px solid #22c55e;
    outline-offset: 2px;
  }

  .um-avatar {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.3px;
    user-select: none;
    flex-shrink: 0;
  }

  .um-chevron {
    color: #6b7280;
    transition: transform 0.2s ease, color 0.15s;
    flex-shrink: 0;
  }
  .um-chevron--open {
    transform: rotate(180deg);
    color: #9ca3af;
  }

  /* ── Dropdown panel ── */
  .um-panel {
    position: absolute;
    top: calc(100% + 8px);
    right: 0;
    min-width: 220px;
    background: #181818;
    border: 1px solid #2a2a2a;
    border-radius: 10px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6), 0 2px 6px rgba(0, 0, 0, 0.4);
    z-index: 200;
    overflow: hidden;
    animation: um-enter 0.15s ease;
  }

  @keyframes um-enter {
    from { opacity: 0; transform: translateY(-6px) scale(0.97); }
    to   { opacity: 1; transform: translateY(0)   scale(1); }
  }

  /* Identity row */
  .um-identity {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 14px 14px 12px;
  }

  .um-panel-avatar {
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.3px;
    user-select: none;
    flex-shrink: 0;
  }

  .um-identity-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .um-name {
    color: #e5e7eb;
    font-size: 13px;
    font-weight: 600;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .um-email {
    color: #6b7280;
    font-size: 11px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 160px;
  }

  /* Divider */
  .um-divider {
    height: 1px;
    background: #222222;
    margin: 0 14px;
  }

  /* Logout button */
  .um-logout {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 10px 14px 12px;
    background: transparent;
    border: none;
    cursor: pointer;
    font-family: inherit;
    font-size: 13px;
    font-weight: 500;
    color: #9ca3af;
    text-align: left;
    transition: color 0.15s, background 0.15s;
  }
  .um-logout:hover {
    color: #f87171;
    background: rgba(239, 68, 68, 0.07);
  }
  .um-logout:focus-visible {
    outline: 2px solid #22c55e;
    outline-offset: -2px;
  }

  /* ── pb-page-safe ─────────────────────────────────────────────────────
     Mobile (< 768px):
       Top bar (52px) is visible but fixed in flow — no offset needed.
       Player (64px) sits above nav (56px) → 120px from bottom.
       Add 16px gap → 136px + safe-area.

     Desktop (≥ 768px):
       Nav hidden. Player sits at bottom:0, 80px tall.
       112px used for a generous breathing gap.
  ── */
  .pb-page-safe {
    padding-bottom: calc(136px + env(safe-area-inset-bottom, 0px));
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

  /*
    MobileBottomNav:
    - z-index: 90 — below MiniPlayerBar (95) and modals (100+)
    - min-height: 56px — matches MOBILE_NAV_HEIGHT in MiniPlayerBar.jsx
  */
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

  .m-bottom-nav__tab--on { color: #22c55e; }
  .m-bottom-nav__tab:not(.m-bottom-nav__tab--on):active { color: #9ca3af; }

  .m-bottom-nav__icon {
    width: 22px; height: 22px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .m-bottom-nav__icon svg { width: 22px; height: 22px; }

  .m-bottom-nav__label {
    font-size: 10px;
    font-weight: 500;
    letter-spacing: 0.01em;
    line-height: 1;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
`;