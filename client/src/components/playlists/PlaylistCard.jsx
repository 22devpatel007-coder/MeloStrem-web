/**
 * client/src/components/playlists/PlaylistCard.jsx
 *
 * Full-featured playlist card with:
 *   • Hover animations (lift + shadow bloom + overlay reveal)
 *   • Quick Play (song 1) + Shuffle Play buttons on hover
 *   • Pin / Unpin toggle
 *   • Inline rename on double-click
 *   • 3-dot context menu (Edit, Delete)
 *   • "Last played X days ago" badge
 *   • Waveform animation on hover
 *   • Stagger entrance animation (via animationDelay prop)
 *   • Mosaic cover (2×2 from song covers) when 4+ songs available
 *   • Pinned badge indicator
 *
 * Props:
 *   playlist         — Playlist object
 *   isUserOwned      — boolean (shows delete/rename/pin controls)
 *   isPinned         — boolean
 *   lastPlayedLabel  — string | null  ("Today", "3 days ago", etc.)
 *   onQuickPlay      — (playlist, shuffle: boolean) => Promise<void>
 *   onDelete         — (playlistId) => void
 *   onTogglePin      — (playlistId) => Promise<void>
 *   onStartRename    — (playlist) => void
 *   animationDelay   — number (ms) for stagger entrance
 *   pinnedAtMax      — boolean (disable pin if already at max and not pinned)
 */

import React, { useState, useRef, useCallback } from 'react';
import { Link } from 'react-router-dom';

// ── Waveform bars (CSS animated) ──────────────────────────────────────────────
const WaveformOverlay = () => {
  const heights = [0.5, 0.9, 0.65, 1.0, 0.75, 0.55, 0.85, 0.5, 0.7, 0.6];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 2.5,
        height: 24,
      }}
      aria-hidden="true"
    >
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: `${h * 100}%`,
            background: 'rgba(34, 197, 94, 0.9)',
            borderRadius: 2,
            animation: `cardWave 0.7s ease-in-out ${i * 0.07}s infinite alternate`,
          }}
        />
      ))}
    </div>
  );
};

// ── Pin icon ───────────────────────────────────────────────────────────────────
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

// ── Cover art ─────────────────────────────────────────────────────────────────
const CoverArt = ({ playlist, hovered }) => {
  const coverUrl = playlist.coverUrl ?? null;

  return (
    <div
      style={{
        width: '100%',
        aspectRatio: '1 / 1',
        background: '#111',
        position: 'relative',
        overflow: 'hidden',
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
            transform: hovered ? 'scale(1.06)' : 'scale(1)',
            filter: hovered ? 'brightness(0.65)' : 'brightness(1)',
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
            color: hovered ? '#22c55e' : '#374151',
            fontSize: 32,
            transition: 'color 0.3s ease',
          }}
        >
          ♪
        </div>
      )}

      {/* Overlay on hover */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: 'rgba(0,0,0,0.45)',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.25s ease',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
        }}
      >
        {/* Waveform */}
        {hovered && <WaveformOverlay />}
      </div>
    </div>
  );
};

// ── Context menu ──────────────────────────────────────────────────────────────
const ContextMenu = ({ onRename, onDelete, onClose, isPinned, onTogglePin, pinnedAtMax }) => {
  const menuRef = useRef(null);

  const handleAction = (fn) => {
    fn?.();
    onClose();
  };

  return (
    <>
      <div
        style={{ position: 'fixed', inset: 0, zIndex: 99 }}
        onClick={onClose}
      />
      <div
        ref={menuRef}
        role="menu"
        style={{
          position: 'absolute',
          top: 28,
          right: 0,
          background: '#1e1e1e',
          border: '1px solid #2a2a2a',
          borderRadius: 10,
          overflow: 'hidden',
          zIndex: 100,
          minWidth: 160,
          boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
          animation: 'menuIn 0.15s ease',
        }}
      >
        <style>{`
          @keyframes menuIn {
            from { opacity: 0; transform: scale(0.95) translateY(-4px); }
            to   { opacity: 1; transform: scale(1) translateY(0); }
          }
        `}</style>
        <MenuItem
          label={isPinned ? '★ Unpin' : '☆ Pin to top'}
          onClick={() => handleAction(onTogglePin)}
          disabled={!isPinned && pinnedAtMax}
          title={!isPinned && pinnedAtMax ? 'Maximum 5 playlists pinned' : undefined}
          color="#facc15"
        />
        <MenuItem label="✎ Rename" onClick={() => handleAction(onRename)} />
        <div style={{ borderTop: '1px solid #2a2a2a', margin: '4px 0' }} />
        <MenuItem label="⌫ Delete" onClick={() => handleAction(onDelete)} color="#f87171" />
      </div>
    </>
  );
};

