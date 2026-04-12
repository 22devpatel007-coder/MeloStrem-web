/**
 * client/src/components/player/LikeButton.jsx
 *
 * WHAT CHANGED:
 *  - Fires toast.success / toast.error on toggle via useToast()
 *  - Heart fill animation: scale pulse on state change
 *  - Always visible (no opacity-0 / hover gating — caller controls visibility)
 *  - size prop: 'sm' | 'md' | 'lg'  (unchanged API)
 *  - Optimistic update still lives in useLikedSongs — this component is UI only
 *
 * WHAT DID NOT CHANGE:
 *  - Props contract: { song, size, className }
 *  - useLikedSongs / useAuthStore wiring
 *  - HeartIcon SVG
 */

import { memo, useCallback, useRef } from 'react';
import { useLikedSongs } from '../../hooks/useLikedSongs';
import useAuthStore from '../../store/authStore';
import { useToast } from '../ui/Toast';

const LikeButton = memo(({ song, size = 'md', className = '' }) => {
  const user = useAuthStore((s) => s.user);
  const uid  = user?.uid;

  const { likedSongIds, toggleLike, isToggling } = useLikedSongs(uid);
  const { toast } = useToast();

  // Track previous liked state to show correct toast message
  const prevLikedRef = useRef(null);

  const isLiked = !!song && likedSongIds.includes(song.id);

  const handleClick = useCallback(
    async (e) => {
      e.stopPropagation();
      if (!uid || !song || isToggling) return;

      const wasLiked = likedSongIds.includes(song.id);
      prevLikedRef.current = wasLiked;

      try {
        await toggleLike(song.id);
        if (wasLiked) {
          toast.info('Removed from Liked Songs');
        } else {
          toast.success('Added to Liked Songs ♥');
        }
      } catch {
        toast.error('Something went wrong. Please try again.');
      }
    },
    [uid, song, toggleLike, isToggling, likedSongIds, toast],
  );

  const sizes = {
    sm: { btn: 32, icon: 14 },
    md: { btn: 36, icon: 16 },
    lg: { btn: 44, icon: 20 },
  };
  const { btn, icon } = sizes[size] ?? sizes.md;

  if (!uid) return null;

  return (
    <>
      <style>{LIKE_STYLES}</style>
      <button
        onClick={handleClick}
        disabled={isToggling}
        title={isLiked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
        aria-label={isLiked ? 'Remove from Liked Songs' : 'Add to Liked Songs'}
        aria-pressed={isLiked}
        className={[
          'like-btn',
          isLiked    ? 'like-btn--liked'    : '',
          isToggling ? 'like-btn--toggling' : '',
          className,
        ].join(' ').trim()}
        style={{ width: btn, height: btn }}
      >
        <HeartIcon size={icon} filled={isLiked} />
      </button>
    </>
  );
});

LikeButton.displayName = 'LikeButton';

// ── Heart SVG ─────────────────────────────────────────────────────────────────
const HeartIcon = ({ size, filled }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill={filled ? '#ef4444' : 'none'}
    stroke={filled ? '#ef4444' : 'currentColor'}
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className="like-btn__icon"
    aria-hidden="true"
  >
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

// ── Styles ────────────────────────────────────────────────────────────────────
const LIKE_STYLES = `
  .like-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    cursor: pointer;
    border-radius: 50%;
    flex-shrink: 0;
    padding: 0;
    color: #6b7280;
    transition: color 0.15s ease, background 0.15s ease, transform 0.15s ease;
  }

  .like-btn:hover:not(:disabled) {
    color: #9ca3af;
    background: rgba(255,255,255,0.07);
    transform: scale(1.1);
  }

  .like-btn--liked {
    color: #ef4444 !important;
    animation: like-pop 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .like-btn--liked:hover:not(:disabled) {
    color: #f87171 !important;
    background: rgba(239,68,68,0.1);
  }

  .like-btn--toggling {
    cursor: default;
    opacity: 0.5;
    pointer-events: none;
  }

  .like-btn__icon {
    transition: fill 0.2s ease, stroke 0.2s ease;
    pointer-events: none;
  }

  @keyframes like-pop {
    0%   { transform: scale(1); }
    40%  { transform: scale(1.35); }
    70%  { transform: scale(0.9); }
    100% { transform: scale(1); }
  }
`;

export default LikeButton;