/**
 * client/src/components/player/QueueDrawer.jsx
 *
 * Rebuilt with:
 * - Drag-and-drop reordering via HTML5 drag API (zero extra deps)
 * - Played / Now Playing / Upcoming visual indicators
 * - Remove button per song
 * - Click-to-play any song in queue
 * - Matches existing dark player theme from MusicPlayer.jsx
 */

import { useState, useRef, useCallback } from 'react';
import { useQueueStore } from '../../store/queueStore';
import { usePlayerStore } from '../../store/playerStore';

export const QueueDrawer = ({ open, onClose }) => {
  const { queue, removeFromQueue, reorderQueue } = useQueueStore();
  const { currentSong, playSong, recentlyPlayed, shuffleMode } = usePlayerStore();

  // ── Drag state ─────────────────────────────────────────────────────────────
  const [dragOverIndex, setDragOverIndex] = useState(null);
  const dragIndexRef = useRef(null);

  const handleDragStart = useCallback((e, index) => {
    dragIndexRef.current = index;
    e.dataTransfer.effectAllowed = 'move';
    // Slight delay so the ghost image captures before opacity change
    setTimeout(() => {
      if (e.target) e.target.style.opacity = '0.4';
    }, 0);
  }, []);

  const handleDragEnd = useCallback((e) => {
    if (e.target) e.target.style.opacity = '1';
    setDragOverIndex(null);
    dragIndexRef.current = null;
  }, []);

  const handleDragOver = useCallback((e, index) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDrop = useCallback((e, toIndex) => {
    e.preventDefault();
    const fromIndex = dragIndexRef.current;
    if (fromIndex !== null && fromIndex !== toIndex) {
      reorderQueue(fromIndex, toIndex);
    }
    setDragOverIndex(null);
  }, [reorderQueue]);

  // ── Played detection ───────────────────────────────────────────────────────
  const recentIds = new Set(recentlyPlayed.map((s) => s.id));
  const currentIdx = queue.findIndex((s) => s.id === currentSong?.id);

  if (!open) return null;

  return (
    <>
      <style>{`
        .qd-wrap {
          position: fixed; bottom: 80px; right: 16px;
          width: 300px; max-height: 420px;
          background: #1a1a1a; border: 1px solid #2d2d2d;
          border-radius: 14px; overflow: hidden;
          display: flex; flex-direction: column;
          z-index: 60; box-shadow: 0 16px 48px rgba(0,0,0,0.6);
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        }
        @media (max-width: 640px) {
          .qd-wrap { left: 8px; right: 8px; width: auto; bottom: 72px; }
        }

        .qd-header {
          padding: 14px 16px;
          border-bottom: 1px solid #2d2d2d;
          display: flex; justify-content: space-between; align-items: center;
          flex-shrink: 0;
        }
        .qd-title { color: #fff; font-size: 14px; font-weight: 600; }
        .qd-mode-badge {
          font-size: 9px; font-weight: 700; letter-spacing: 0.4px;
          padding: 2px 6px; border-radius: 4px; margin-left: 6px;
        }
        .qd-mode-classic { background: rgba(251,191,36,0.15); color: #fbbf24; border: 1px solid rgba(251,191,36,0.25); }
        .qd-mode-smart   { background: rgba(139,92,246,0.15); color: #a78bfa; border: 1px solid rgba(139,92,246,0.25); }

        .qd-close {
          background: none; border: none; color: #6b7280;
          cursor: pointer; padding: 4px; display: flex;
          border-radius: 4px; transition: color 0.15s;
        }
        .qd-close:hover { color: #fff; }

        .qd-list {
          overflow-y: auto; flex: 1;
          scrollbar-width: thin; scrollbar-color: #2d2d2d transparent;
        }
        .qd-empty {
          color: #6b7280; font-size: 13px;
          text-align: center; padding: 32px 16px;
        }

        .qd-item {
          display: flex; align-items: center; gap: 10px;
          padding: 9px 14px;
          border-bottom: 1px solid #1f1f1f;
          cursor: grab; user-select: none;
          transition: background 0.12s;
          position: relative;
        }
        .qd-item:hover          { background: rgba(255,255,255,0.04); }
        .qd-item.is-current     { background: rgba(34,197,94,0.07); }
        .qd-item.is-played      { opacity: 0.45; }
        .qd-item.drag-over      { border-top: 2px solid #22c55e; }
        .qd-item:active         { cursor: grabbing; }

        .qd-drag-handle {
          color: #3d3d3d; flex-shrink: 0;
          display: flex; align-items: center;
          transition: color 0.15s;
        }
        .qd-item:hover .qd-drag-handle { color: #6b7280; }

        .qd-cover {
          width: 34px; height: 34px; border-radius: 6px;
          object-fit: cover; flex-shrink: 0; background: #111;
        }

        .qd-info { flex: 1; min-width: 0; }
        .qd-song-title {
          font-size: 12px; font-weight: 600;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
        }
        .qd-song-artist {
          font-size: 11px; color: #6b7280;
          white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
          margin-top: 1px;
        }

        .qd-status {
          font-size: 9px; font-weight: 700; letter-spacing: 0.3px;
          padding: 1px 5px; border-radius: 3px; flex-shrink: 0;
        }
        .qd-status-playing { background: rgba(34,197,94,0.15); color: #22c55e; border: 1px solid rgba(34,197,94,0.25); }
        .qd-status-played  { background: rgba(107,114,128,0.12); color: #4b5563; border: 1px solid rgba(107,114,128,0.2); }

        .qd-remove {
          background: none; border: none; color: #3d3d3d;
          cursor: pointer; padding: 4px; display: flex;
          border-radius: 4px; flex-shrink: 0;
          transition: color 0.15s;
        }
        .qd-remove:hover { color: #ef4444; }
        .qd-item:hover .qd-remove { color: #4b5563; }
      `}</style>

      <div className="qd-wrap">
        {/* Header */}
        <div className="qd-header">
          <div style={{ display: 'flex', alignItems: 'center' }}>
            <span className="qd-title">Queue ({queue.length})</span>
            {shuffleMode === 'classic' && (
              <span className="qd-mode-badge qd-mode-classic">Vinyl Roll</span>
            )}
            {shuffleMode === 'smart' && (
              <span className="qd-mode-badge qd-mode-smart">Smart</span>
            )}
          </div>
          <button className="qd-close" onClick={onClose} title="Close queue">
            <XIcon />
          </button>
        </div>

        {/* List */}
        <div className="qd-list">
          {queue.length === 0 && (
            <p className="qd-empty">Queue is empty</p>
          )}

          {queue.map((song, index) => {
            const isCurrent = song.id === currentSong?.id;
            const isPlayed  = !isCurrent && recentIds.has(song.id) && index < currentIdx;
            const isDragOver = dragOverIndex === index;

            return (
              <div
                key={song.id + index}
                className={[
                  'qd-item',
                  isCurrent  ? 'is-current' : '',
                  isPlayed   ? 'is-played'  : '',
                  isDragOver ? 'drag-over'  : '',
                ].join(' ').trim()}
                draggable
                onDragStart={(e) => handleDragStart(e, index)}
                onDragEnd={handleDragEnd}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                onClick={() => !isCurrent && playSong(song)}
                title={isCurrent ? 'Now playing' : 'Click to play'}
              >
                {/* Drag handle */}
                <span className="qd-drag-handle" onClick={(e) => e.stopPropagation()}>
                  <DragIcon />
                </span>

                {/* Cover */}
                <img
                  src={song.coverUrl}
                  alt=""
                  className="qd-cover"
                  onError={(e) => {
                    e.target.src = 'https://placehold.co/34x34/111/555?text=♪';
                  }}
                />

                {/* Info */}
                <div className="qd-info">
                  <p
                    className="qd-song-title"
                    style={{ color: isCurrent ? '#22c55e' : '#fff' }}
                  >
                    {song.title}
                  </p>
                  <p className="qd-song-artist">{song.artist}</p>
                </div>

                {/* Status badge */}
                {isCurrent && (
                  <span className="qd-status qd-status-playing">NOW</span>
                )}
                {isPlayed && (
                  <span className="qd-status qd-status-played">PLAYED</span>
                )}

                {/* Remove */}
                <button
                  className="qd-remove"
                  onClick={(e) => { e.stopPropagation(); removeFromQueue(song.id); }}
                  title="Remove from queue"
                >
                  <XIcon size={13} />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
};

// ── Icons ──────────────────────────────────────────────────────────────────────
const XIcon = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const DragIcon = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="9"  cy="5"  r="1.5" />
    <circle cx="15" cy="5"  r="1.5" />
    <circle cx="9"  cy="12" r="1.5" />
    <circle cx="15" cy="12" r="1.5" />
    <circle cx="9"  cy="19" r="1.5" />
    <circle cx="15" cy="19" r="1.5" />
  </svg>
);

export default QueueDrawer;