/**
 * client/src/components/player/LikeButton.jsx
 *
 * Isolated like button for the player.
 * - Pulls uid from authStore
 * - Uses useLikedSongs for optimistic toggle
 * - size prop: 'sm' | 'md' | 'lg'
 */

import { memo, useCallback } from 'react';
import { useLikedSongs } from '../../hooks/useLikedSongs';
import useAuthStore from '../../store/authStore';

const LikeButton = memo(({ song, size = 'md', className = '' }) => {
  const user = useAuthStore((s) => s.user);
  const uid  = user?.uid;

  const { likedSongIds, toggleLike, isToggling } = useLikedSongs(uid);

  const isLiked = !!song && likedSongIds.includes(song.id);

  const handleClick = useCallback(
    (e) => {
      e.stopPropagation();
      if (!uid || !song) return;
      toggleLike(song.id);
    },
    [uid, song, toggleLike],
  );

  const sizes = {
    sm: { btn: 28, icon: 14 },
    md: { btn: 34, icon: 18 },
    lg: { btn: 44, icon: 22 },
  };
  const { btn, icon } = sizes[size] ?? sizes.md;

  if (!uid) return null;

  return (
    <button
      onClick={handleClick}
      disabled={isToggling}
      title={isLiked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
      className={className}
      style={{
        width:           btn,
        height:          btn,
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        background:      'none',
        border:          'none',
        cursor:          isToggling ? 'default' : 'pointer',
        borderRadius:    '50%',
        flexShrink:      0,
        transition:      'transform 0.15s, opacity 0.15s',
        opacity:         isToggling ? 0.6 : 1,
        transform:       isLiked ? 'scale(1)' : 'scale(1)',
      }}
      onMouseEnter={(e) => { e.currentTarget.style.transform = 'scale(1.15)'; }}
      onMouseLeave={(e) => { e.currentTarget.style.transform = 'scale(1)'; }}
    >
      <HeartIcon size={icon} filled={isLiked} />
    </button>
  );
});

LikeButton.displayName = 'LikeButton';

// ── Heart SVG ──────────────────────────────────────────────────────────────────
const HeartIcon = ({ size, filled }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? '#ef4444' : 'none'}
    stroke={filled ? '#ef4444' : '#9ca3af'}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    style={{ transition: 'fill 0.2s, stroke 0.2s' }}
  >
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

export default LikeButton;