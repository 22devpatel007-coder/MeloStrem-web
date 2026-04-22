/**
 * client/src/components/playlists/TimelineView.jsx
 *
 * Timeline view for playlists — grouped by month-year creation date.
 * Renders as a vertical list with a date marker on the left side.
 *
 * Props:
 *   playlists        — Playlist[] (already filtered + sorted by date)
 *   isUserSection    — boolean (show user controls)
 *   isPinned         — (id) => boolean
 *   lastPlayedLabel  — (id) => string | null
 *   onQuickPlay      — (playlist, shuffle) => Promise<void>
 *   onDelete         — (id) => void
 *   onTogglePin      — (id) => Promise<void>
 *   onStartRename    — (playlist) => void
 *   renamingId       — string | null
 *   renameValue      — string
 *   renameError      — string | null
 *   onRenameChange   — (val) => void
 *   onRenameCommit   — (id, originalName) => void
 *   onRenameCancel   — () => void
 *   pinnedAtMax      — boolean
 */

import React, { useState, useCallback } from 'react';
import { Link } from 'react-router-dom';

// ── Date helpers ───────────────────────────────────────────────────────────────
const getMonthYearKey = (createdAt) => {
  if (!createdAt) return 'Unknown';
  const date = createdAt?.toDate?.() ?? new Date(createdAt);
  if (isNaN(date.getTime())) return 'Unknown';
  // Key format: "YYYY-MM" for correct chronological sort
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
};

const formatMonthYear = (key) => {
  if (key === 'Unknown') return 'Unknown Date';
  const [y, m] = key.split('-');
  const date = new Date(Number(y), Number(m) - 1, 1);
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
};