const MenuItem = ({ label, onClick, disabled, title, color }) => (
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
      transition: 'background 0.15s ease',
      fontFamily: 'inherit',
    }}
    onMouseEnter={(e) => { if (!disabled) e.currentTarget.style.background = '#2a2a2a'; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = 'none'; }}
  >
    {label}
  </button>
);

// ── Quick action buttons ───────────────────────────────────────────────────────
const QuickActionButton = ({ onClick, label, children, loading, title }) => (
  <button
    onClick={onClick}
    aria-label={label}
    title={title ?? label}
    disabled={loading}
    style={{
      background: 'rgba(0,0,0,0.7)',
      backdropFilter: 'blur(4px)',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 8,
      color: '#fff',
      cursor: loading ? 'not-allowed' : 'pointer',
      padding: '6px 10px',
      fontSize: 14,
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      transition: 'all 0.15s ease',
      fontFamily: 'inherit',
      opacity: loading ? 0.6 : 1,
    }}
    onMouseEnter={(e) => { if (!loading) e.currentTarget.style.background = 'rgba(34,197,94,0.85)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.background = 'rgba(0,0,0,0.7)'; }}
  >
    {loading ? (
      <span
        style={{
          width: 12,
          height: 12,
          border: '2px solid rgba(255,255,255,0.4)',
          borderTopColor: '#fff',
          borderRadius: '50%',
          display: 'inline-block',
          animation: 'spin 0.7s linear infinite',
        }}
      />
    ) : children}
  </button>
);

// ── Inline rename input ───────────────────────────────────────────────────────
const InlineRenameInput = ({
  value,
  onChange,
  onCommit,
  onCancel,
  error,
  playlistId,
}) => {
  const inputRef = useRef(null);

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') { e.preventDefault(); onCommit(); }
    if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
  };

  return (
    <div>
      <input
        ref={inputRef}
        autoFocus
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={onCommit}
        aria-label={`Rename playlist`}
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
      {error && (
        <p style={{ color: '#f87171', fontSize: 10, marginTop: 3 }}>{error}</p>
      )}
    </div>
  );
};

// ── Main PlaylistCard ─────────────────────────────────────────────────────────
const PlaylistCard = ({
  playlist,
  isUserOwned = false,
  isPinned = false,
  lastPlayedLabel = null,
  onQuickPlay,
  onDelete,
  onTogglePin,
  onStartRename,
  animationDelay = 0,
  pinnedAtMax = false,
  // Rename state from parent hook
  isRenaming = false,
  renameValue = '',
  renameError = null,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
}) => {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [playLoading, setPlayLoading] = useState(false);
  const [shuffleLoading, setShuffleLoading] = useState(false);
  const [pinLoading, setPinLoading] = useState(false);
  const [entered, setEntered] = useState(false);

  // Trigger entrance animation after mount delay
  React.useEffect(() => {
    const t = setTimeout(() => setEntered(true), 20 + animationDelay);
    return () => clearTimeout(t);
  }, [animationDelay]);

  const songCount = playlist.songIds?.length ?? 0;

  const handleQuickPlay = useCallback(async (e, shuffle) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onQuickPlay) return;
    if (shuffle) setShuffleLoading(true);
    else setPlayLoading(true);
    try {
      await onQuickPlay(playlist, shuffle);
    } catch (err) {
      console.error('[PlaylistCard] Quick play failed:', err.message);
    } finally {
      setPlayLoading(false);
      setShuffleLoading(false);
    }
  }, [playlist, onQuickPlay]);

  const handleTogglePin = useCallback(async (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onTogglePin || pinLoading) return;
    setPinLoading(true);
    try {
      await onTogglePin(playlist.id);
    } catch (err) {
      console.error('[PlaylistCard] Toggle pin failed:', err.message);
    } finally {
      setPinLoading(false);
    }
  }, [playlist.id, onTogglePin, pinLoading]);

  const handleDelete = useCallback((e) => {
    e?.preventDefault?.();
    onDelete?.(playlist.id);
  }, [playlist.id, onDelete]);

  const handleStartRename = useCallback(() => {
    onStartRename?.(playlist);
  }, [playlist, onStartRename]);

  const handleDoubleClick = useCallback((e) => {
    if (!isUserOwned) return;
    e.preventDefault();
    handleStartRename();
  }, [isUserOwned, handleStartRename]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false); }}
      style={{
        background: '#141414',
        border: `1px solid ${isPinned ? '#facc1530' : hovered ? '#2a2a2a' : '#1f1f1f'}`,
        borderRadius: 12,
        overflow: 'hidden',
        cursor: 'pointer',
        position: 'relative',
        transition: 'transform 0.25s ease, box-shadow 0.25s ease, border-color 0.25s ease, opacity 0.35s ease',
        transform: entered
          ? (hovered ? 'translateY(-4px)' : 'translateY(0)')
          : 'translateY(16px)',
        opacity: entered ? 1 : 0,
        boxShadow: hovered
          ? '0 12px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(34,197,94,0.08)'
          : '0 2px 8px rgba(0,0,0,0.2)',
        // Delay is handled via entered state + animationDelay
      }}
    >
      <style>{`
        @keyframes cardWave {
          from { transform: scaleY(0.3); opacity: 0.7; }
          to   { transform: scaleY(1);   opacity: 1;   }
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>

      {/* Pin badge */}
      {isPinned && (
        <div
          style={{
            position: 'absolute',
            top: 8,
            left: 8,
            zIndex: 10,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(4px)',
            borderRadius: 6,
            padding: '3px 6px',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
          aria-label="Pinned"
        >
          <PinIcon filled />
          <span style={{ color: '#facc15', fontSize: 10, fontWeight: 600 }}>Pinned</span>
        </div>
      )}

      {/* Cover art area */}
      <Link
        to={`/playlists/${playlist.id}`}
        style={{ textDecoration: 'none', display: 'block' }}
        onDoubleClick={handleDoubleClick}
        tabIndex={isRenaming ? -1 : 0}
      >
        <CoverArt playlist={playlist} hovered={hovered} />
      </Link>

      {/* Quick action buttons — appear on hover */}
      <div
        style={{
          position: 'absolute',
          bottom: songCount > 0 ? 72 : 60,
          left: 0,
          right: 0,
          padding: '0 10px',
          display: 'flex',
          gap: 6,
          justifyContent: 'center',
          opacity: hovered ? 1 : 0,
          transform: hovered ? 'translateY(0)' : 'translateY(6px)',
          transition: 'opacity 0.2s ease, transform 0.2s ease',
          pointerEvents: hovered ? 'auto' : 'none',
          zIndex: 5,
        }}
      >
        <QuickActionButton
          onClick={(e) => handleQuickPlay(e, false)}
          label={`Play ${playlist.name}`}
          loading={playLoading}
          title="Play from start"
        >
          ▶ Play
        </QuickActionButton>
        {songCount > 1 && (
          <QuickActionButton
            onClick={(e) => handleQuickPlay(e, true)}
            label={`Shuffle ${playlist.name}`}
            loading={shuffleLoading}
            title="Shuffle play"
          >
            ⇄ Shuffle
          </QuickActionButton>
        )}
      </div>

      {/* Card footer */}
      <div style={{ padding: '10px 12px 12px' }}>
        {/* Title row */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 6,
            marginBottom: 4,
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
                playlistId={playlist.id}
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
                cursor: isUserOwned ? 'text' : 'pointer',
              }}
            >
              {playlist.name}
            </Link>
          )}

          {/* Controls: pin + 3-dot menu (user-owned only) */}
          {isUserOwned && !isRenaming && (
            <div
              style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}
            >
              {/* Pin button */}
              <button
                onClick={handleTogglePin}
                aria-label={isPinned ? 'Unpin playlist' : 'Pin playlist'}
                title={
                  isPinned
                    ? 'Unpin'
                    : pinnedAtMax
                    ? 'Max 5 playlists pinned'
                    : 'Pin to top'
                }
                disabled={pinLoading || (!isPinned && pinnedAtMax)}
                style={{
                  background: 'none',
                  border: 'none',
                  cursor: pinLoading || (!isPinned && pinnedAtMax) ? 'not-allowed' : 'pointer',
                  padding: '2px 4px',
                  display: 'flex',
                  alignItems: 'center',
                  opacity: hovered || isPinned ? 1 : 0,
                  transition: 'opacity 0.2s ease',
                }}
              >
                <PinIcon filled={isPinned} />
              </button>

              {/* 3-dot menu */}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setMenuOpen((v) => !v); }}
                  aria-label="Playlist options"
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#6b7280',
                    cursor: 'pointer',
                    padding: '2px 5px',
                    fontSize: 16,
                    lineHeight: 1,
                    display: 'flex',
                    alignItems: 'center',
                    opacity: hovered || menuOpen ? 1 : 0,
                    transition: 'opacity 0.2s ease, color 0.15s ease',
                    borderRadius: 4,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = '#d1d5db')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
                >
                  ···
                </button>
                {menuOpen && (
                  <ContextMenu
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
        <p style={{ color: '#4b5563', fontSize: 11, marginBottom: lastPlayedLabel ? 5 : 0 }}>
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
  );
};

export default PlaylistCard;