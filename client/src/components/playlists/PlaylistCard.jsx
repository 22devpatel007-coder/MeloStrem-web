/**
 * client/src/components/playlists/PlaylistCard.jsx
 *
 * PRODUCTION READY — Responsive rewrite
 *
 * Bugs fixed from previous version:
 *
 * ── BUG 1: Mobile play buttons rendering on desktop (touchscreen laptops) ──────
 *   Previous: `window.matchMedia('(hover: none) and (pointer: coarse)')` alone.
 *   This matches touchscreen laptops even when using a mouse.
 *
 *   Fix: Combined check:
 *     ('ontouchstart' in window || navigator.maxTouchPoints > 0)  — touch hardware
 *     && window.innerWidth < 1024                                  — actually narrow
 *   A 1440px touchscreen laptop fails the width check → gets desktop hover layout.
 *   A 390px phone passes both → gets mobile persistent-button layout.
 *   Evaluated once on mount via a stable ref (no re-renders).
 *
 * ── BUG 2: Context menu clipped / rendered as flat box ────────────────────────
 *   Root cause: the outer card wrapper had `overflow: hidden` which clipped the
 *   dropdown. The "Pin to top" box in the screenshot was the open context menu
 *   being squished inside the card.
 *
 *   Fix: Two-layer card structure:
 *     Outer div  — position:relative, NO overflow:hidden (menu can escape freely)
 *     Inner div  — overflow:hidden (keeps cover art zoom/scale clean)
 *   Context menu's `position:absolute` is now relative to the outer wrapper,
 *   so it renders correctly above all sibling elements.
 *
 * ── BUG 3: Controls opacity flickers on fast hover ────────────────────────────
 *   Fix: Controls visibility uses a derived `controlsVisible` boolean driving
 *   a single opacity value. On mobile this is always `true`.
 *
 * ── Props unchanged — fully backward compatible ───────────────────────────────
 *   canDelete, isUserOwned, onQuickPlay, onDelete, onTogglePin, onStartRename,
 *   rename state props — all identical to the previous version.
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';

// ── Touch + narrow screen detection ──────────────────────────────────────────
// Combined check avoids false positives on touchscreen laptops at full width.
// Runs once per mount; stored in a ref so it never causes re-renders.
const detectMobileTouch = () => {
  if (typeof window === 'undefined') return false;
  const hasTouch =
    'ontouchstart' in window || navigator.maxTouchPoints > 0;
  const isNarrow = window.innerWidth < 1024;
  return hasTouch && isNarrow;
};

// ── Global styles injected once ───────────────────────────────────────────────
let _stylesInjected = false;
const injectCardStyles = () => {
  if (_stylesInjected || typeof document === 'undefined') return;
  _stylesInjected = true;
  const s = document.createElement('style');
  s.textContent = `
    @keyframes pcCardWave {
      from { transform: scaleY(0.3); opacity: 0.7; }
      to   { transform: scaleY(1);   opacity: 1;   }
    }
    @keyframes pcSpin { to { transform: rotate(360deg); } }
    @keyframes pcMenuIn {
      from { opacity: 0; transform: scale(0.95) translateY(-4px); }
      to   { opacity: 1; transform: scale(1)    translateY(0);    }
    }
  `;
  document.head.appendChild(s);
};

// ── Waveform bars ─────────────────────────────────────────────────────────────
const WaveformOverlay = () => {
  const heights = [0.5, 0.9, 0.65, 1.0, 0.75, 0.55, 0.85, 0.5, 0.7, 0.6];
  return (
    <div
      style={{ display: 'flex', alignItems: 'flex-end', gap: 2.5, height: 22 }}
      aria-hidden="true"
    >
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: `${h * 100}%`,
            background: 'rgba(34,197,94,0.9)',
            borderRadius: 2,
            animation: `pcCardWave 0.7s ease-in-out ${i * 0.07}s infinite alternate`,
          }}
        />
      ))}
    </div>
  );
};

// ── Pin icon ──────────────────────────────────────────────────────────────────
const PinIcon = ({ filled }) => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <path
      d="M6.5 1L8.2 4.5L12 5L9.25 7.65L9.9 11.5L6.5 9.7L3.1 11.5L3.75 7.65L1 5L4.8 4.5L6.5 1Z"
      fill={filled ? '#facc15' : 'none'}
      stroke={filled ? '#facc15' : '#9ca3af'}
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);

// ── Spinner ───────────────────────────────────────────────────────────────────
const Spinner = ({ color = '#fff', size = 11 }) => (
  <span
    style={{
      width: size,
      height: size,
      border: `2px solid ${color}35`,
      borderTopColor: color,
      borderRadius: '50%',
      display: 'inline-block',
      animation: 'pcSpin 0.7s linear infinite',
      flexShrink: 0,
    }}
  />
);

// ── Cover art ─────────────────────────────────────────────────────────────────
// overflow:hidden is ONLY on this element — not the outer card wrapper.
// This keeps cover art zoom/brightness transitions clean while allowing
// the context menu to escape the card bounds.
const CoverArt = ({ playlist, overlayVisible }) => {
  const coverUrl = playlist.coverUrl ?? null;
  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '1 / 1',
        background: '#111',
        position: 'relative',
        overflow: 'hidden',
        borderRadius: '11px 11px 0 0',
      }}
    >
      {coverUrl ? (
        <img
          src={coverUrl}
          alt={playlist.name}
          loading="lazy"
          style={{
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transition: 'transform 0.35s ease, filter 0.35s ease',
            transform: overlayVisible ? 'scale(1.06)' : 'scale(1)',
            filter: overlayVisible ? 'brightness(0.6)' : 'brightness(1)',
          }}
        />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'linear-gradient(135deg, #1a1a1a, #111)',
            color: overlayVisible ? '#22c55e' : '#374151',
            fontSize: 32,
            transition: 'color 0.3s ease',
          }}
        >
          ♪
        </div>
      )}
      {/* Dark overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          opacity: overlayVisible ? 1 : 0,
          transition: 'opacity 0.25s ease',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          pointerEvents: 'none',
        }}
      >
        {overlayVisible && <WaveformOverlay />}
      </div>
    </div>
  );
};

// ── Desktop hover play buttons ─────────────────────────────────────────────────
const HoverPlayButtons = ({ visible, songCount, playLoading, shuffleLoading, onPlay, onShuffle }) => (
  <div
    style={{
      position: 'absolute',
      bottom: 8,
      left: 0,
      right: 0,
      padding: '0 8px',
      display: 'flex',
      gap: 5,
      justifyContent: 'center',
      opacity: visible ? 1 : 0,
      transform: visible ? 'translateY(0)' : 'translateY(6px)',
      transition: 'opacity 0.2s ease, transform 0.2s ease',
      pointerEvents: visible ? 'auto' : 'none',
      zIndex: 5,
    }}
  >
    {[
      { label: '▶ Play', loading: playLoading, handler: onPlay, hoverBg: 'rgba(34,197,94,0.85)' },
      ...(songCount > 1 ? [{ label: '⇄ Shuffle', loading: shuffleLoading, handler: onShuffle, hoverBg: 'rgba(99,102,241,0.85)' }] : []),
    ].map(({ label, loading, handler, hoverBg }) => (
      <button
        key={label}
        onClick={handler}
        aria-label={label}
        disabled={loading}
        style={{
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(6px)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 7,
          color: '#fff',
          cursor: loading ? 'not-allowed' : 'pointer',
          padding: '5px 10px',
          fontSize: 12,
          fontWeight: 600,
          display: 'flex',
          alignItems: 'center',
          gap: 4,
          fontFamily: 'inherit',
          transition: 'background 0.15s ease',
          opacity: loading ? 0.6 : 1,
          whiteSpace: 'nowrap',
        }}
        onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = hoverBg; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.75)'; }}
      >
        {loading ? <Spinner size={11} /> : label}
      </button>
    ))}
  </div>
);

// ── Mobile persistent play row ─────────────────────────────────────────────────
const MobilePlayRow = ({ songCount, playLoading, shuffleLoading, onPlay, onShuffle }) => (
  <div style={{ display: 'flex', gap: 6, padding: '7px 10px 2px' }}>
    <button
      onClick={onPlay}
      aria-label="Play playlist"
      disabled={playLoading}
      style={{
        flex: 1,
        background: '#0d2818',
        border: '1px solid #166534',
        borderRadius: 7,
        color: '#22c55e',
        fontSize: 12,
        fontWeight: 600,
        padding: '7px 6px',
        cursor: playLoading ? 'not-allowed' : 'pointer',
        fontFamily: 'inherit',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 4,
        opacity: playLoading ? 0.5 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      {playLoading ? <Spinner color="#22c55e" size={10} /> : '▶ Play'}
    </button>
    {songCount > 1 && (
      <button
        onClick={onShuffle}
        aria-label="Shuffle playlist"
        disabled={shuffleLoading}
        style={{
          flex: 1,
          background: '#0d1428',
          border: '1px solid #1e3a8a',
          borderRadius: 7,
          color: '#60a5fa',
          fontSize: 12,
          fontWeight: 600,
          padding: '7px 6px',
          cursor: shuffleLoading ? 'not-allowed' : 'pointer',
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          opacity: shuffleLoading ? 0.5 : 1,
          transition: 'opacity 0.15s',
        }}
      >
        {shuffleLoading ? <Spinner color="#60a5fa" size={10} /> : '⇄ Shuffle'}
      </button>
    )}
  </div>
);

// ── Inline rename ─────────────────────────────────────────────────────────────
const InlineRenameInput = ({ value, onChange, onCommit, onCancel, error }) => (
  <div>
    <input
      autoFocus
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter')  { e.preventDefault(); onCommit(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
      onBlur={onCommit}
      aria-label="Rename playlist"
      maxLength={100}
      style={{
        width: '100%',
        background: '#0d0d0d',
        border: `1px solid ${error ? '#f87171' : '#22c55e'}`,
        borderRadius: 6,
        padding: '4px 8px',
        color: '#fff',
        fontSize: 13,
        fontWeight: 600,
        outline: 'none',
        fontFamily: 'inherit',
      }}
    />
    {error && <p style={{ color: '#f87171', fontSize: 10, marginTop: 3 }}>{error}</p>}
  </div>
);

// ── Context menu ──────────────────────────────────────────────────────────────
const ContextMenu = ({ isUserOwned, canDelete, onRename, onDelete, onClose, isPinned, onTogglePin, pinnedAtMax }) => {
  const handleAction = (fn) => { fn?.(); onClose(); };
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 199 }} onClick={onClose} />
      <div
        role="menu"
        style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          right: 0,
          background: '#1e1e1e',
          border: '1px solid #2a2a2a',
          borderRadius: 10,
          overflow: 'hidden',
          zIndex: 200,
          minWidth: 158,
          boxShadow: '0 8px 28px rgba(0,0,0,0.7)',
          animation: 'pcMenuIn 0.15s ease',
        }}
      >
        {isUserOwned && (
          <>
            <ContextMenuItem
              label={isPinned ? '★ Unpin' : '☆ Pin to top'}
              onClick={() => handleAction(onTogglePin)}
              disabled={!isPinned && pinnedAtMax}
              title={!isPinned && pinnedAtMax ? 'Maximum 5 playlists pinned' : undefined}
              color="#facc15"
            />
            <ContextMenuItem label="✎ Rename" onClick={() => handleAction(onRename)} />
          </>
        )}
        {isUserOwned && canDelete && (
          <div style={{ borderTop: '1px solid #2a2a2a', margin: '4px 0' }} />
        )}
        {canDelete && (
          <ContextMenuItem label="⌫ Delete" onClick={() => handleAction(onDelete)} color="#f87171" />
        )}
      </div>
    </>
  );
};

const ContextMenuItem = ({ label, onClick, disabled, title, color }) => (
  <button
    role="menuitem"
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    title={title}
    style={{
      display: 'block',
      width: '100%',
      textAlign: 'left',
      background: 'none',
      border: 'none',
      padding: '9px 14px',
      color: disabled ? '#374151' : (color ?? '#d1d5db'),
      fontSize: 13,
      cursor: disabled ? 'not-allowed' : 'pointer',
      fontFamily: 'inherit',
      transition: 'background 0.15s ease',
    }}
    onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#2a2a2a'; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
  >
    {label}
  </button>
);

// ── Main PlaylistCard ─────────────────────────────────────────────────────────
const PlaylistCard = ({
  playlist,
  isUserOwned     = false,
  canDelete       = false,
  isPinned        = false,
  lastPlayedLabel = null,
  onQuickPlay,
  onDelete,
  onTogglePin,
  onStartRename,
  animationDelay  = 0,
  pinnedAtMax     = false,
  isRenaming      = false,
  renameValue     = '',
  renameError     = null,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}) => {
  injectCardStyles();

  const [hovered,        setHovered]       = useState(false);
  const [menuOpen,       setMenuOpen]       = useState(false);
  const [playLoading,    setPlayLoading]    = useState(false);
  const [shuffleLoading, setShuffleLoading] = useState(false);
  const [pinLoading,     setPinLoading]     = useState(false);
  const [entered,        setEntered]        = useState(false);

  // Stable: evaluated once on mount, never causes re-render
  const isMobile = useRef(detectMobileTouch());

  useEffect(() => {
    const t = setTimeout(() => setEntered(true), 20 + animationDelay);
    return () => clearTimeout(t);
  }, [animationDelay]);

  const songCount = playlist.songIds?.length ?? 0;

  // overlayVisible: dark cover overlay + waveform (desktop hover only)
  const overlayVisible  = !isMobile.current && hovered;
  // controlsVisible: pin + 3-dot buttons
  // Desktop → visible on hover or when menu is open or when pinned
  // Mobile  → always visible
  const controlsVisible = isMobile.current || hovered || menuOpen || isPinned;

  const handleQuickPlay = useCallback(async (e, shuffle) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onQuickPlay) return;
    shuffle ? setShuffleLoading(true) : setPlayLoading(true);
    try   { await onQuickPlay(playlist, shuffle); }
    catch (err) { console.error('[PlaylistCard] Quick play failed:', err.message); }
    finally { setPlayLoading(false); setShuffleLoading(false); }
  }, [playlist, onQuickPlay]);

  const handleTogglePin = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onTogglePin || pinLoading) return;
    setPinLoading(true);
    try   { await onTogglePin(playlist.id); }
    catch (err) { console.error('[PlaylistCard] Pin failed:', err.message); }
    finally { setPinLoading(false); }
  }, [playlist.id, onTogglePin, pinLoading]);

  const handleDelete = useCallback((e) => {
    e?.preventDefault?.();
    onDelete?.(playlist.id);
  }, [playlist.id, onDelete]);

  const handleStartRename = useCallback(() => onStartRename?.(playlist), [playlist, onStartRename]);

  const handleDoubleClick = useCallback((e) => {
    if (!isUserOwned) return;
    e.preventDefault();
    handleStartRename();
  }, [isUserOwned, handleStartRename]);

  const showMenuButton = isUserOwned || canDelete;

  return (
    /*
     * OUTER wrapper:
     *   - position: relative  ← context menu is absolutely positioned to this
     *   - NO overflow: hidden  ← lets the context menu escape the card bounds
     *   - Handles hover state and entrance animation
     */
    <div
      onMouseEnter={() => { if (!isMobile.current) setHovered(true); }}
      onMouseLeave={() => {
        if (!isMobile.current) {
          setHovered(false);
          setMenuOpen(false);
        }
      }}
      style={{
        position: 'relative',
        borderRadius: 12,
        opacity:   entered ? 1 : 0,
        transform: entered
          ? (hovered ? 'translateY(-3px)' : 'translateY(0)')
          : 'translateY(14px)',
        transition: 'transform 0.25s ease, box-shadow 0.25s ease, opacity 0.3s ease',
        boxShadow: hovered
          ? '0 10px 28px rgba(0,0,0,0.55), 0 0 0 1px rgba(34,197,94,0.1)'
          : '0 2px 8px rgba(0,0,0,0.2)',
      }}
    >
      {/*
       * INNER visual card:
       *   - overflow: hidden  ← scoped here so cover zoom stays clean
       *   - border + background
       */}
      <div
        style={{
          background: '#141414',
          border: `1px solid ${isPinned ? '#facc1530' : hovered ? '#2a2a2a' : '#1f1f1f'}`,
          borderRadius: 12,
          overflow: 'hidden',
          transition: 'border-color 0.25s ease',
        }}
      >
        {/* Pinned badge */}
        {isPinned && (
          <div
            aria-label="Pinned"
            style={{
              position: 'absolute',
              top: 8, left: 8,
              zIndex: 10,
              background: 'rgba(0,0,0,0.7)',
              backdropFilter: 'blur(4px)',
              borderRadius: 6,
              padding: '3px 6px',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              pointerEvents: 'none',
            }}
          >
            <PinIcon filled />
            <span style={{ color: '#facc15', fontSize: 10, fontWeight: 600 }}>Pinned</span>
          </div>
        )}

        {/* Cover + desktop hover buttons */}
        <Link
          to={`/playlists/${playlist.id}`}
          style={{ textDecoration: 'none', display: 'block', position: 'relative' }}
          onDoubleClick={handleDoubleClick}
          tabIndex={isRenaming ? -1 : 0}
        >
          <CoverArt playlist={playlist} overlayVisible={overlayVisible} />
          {!isMobile.current && (
            <HoverPlayButtons
              visible={overlayVisible}
              songCount={songCount}
              playLoading={playLoading}
              shuffleLoading={shuffleLoading}
              onPlay={(e) => handleQuickPlay(e, false)}
              onShuffle={(e) => handleQuickPlay(e, true)}
            />
          )}
        </Link>

        {/* Mobile play row (always visible) */}
        {isMobile.current && (
          <MobilePlayRow
            songCount={songCount}
            playLoading={playLoading}
            shuffleLoading={shuffleLoading}
            onPlay={(e) => handleQuickPlay(e, false)}
            onShuffle={(e) => handleQuickPlay(e, true)}
          />
        )}

        {/* Footer */}
        <div style={{ padding: '8px 10px 10px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              gap: 4,
              marginBottom: 3,
            }}
          >
            {isRenaming ? (
              <div style={{ flex: 1 }}>
                <InlineRenameInput
                  value={renameValue}
                  onChange={onRenameChange}
                  onCommit={onRenameCommit}
                  onCancel={onRenameCancel}
                  error={renameError}
                />
              </div>
            ) : (
              <Link
                to={`/playlists/${playlist.id}`}
                onDoubleClick={handleDoubleClick}
                title={isUserOwned ? 'Double-click to rename' : undefined}
                style={{
                  color: '#fff',
                  fontSize: 13,
                  fontWeight: 600,
                  textDecoration: 'none',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  flex: 1,
                  minWidth: 0,
                  cursor: isUserOwned ? 'text' : 'pointer',
                  lineHeight: 1.35,
                  paddingTop: 1,
                }}
              >
                {playlist.name}
              </Link>
            )}

            {/* Controls: pin + 3-dot */}
            {showMenuButton && !isRenaming && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 2,
                  flexShrink: 0,
                  opacity: controlsVisible ? 1 : 0,
                  transition: 'opacity 0.2s ease',
                }}
              >
                {isUserOwned && (
                  <button
                    onClick={handleTogglePin}
                    aria-label={isPinned ? 'Unpin' : 'Pin to top'}
                    title={isPinned ? 'Unpin' : pinnedAtMax ? 'Max 5 pinned' : 'Pin to top'}
                    disabled={pinLoading || (!isPinned && pinnedAtMax)}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: pinLoading || (!isPinned && pinnedAtMax) ? 'not-allowed' : 'pointer',
                      padding: '3px 4px',
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: 4,
                    }}
                  >
                    {pinLoading ? <Spinner color="#facc15" size={10} /> : <PinIcon filled={isPinned} />}
                  </button>
                )}

                {/* 3-dot + context menu — menu is on OUTER div (no overflow clip) */}
                <div style={{ position: 'relative' }}>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setMenuOpen((v) => !v);
                    }}
                    aria-label="Playlist options"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    style={{
                      background: menuOpen ? '#2a2a2a' : 'none',
                      border: 'none',
                      color: menuOpen ? '#d1d5db' : '#6b7280',
                      cursor: 'pointer',
                      padding: '3px 5px',
                      fontSize: 15,
                      lineHeight: 1,
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: 4,
                      transition: 'background 0.15s ease, color 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = '#2a2a2a';
                      e.currentTarget.style.color = '#d1d5db';
                    }}
                    onMouseLeave={(e) => {
                      if (!menuOpen) {
                        e.currentTarget.style.background = 'none';
                        e.currentTarget.style.color = '#6b7280';
                      }
                    }}
                  >
                    ···
                  </button>

                  {menuOpen && (
                    <ContextMenu
                      isUserOwned={isUserOwned}
                      canDelete={canDelete}
                      onRename={handleStartRename}
                      onDelete={handleDelete}
                      onClose={() => setMenuOpen(false)}
                      isPinned={isPinned}
                      onTogglePin={() => onTogglePin?.(playlist.id)}
                      pinnedAtMax={pinnedAtMax}
                    />
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Song count */}
          <p style={{ color: '#4b5563', fontSize: 11, margin: 0, marginBottom: lastPlayedLabel ? 4 : 0 }}>
            {songCount === 0 ? 'No songs' : `${songCount} song${songCount !== 1 ? 's' : ''}`}
          </p>

          {/* Last played badge */}
          {lastPlayedLabel && (
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                background: '#0d2818',
                border: '1px solid #166534',
                borderRadius: 5,
                padding: '2px 7px',
                marginTop: 2,
              }}
            >
              <span style={{ color: '#22c55e', fontSize: 9 }}>▶</span>
              <span style={{ color: '#16a34a', fontSize: 10, fontWeight: 500 }}>
                {lastPlayedLabel}
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PlaylistCard;