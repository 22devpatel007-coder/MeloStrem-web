
import { useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import useQueueStore from '../../store/queueStore';
import usePlayerStore from '../../store/playerStore';

// ── SongContextMenu ───────────────────────────────────────────────────────────
export const SongContextMenu = ({
  song,
  contextSongs,
  startIndex,
  onClose,
  onAddToPlaylist,
  onDelete,
  onLike,
}) => {
  const { isAdmin } = useAuth();
  const addToQueue         = useQueueStore((s) => s.addToQueue);
  const setPlaybackContext = usePlayerStore((s) => s.setPlaybackContext);

  // Always call onClose after an action so the parent closes the menu
  const close = useCallback(() => onClose?.(), [onClose]);

  // ── Play ──────────────────────────────────────────────────────────────────
  // Builds the correct pool and delegates to setPlaybackContext so that the
  // queue, shuffle, and repeat features all work correctly for the session.
  const handlePlay = useCallback(() => {
    const pool = Array.isArray(contextSongs) && contextSongs.length > 0
      ? contextSongs
      : [song];

    // Use provided startIndex if valid; otherwise locate song by id
    const resolvedIdx =
      typeof startIndex === 'number' && startIndex >= 0 && startIndex < pool.length
        ? startIndex
        : pool.findIndex((s) => s.id === song.id);

    const safeIdx = resolvedIdx >= 0 ? resolvedIdx : 0;

    // setPlaybackContext handles context state + queue seeding + playSong internally.
    // No double-play. No async race (BUG4-safe via registerQueueStore pattern).
    setPlaybackContext('library', null, pool, safeIdx);
    close();
  }, [song, contextSongs, startIndex, setPlaybackContext, close]);

  // ── Add to Queue ──────────────────────────────────────────────────────────
  const handleAddToQueue = useCallback(() => {
    addToQueue(song);
    close();
  }, [song, addToQueue, close]);

  // ── Add to Playlist ───────────────────────────────────────────────────────
  const handleAddToPlaylist = useCallback(() => {
    onAddToPlaylist?.(song);
    close();
  }, [song, onAddToPlaylist, close]);

  // ── Like ──────────────────────────────────────────────────────────────────
  const handleLike = useCallback(() => {
    onLike?.(song);
    close();
  }, [song, onLike, close]);

  // ── Delete (admin only) ───────────────────────────────────────────────────
  const handleDelete = useCallback(() => {
    onDelete?.(song);
    close();
  }, [song, onDelete, close]);

  return (
    <div
      className="absolute right-0 top-8 bg-[#1a1a1a] border border-white/10 rounded-xl shadow-2xl z-30 min-w-[160px] overflow-hidden py-1"
      // Prevent click-outside handlers on ancestors from firing when clicking inside menu
      onClick={(e) => e.stopPropagation()}
    >
      <MenuItem onClick={handlePlay}           label="Play"            icon={<PlayIcon />} />
      <MenuItem onClick={handleAddToQueue}     label="Add to Queue"    icon={<QueueIcon />} />
      <MenuItem onClick={handleAddToPlaylist}  label="Add to Playlist" icon={<PlaylistIcon />} />
      <MenuItem onClick={handleLike}           label="Like"            icon={<HeartIcon />} />

      {isAdmin && (
        <>
          <div className="h-px bg-white/10 my-1" />
          <MenuItem
            onClick={handleDelete}
            label="Delete"
            icon={<TrashIcon />}
            danger
          />
        </>
      )}
    </div>
  );
};

// ── MenuItem ──────────────────────────────────────────────────────────────────
const MenuItem = ({ onClick, label, icon, danger = false }) => (
  <button
    className={[
      'flex items-center gap-3 w-full text-left px-4 py-2.5 text-sm transition-colors duration-100',
      danger
        ? 'text-red-400 hover:bg-red-500/10 hover:text-red-300'
        : 'text-gray-200 hover:bg-white/[0.06] hover:text-white',
    ].join(' ')}
    onClick={onClick}
  >
    <span className="shrink-0 opacity-75">{icon}</span>
    {label}
  </button>
);

// ── Icons ─────────────────────────────────────────────────────────────────────
const PlayIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const QueueIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="8"  y1="6"  x2="21" y2="6"  />
    <line x1="8"  y1="12" x2="21" y2="12" />
    <line x1="8"  y1="18" x2="21" y2="18" />
    <line x1="3"  y1="6"  x2="3.01" y2="6"  />
    <line x1="3"  y1="12" x2="3.01" y2="12" />
    <line x1="3"  y1="18" x2="3.01" y2="18" />
  </svg>
);

const PlaylistIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3"  y1="6"  x2="21" y2="6"  />
    <line x1="3"  y1="12" x2="15" y2="12" />
    <line x1="3"  y1="18" x2="9"  y2="18" />
    <circle cx="19" cy="16" r="3" />
    <polyline points="22 10 19 10 19 13" />
  </svg>
);

const HeartIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

const TrashIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
);

export default SongContextMenu;