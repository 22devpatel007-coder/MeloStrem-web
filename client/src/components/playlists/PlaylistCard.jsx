/**
 * client/src/components/playlists/PlaylistCard.jsx
 *
 * Phase 1 — Task 1.2: sanitizeDisplay() applied to all API-sourced string
 * render points.
 *
 * Changes from previous version (SURGICAL — only render sites changed):
 *
 *   1. Import sanitizeDisplay from '../../utils/sanitize'
 *
 *   2. Compute sanitized display values once inside the component body:
 *        safeName = sanitizeDisplay(playlist.name)
 *
 *   3. Replace raw `playlist.name` in JSX text nodes with safeName:
 *        - The footer Link text (the clickable playlist name)
 *        - The `title` attribute on that Link (double-click-to-rename tooltip)
 *
 *   4. CoverArt alt attribute also uses safeName via prop.
 *
 * Everything else is IDENTICAL to the previous version:
 *   - All props, hooks, state, event handlers: untouched
 *   - Two-layer card structure (outer no-overflow / inner overflow:hidden): untouched
 *   - isMobile detection, HoverPlayButtons, MobilePlayRow: untouched
 *   - Context menu, pin button, rename input: untouched
 *   - Song count label, last-played badge: untouched
 *   - All animations and CSS keyframes: untouched
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { sanitizeDisplay } from '../../utils/sanitize'; // ← Task 1.2

// ── Touch + narrow screen detection ──────────────────────────────────────────
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
const CoverArt = ({ playlist, safeName, overlayVisible }) => {
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
          alt={safeName}
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
          backdropFilter: 'blur(8px)',
          border: '1px solid rgba(255,255,255,0.12)',
          color: '#fff',
          borderRadius: 7,
          padding: '5px 10px',
          fontSize: 11,
          fontWeight: 600,
          cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 5,
          transition: 'background 0.2s ease',
          opacity: loading ? 0.6 : 1,
          fontFamily: 'inherit',
        }}
        onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = hoverBg; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.75)'; }}
      >
        {loading ? <Spinner size={10} /> : label}
      </button>
    ))}
  </div>
);

// ── Mobile play row ────────────────────────────────────────────────────────────
const MobilePlayRow = ({ songCount, playLoading, shuffleLoading, onPlay, onShuffle }) => (
  <div
    style={{
      display: 'flex',
      gap: 6,
      padding: '6px 8px',
      borderTop: '1px solid rgba(255,255,255,0.06)',
    }}
  >
    {[
      { label: '▶ Play', loading: playLoading, handler: onPlay, bg: '#1a3a26', border: '#166534', color: '#22c55e' },
      ...(songCount > 1 ? [{ label: '⇄ Shuffle', loading: shuffleLoading, handler: onShuffle, bg: '#1e1b4b', border: '#3730a3', color: '#818cf8' }] : []),
    ].map(({ label, loading, handler, bg, border, color }) => (
      <button
        key={label}
        onClick={handler}
        aria-label={label}
        disabled={loading}
        style={{
          flex: 1,
          background: bg,
          border: `1px solid ${border}`,
          color,
          borderRadius: 7,
          padding: '7px 4px',
          fontSize: 11,
          fontWeight: 700,
          cursor: loading ? 'not-allowed' : 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 4,
          opacity: loading ? 0.6 : 1,
          fontFamily: 'inherit',
          minHeight: 34,
        }}
      >
        {loading ? <Spinner color={color} size={10} /> : label}
      </button>
    ))}
  </div>
);

// ── Inline rename input ────────────────────────────────────────────────────────
const InlineRenameInput = ({ value, onChange, onCommit, onCancel, error }) => (
  <div>
    <input
      autoFocus
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter')  { e.preventDefault(); onCommit(); }
        if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      }}
      onBlur={onCommit}
      onClick={(e) => e.preventDefault()}
      maxLength={100}
      style={{
        width: '100%',
        background: '#1a1a1a',
        border: `1px solid ${error ? '#ef4444' : '#374151'}`,
        borderRadius: 5,
        color: '#fff',
        fontSize: 12,
        fontWeight: 600,
        padding: '4px 7px',
        outline: 'none',
        fontFamily: 'inherit',
        boxSizing: 'border-box',
      }}
    />
    {error && (
      <p style={{ color: '#ef4444', fontSize: 10, margin: '3px 0 0', lineHeight: 1.3 }}>
        {error}
      </p>
    )}
  </div>
);

// ── Context menu ──────────────────────────────────────────────────────────────
const ContextMenu = ({ isUserOwned, canDelete, onRename, onDelete, onClose, isPinned, onTogglePin, pinnedAtMax }) => {
  useEffect(() => {
    const close = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', close);
    return () => document.removeEventListener('keydown', close);
  }, [onClose]);

  const items = [
    ...(isUserOwned ? [{ label: isPinned ? 'Unpin' : 'Pin to top', disabled: !isPinned && pinnedAtMax, action: () => { onTogglePin(); onClose(); } }] : []),
    ...(isUserOwned ? [{ label: 'Rename', action: () => { onRename(); onClose(); } }] : []),
    ...(canDelete   ? [{ label: 'Delete', action: () => { onDelete(); onClose(); }, danger: true }] : []),
  ];

  if (items.length === 0) return null;

  return (
    <>
      {/* Click-away backdrop */}
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 49 }}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
      />
      <div
        role="menu"
        style={{
          position: 'absolute',
          top: '100%',
          right: 0,
          marginTop: 4,
          background: '#1a1a1a',
          border: '1px solid #2d2d2d',
          borderRadius: 8,
          padding: '4px 0',
          minWidth: 150,
          zIndex: 50,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          animation: 'pcMenuIn 0.12s ease',
        }}
      >
        {items.map(({ label, action, disabled, danger }) => (
          <button
            key={label}
            role="menuitem"
            onClick={(e) => { e.stopPropagation(); if (!disabled) action(); }}
            disabled={disabled}
            style={{
              display: 'block',
              width: '100%',
              background: 'none',
              border: 'none',
              color: danger ? '#ef4444' : disabled ? '#374151' : '#d1d5db',
              fontSize: 12,
              fontWeight: 500,
              padding: '7px 14px',
              textAlign: 'left',
              cursor: disabled ? 'not-allowed' : 'pointer',
              fontFamily: 'inherit',
              transition: 'background 0.12s ease',
            }}
            onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#2a2a2a'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
};

// ── PlaylistCard ──────────────────────────────────────────────────────────────
const PlaylistCard = ({
  playlist,
  isPlaying = false,
  isUserOwned = false,
  canDelete = false,
  isPinned = false,
  pinnedAtMax = false,
  lastPlayedAt = null,
  onQuickPlay,
  onDelete,
  onTogglePin,
  onStartRename,
  isRenaming = false,
  renameValue = '',
  renameError = '',
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}) => {
  useEffect(() => { injectCardStyles(); }, []);

  const isMobile       = useRef(detectMobileTouch());
  const [hovered,      setHovered]   = useState(false);
  const [menuOpen,     setMenuOpen]  = useState(false);
  const [playLoading,  setPlayLoad]  = useState(false);
  const [shuffleLoading, setShuffleLoad] = useState(false);

  const songCount      = Array.isArray(playlist.songIds) ? playlist.songIds.length : 0;
  const showMenuButton = isUserOwned || canDelete;
  const overlayVisible = (hovered && !isRenaming) || isPlaying;
  const controlsVisible = isMobile.current ? true : hovered || menuOpen;

  // ── Task 1.2: Sanitize playlist name once ─────────────────────────────────
  const safeName = sanitizeDisplay(playlist.name);
  // ─────────────────────────────────────────────────────────────────────────

  const lastPlayedLabel = React.useMemo(() => {
    if (!lastPlayedAt) return null;
    const d = lastPlayedAt instanceof Date ? lastPlayedAt : new Date(lastPlayedAt);
    if (isNaN(d.getTime())) return null;
    const diffMs = Date.now() - d.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1)   return 'Just now';
    if (diffMin < 60)  return `${diffMin}m ago`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24)    return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7)     return `${diffD}d ago`;
    return null;
  }, [lastPlayedAt]);

  const handleQuickPlay = useCallback(async (e, shuffle) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onQuickPlay) return;
    if (shuffle) setShuffleLoad(true);
    else         setPlayLoad(true);
    try {
      await onQuickPlay(playlist.id, shuffle);
    } finally {
      setPlayLoad(false);
      setShuffleLoad(false);
    }
  }, [onQuickPlay, playlist.id]);

  const handleDelete = useCallback((e) => {
    e?.stopPropagation?.();
    onDelete?.(playlist.id);
  }, [onDelete, playlist.id]);

  const handleTogglePin = useCallback((e) => {
    e?.stopPropagation?.();
    onTogglePin?.(playlist.id);
  }, [onTogglePin, playlist.id]);

  const handleStartRename = useCallback(() => {
    onStartRename?.(playlist.id, playlist.name);
  }, [onStartRename, playlist.id, playlist.name]);

  const handleDoubleClick = useCallback((e) => {
    if (!isUserOwned) return;
    e.preventDefault();
    handleStartRename();
  }, [isUserOwned, handleStartRename]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false); }}
      style={{ position: 'relative' }}
    >
      <div
        style={{
          background: '#111',
          borderRadius: 12,
          border: `1px solid ${isPlaying ? 'rgba(34,197,94,0.3)' : hovered ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.04)'}`,
          transition: 'border-color 0.25s ease',
          overflow: 'hidden',
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
          <CoverArt playlist={playlist} safeName={safeName} overlayVisible={overlayVisible} />
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
                title={isUserOwned ? `${safeName} — Double-click to rename` : safeName}
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
                {safeName}
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
                    disabled={!isPinned && pinnedAtMax}
                    style={{
                      background: 'none',
                      border: 'none',
                      cursor: (!isPinned && pinnedAtMax) ? 'not-allowed' : 'pointer',
                      padding: '3px 4px',
                      display: 'flex',
                      alignItems: 'center',
                      borderRadius: 4,
                    }}
                  >
                    <PinIcon filled={isPinned} />
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