const formatShortDate = (createdAt) => {
  if (!createdAt) return '';
  const date = createdAt?.toDate?.() ?? new Date(createdAt);
  if (isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// ── Group playlists by month-year ─────────────────────────────────────────────
const groupByMonth = (playlists) => {
  const map = new Map();
  for (const pl of playlists) {
    const key = getMonthYearKey(pl.createdAt);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(pl);
  }
  // Sort keys chronologically descending (newest first)
  const sorted = [...map.entries()].sort(([a], [b]) => {
    if (a === 'Unknown') return 1;
    if (b === 'Unknown') return -1;
    return b.localeCompare(a); // lexicographic sort works for YYYY-MM
  });
  return sorted;
};

// ── Pin icon ───────────────────────────────────────────────────────────────────
const PinIcon = ({ filled }) => (
  <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
    <path
      d="M6.5 1L8.2 4.5L12 5L9.25 7.65L9.9 11.5L6.5 9.7L3.1 11.5L3.75 7.65L1 5L4.8 4.5L6.5 1Z"
      fill={filled ? '#facc15' : 'none'}
      stroke={filled ? '#facc15' : '#6b7280'}
      strokeWidth="1.2"
      strokeLinejoin="round"
    />
  </svg>
);

// ── Timeline Row ──────────────────────────────────────────────────────────────
const TimelineRow = ({
  playlist,
  isUserOwned,
  isPinned,
  lastPlayedLabel,
  onQuickPlay,
  onDelete,
  onTogglePin,
  onStartRename,
  isRenaming,
  renameValue,
  renameError,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  pinnedAtMax,
  index,
}) => {
  const [hovered, setHovered] = useState(false);
  const [, setMenuOpen] = useState(false);
  const [playLoading, setPlayLoading] = useState(false);
  const [shuffleLoading, setShuffleLoading] = useState(false);
  const [entered, setEntered] = useState(false);

  React.useEffect(() => {
    const t = setTimeout(() => setEntered(true), 30 + index * 40);
    return () => clearTimeout(t);
  }, [index]);

  const songCount = playlist.songIds?.length ?? 0;
  const shortDate = formatShortDate(playlist.createdAt);

  const handlePlay = useCallback(async (e, shuffle) => {
    e.preventDefault();
    e.stopPropagation();
    if (!onQuickPlay) return;
    if (shuffle) setShuffleLoading(true);
    else setPlayLoading(true);
    try {
      await onQuickPlay(playlist, shuffle);
    } catch (err) {
      console.error('[TimelineRow] play error:', err.message);
    } finally {
      setPlayLoading(false);
      setShuffleLoading(false);
    }
  }, [playlist, onQuickPlay]);

  const handleDoubleClick = useCallback((e) => {
    if (!isUserOwned) return;
    e.preventDefault();
    onStartRename?.(playlist);
  }, [isUserOwned, onStartRename, playlist]);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setMenuOpen(false); }}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '10px 12px',
        borderRadius: 10,
        cursor: 'pointer',
        transition: 'background 0.2s ease, opacity 0.35s ease, transform 0.35s ease',
        background: hovered ? '#1a1a1a' : 'transparent',
        opacity: entered ? 1 : 0,
        transform: entered ? 'translateX(0)' : 'translateX(-12px)',
        position: 'relative',
      }}
    >
      {/* Thumbnail */}
      <Link
        to={`/playlists/${playlist.id}`}
        style={{ textDecoration: 'none', flexShrink: 0 }}
        tabIndex={isRenaming ? -1 : 0}
      >
        <div
          style={{
            width: 52,
            height: 52,
            borderRadius: 8,
            background: playlist.coverUrl
              ? 'transparent'
              : 'linear-gradient(135deg, #1a1a1a, #111)',
            overflow: 'hidden',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            border: '1px solid #2a2a2a',
            position: 'relative',
          }}
        >
          {playlist.coverUrl ? (
            <img
              src={playlist.coverUrl}
              alt={playlist.name}
              loading="lazy"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                transition: 'transform 0.3s ease',
                transform: hovered ? 'scale(1.08)' : 'scale(1)',
              }}
            />
          ) : (
            <span style={{ color: hovered ? '#22c55e' : '#374151', fontSize: 20, transition: 'color 0.2s ease' }}>♪</span>
          )}
          {/* Play overlay on hover */}
          {hovered && (
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(0,0,0,0.5)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
              onClick={(e) => handlePlay(e, false)}
            >
              <span style={{ color: '#22c55e', fontSize: 16 }}>▶</span>
            </div>
          )}
        </div>
      </Link>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {isRenaming ? (
          <input
            autoFocus
            type="text"
            value={renameValue}
            onChange={(e) => onRenameChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onRenameCommit();
              if (e.key === 'Escape') onRenameCancel();
            }}
            onBlur={onRenameCommit}
            maxLength={100}
            style={{
              background: '#0d0d0d',
              border: `1px solid ${renameError ? '#f87171' : '#22c55e'}`,
              borderRadius: 6,
              padding: '3px 8px',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              outline: 'none',
              width: '80%',
              fontFamily: 'inherit',
            }}
          />
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
              display: 'block',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {isPinned && (
              <span style={{ marginRight: 5 }}><PinIcon filled /></span>
            )}
            {playlist.name}
          </Link>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
          <span style={{ color: '#4b5563', fontSize: 11 }}>
            {songCount === 0 ? 'No songs' : `${songCount} song${songCount !== 1 ? 's' : ''}`}
          </span>
          {lastPlayedLabel && (
            <span
              style={{
                color: '#16a34a',
                fontSize: 10,
                background: '#0d2818',
                border: '1px solid #166534',
                borderRadius: 4,
                padding: '1px 6px',
              }}
            >
              ▶ {lastPlayedLabel}
            </span>
          )}
        </div>
      </div>

      {/* Right side: quick actions + date */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexShrink: 0,
        }}
      >
        {/* Quick actions on hover */}
        {hovered && songCount > 0 && (
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onClick={(e) => handlePlay(e, false)}
              aria-label={`Play ${playlist.name}`}
              disabled={playLoading}
              style={{
                background: '#22c55e',
                border: 'none',
                borderRadius: 6,
                color: '#000',
                cursor: 'pointer',
                padding: '4px 10px',
                fontSize: 11,
                fontWeight: 700,
                transition: 'all 0.15s ease',
                fontFamily: 'inherit',
              }}
            >
              {playLoading ? '…' : '▶'}
            </button>
            {songCount > 1 && (
              <button
                onClick={(e) => handlePlay(e, true)}
                aria-label={`Shuffle ${playlist.name}`}
                disabled={shuffleLoading}
                style={{
                  background: 'transparent',
                  border: '1px solid #2a2a2a',
                  borderRadius: 6,
                  color: '#9ca3af',
                  cursor: 'pointer',
                  padding: '4px 10px',
                  fontSize: 11,
                  transition: 'all 0.15s ease',
                  fontFamily: 'inherit',
                }}
              >
                {shuffleLoading ? '…' : '⇄'}
              </button>
            )}
          </div>
        )}

        {/* User controls */}
        {isUserOwned && hovered && !isRenaming && (
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              onClick={(e) => { e.stopPropagation(); onTogglePin?.(playlist.id); }}
              aria-label={isPinned ? 'Unpin' : 'Pin'}
              title={isPinned ? 'Unpin' : pinnedAtMax ? 'Max 5 pinned' : 'Pin to top'}
              disabled={!isPinned && pinnedAtMax}
              style={{
                background: 'none',
                border: 'none',
                cursor: !isPinned && pinnedAtMax ? 'not-allowed' : 'pointer',
                padding: '3px 5px',
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <PinIcon filled={isPinned} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onStartRename?.(playlist); }}
              aria-label="Rename"
              style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '3px 5px', fontSize: 12 }}
            >
              ✎
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); onDelete?.(playlist.id); }}
              aria-label="Delete"
              style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', padding: '3px 5px', fontSize: 12, transition: 'color 0.15s' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#f87171')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#6b7280')}
            >
              ⌫
            </button>
          </div>
        )}

        {/* Date label */}
        {shortDate && (
          <span
            style={{
              color: '#374151',
              fontSize: 11,
              whiteSpace: 'nowrap',
              minWidth: 60,
              textAlign: 'right',
              display: hovered ? 'none' : 'block',
            }}
          >
            {shortDate}
          </span>
        )}
      </div>
    </div>
  );
};

