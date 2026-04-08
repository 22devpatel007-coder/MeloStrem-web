/**
 * client/src/components/player/PlayerControls.jsx
 *
 * Shared transport controls strip.
 * Used by both MiniPlayerBar and FullScreenPlayer.
 *
 * Props:
 *   size: 'sm' | 'md' | 'lg'  — scales icon/button sizes
 *   showShuffle: boolean        — hide on very small layouts
 *   showRepeat: boolean
 */

import { memo, useCallback } from 'react';
import { usePlayerStore } from '../../store/playerStore';

const PlayerControls = memo(({
  size        = 'md',
  showShuffle = true,
  showRepeat  = true,
}) => {
  const isPlaying      = usePlayerStore((s) => s.isPlaying);
  const repeatMode     = usePlayerStore((s) => s.repeatMode);
  const shuffleMode    = usePlayerStore((s) => s.shuffleMode);
  const pauseSong      = usePlayerStore((s) => s.pauseSong);
  const resumeSong     = usePlayerStore((s) => s.resumeSong);
  const playNext       = usePlayerStore((s) => s.playNext);
  const playPrev       = usePlayerStore((s) => s.playPrev);
  const setRepeatMode  = usePlayerStore((s) => s.setRepeatMode);
  const cycleShuffleMode = usePlayerStore((s) => s.cycleShuffleMode);

  const togglePlay = useCallback(
    () => (isPlaying ? pauseSong() : resumeSong()),
    [isPlaying, pauseSong, resumeSong],
  );

  const cycleRepeat = useCallback(() => {
    const modes = ['none', 'all', 'one'];
    setRepeatMode(modes[(modes.indexOf(repeatMode) + 1) % 3]);
  }, [repeatMode, setRepeatMode]);

  const iconSizes = { sm: 16, md: 20, lg: 24 };
  const playSize  = { sm: 36, md: 44, lg: 56 };
  const iconSz    = iconSizes[size] ?? 20;
  const playSz    = playSize[size] ?? 44;
  const ctrlSz    = iconSz + 12; // padding around ctrl buttons

  const shuffleColor =
    shuffleMode === 'classic' ? '#fbbf24' :
    shuffleMode === 'smart'   ? '#a78bfa' :
    '#6b7280';

  const repeatColor = repeatMode !== 'none' ? '#22c55e' : '#6b7280';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: size === 'lg' ? 16 : 8 }}>
      {/* Shuffle */}
      {showShuffle && (
        <CtrlBtn onClick={cycleShuffleMode} size={ctrlSz} color={shuffleColor} title={`Shuffle: ${shuffleMode}`}>
          <ShuffleIcon size={iconSz} mode={shuffleMode} />
        </CtrlBtn>
      )}

      {/* Prev */}
      <CtrlBtn onClick={playPrev} size={ctrlSz} color="#9ca3af" title="Previous">
        <PrevIcon size={iconSz} />
      </CtrlBtn>

      {/* Play / Pause */}
      <button
        onClick={togglePlay}
        title={isPlaying ? 'Pause' : 'Play'}
        style={{
          width:           playSz,
          height:          playSz,
          borderRadius:    '50%',
          background:      '#22c55e',
          border:          'none',
          cursor:          'pointer',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          flexShrink:      0,
          transition:      'background 0.15s, transform 0.15s',
          boxShadow:       '0 4px 16px rgba(34,197,94,0.35)',
        }}
        onMouseEnter={(e) => { e.currentTarget.style.background = '#16a34a'; e.currentTarget.style.transform = 'scale(1.06)'; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = '#22c55e'; e.currentTarget.style.transform = 'scale(1)'; }}
      >
        {isPlaying
          ? <PauseIcon size={size === 'lg' ? 22 : size === 'md' ? 18 : 14} />
          : <PlayIcon  size={size === 'lg' ? 22 : size === 'md' ? 18 : 14} />
        }
      </button>

      {/* Next */}
      <CtrlBtn onClick={playNext} size={ctrlSz} color="#9ca3af" title="Next">
        <NextIcon size={iconSz} />
      </CtrlBtn>

      {/* Repeat */}
      {showRepeat && (
        <CtrlBtn onClick={cycleRepeat} size={ctrlSz} color={repeatColor} title={`Repeat: ${repeatMode}`}>
          {repeatMode === 'one' ? <RepeatOneIcon size={iconSz} /> : <RepeatIcon size={iconSz} />}
        </CtrlBtn>
      )}
    </div>
  );
});

PlayerControls.displayName = 'PlayerControls';

// ── Ctrl Button ────────────────────────────────────────────────────────────────
const CtrlBtn = ({ onClick, size, color, title, children }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      width:           size,
      height:          size,
      display:         'flex',
      alignItems:      'center',
      justifyContent:  'center',
      background:      'none',
      border:          'none',
      cursor:          'pointer',
      color,
      borderRadius:    8,
      flexShrink:      0,
      transition:      'color 0.15s, transform 0.12s',
    }}
    onMouseEnter={(e) => { e.currentTarget.style.color = '#fff'; e.currentTarget.style.transform = 'scale(1.1)'; }}
    onMouseLeave={(e) => { e.currentTarget.style.color = color; e.currentTarget.style.transform = 'scale(1)'; }}
  >
    {children}
  </button>
);

// ── Icons ──────────────────────────────────────────────────────────────────────
const PlayIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#000">
    <path d="M8 5.14v14l11-7-11-7z" />
  </svg>
);
const PauseIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="#000">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);
const PrevIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
  </svg>
);
const NextIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 3.9V8.1L8.5 12zM16 6h2v12h-2z" />
  </svg>
);
const ShuffleIcon = ({ size, mode }) => {
  const sw = mode !== 'none' ? '2.2' : '2';
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}>
      <polyline points="16 3 21 3 21 8" />
      <line x1="4" y1="20" x2="21" y2="3" />
      <polyline points="21 16 21 21 16 21" />
      {mode === 'classic' ? (
        <line x1="4" y1="4" x2="21" y2="21" />
      ) : (
        <>
          <line x1="15" y1="15" x2="21" y2="21" />
          <line x1="4" y1="4" x2="9" y2="9" />
          {mode === 'smart' && <circle cx="4" cy="12" r="1.5" fill="currentColor" stroke="none" />}
        </>
      )}
    </svg>
  );
};
const RepeatIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);
const RepeatOneIcon = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="17 1 21 5 17 9" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <polyline points="7 23 3 19 7 15" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
    <line x1="12" y1="9" x2="12" y2="15" />
  </svg>
);

export default PlayerControls;