// ── Main TimelineView ─────────────────────────────────────────────────────────
const TimelineView = ({
  playlists = [],
  isUserSection = false,
  isPinned,
  lastPlayedLabel,
  onQuickPlay,
  onDelete,
  onTogglePin,
  onStartRename,
  renamingId,
  renameValue,
  renameError,
  onRenameChange,
  onRenameCommit,
  onRenameCancel,
  pinnedAtMax,
}) => {
  const groups = groupByMonth(playlists);

  if (groups.length === 0) {
    return (
      <div style={{ textAlign: 'center', padding: '40px 20px', color: '#374151' }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>♪</div>
        <p style={{ fontSize: 14 }}>No playlists to show</p>
      </div>
    );
  }

  let globalIndex = 0;

  return (
    <div style={{ position: 'relative' }}>
      {/* Vertical timeline line */}
      <div
        style={{
          position: 'absolute',
          left: 28,
          top: 0,
          bottom: 0,
          width: 1,
          background: 'linear-gradient(to bottom, transparent, #1f1f1f 10%, #1f1f1f 90%, transparent)',
          pointerEvents: 'none',
        }}
        aria-hidden="true"
      />

      {groups.map(([key, groupPlaylists]) => (
        <div key={key} style={{ marginBottom: 28 }}>
          {/* Month header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 6,
              paddingLeft: 0,
            }}
          >
            {/* Timeline dot */}
            <div
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#22c55e',
                border: '2px solid #0d2818',
                flexShrink: 0,
                marginLeft: 24,
                boxShadow: '0 0 6px #22c55e50',
              }}
              aria-hidden="true"
            />
            <span
              style={{
                color: '#6b7280',
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                letterSpacing: '0.6px',
              }}
            >
              {formatMonthYear(key)}
              <span style={{ color: '#374151', fontWeight: 400, marginLeft: 6 }}>
                · {groupPlaylists.length} playlist{groupPlaylists.length !== 1 ? 's' : ''}
              </span>
            </span>
          </div>

          {/* Rows */}
          <div style={{ paddingLeft: 16 }}>
            {groupPlaylists.map((pl) => {
              const rowIndex = globalIndex++;
              return (
                <TimelineRow
                  key={pl.id}
                  playlist={pl}
                  isUserOwned={isUserSection}
                  isPinned={isPinned?.(pl.id) ?? false}
                  lastPlayedLabel={lastPlayedLabel?.(pl.id) ?? null}
                  onQuickPlay={onQuickPlay}
                  onDelete={onDelete}
                  onTogglePin={onTogglePin}
                  onStartRename={onStartRename}
                  isRenaming={renamingId === pl.id}
                  renameValue={renameValue}
                  renameError={renameError}
                  onRenameChange={onRenameChange}
                  onRenameCommit={() => onRenameCommit?.(pl.id, pl.name)}
                  onRenameCancel={onRenameCancel}
                  pinnedAtMax={pinnedAtMax}
                  index={rowIndex}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
};

export default TimelineView;