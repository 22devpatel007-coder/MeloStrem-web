/**
 * client/src/components/player/FullScreenPlayer.jsx
 *
 * Full-screen player overlay.
 * - Mobile/Tablet: slides up from bottom, swipe-down to dismiss
 * - Desktop: centered large modal overlay
 * - Solid dark background (#0f0f0f)
 * - Shows: large art, title, artist, like, progress, controls, volume, queue, options (...)
 *
 * Props:
 *   isOpen:  boolean
 *   onClose: () => void
 */

import { useRef, useEffect, useState, useCallback, memo } from 'react';
import { usePlayerStore, audio } from '../../store/playerStore';
import LikeButton from './LikeButton';
import PlayerControls from './PlayerControls';
import OptionsSheet from './OptionsSheet';

const FullScreenPlayer = memo(({ isOpen, onClose }) => {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const volume      = usePlayerStore((s) => s.volume);
  const setVolume   = usePlayerStore((s) => s.setVolume);

  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking,  setSeeking]  = useState(false);
  const [showOptions, setShowOptions] = useState(false);
  const [visible, setVisible]   = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  // Swipe-to-dismiss on mobile
  const touchStartY = useRef(null);
  const sheetRef    = useRef(null);

  // BUG 5 FIX: CSS --pct via ref
  const seekRef   = useRef(null);
  const volumeRef = useRef(null);

  // Mount/unmount with animation
  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      requestAnimationFrame(() => requestAnimationFrame(() => setAnimateIn(true)));
    } else {
      setAnimateIn(false);
      setShowOptions(false);
      const t = setTimeout(() => setVisible(false), 350);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  // Audio progress
  useEffect(() => {
    const update = () => {
      if (!seeking) setProgress(audio.currentTime);
      setDuration(audio.duration || 0);
    };
    audio.addEventListener('timeupdate', update);
    audio.addEventListener('loadedmetadata', update);
    return () => {
      audio.removeEventListener('timeupdate', update);
      audio.removeEventListener('loadedmetadata', update);
    };
  }, [seeking]);

  useEffect(() => {
    const pct = duration ? (progress / duration) * 100 : 0;
    seekRef.current?.style.setProperty('--pct', `${pct}%`);
  }, [progress, duration]);

  useEffect(() => {
    volumeRef.current?.style.setProperty('--pct', `${volume * 100}%`);
  }, [volume]);

  const handleSeekStart  = useCallback(() => setSeeking(true), []);
  const handleSeekChange = useCallback((e) => setProgress(Number(e.target.value)), []);
  const handleSeekEnd    = useCallback((e) => {
    audio.currentTime = Number(e.target.value);
    setSeeking(false);
  }, []);
  const handleVolume = useCallback((e) => {
    const v = Number(e.target.value);
    audio.volume = v;
    setVolume(v);
  }, [setVolume]);

  // Swipe-to-dismiss
  const onTouchStart = useCallback((e) => {
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const onTouchMove = useCallback((e) => {
    if (touchStartY.current === null) return;
    const delta = e.touches[0].clientY - touchStartY.current;
    if (delta > 0 && sheetRef.current) {
      sheetRef.current.style.transform = `translateY(${delta}px)`;
    }
  }, []);

  const onTouchEnd = useCallback((e) => {
    if (touchStartY.current === null) return;
    const delta = e.changedTouches[0].clientY - touchStartY.current;
    touchStartY.current = null;
    if (sheetRef.current) sheetRef.current.style.transform = '';
    if (delta > 80) onClose();
  }, [onClose]);

  const fmt = (t) => {
    if (!t || isNaN(t)) return '0:00';
    return `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, '0')}`;
  };

  if (!visible || !currentSong) return null;

  return (
    <>
      <style>{`
        .fs-range {
          -webkit-appearance: none; appearance: none;
          height: 4px; border-radius: 2px; outline: none; cursor: pointer; width: 100%;
          background: linear-gradient(to right, #22c55e var(--pct, 0%), #2d2d2d var(--pct, 0%));
        }
        .fs-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 14px; height: 14px; border-radius: 50%;
          background: #fff; margin-top: -5px;
          box-shadow: 0 1px 6px rgba(0,0,0,0.6);
          transition: transform 0.15s;
        }
        .fs-range:hover::-webkit-slider-thumb { transform: scale(1.3); }
        .fs-range::-moz-range-thumb {
          width: 14px; height: 14px; border-radius: 50%;
          background: #fff; border: none;
        }
        .fs-range::-moz-range-progress { height: 4px; background: #22c55e; border-radius: 2px; }
        .fs-range::-moz-range-track    { height: 4px; background: #2d2d2d; border-radius: 2px; }

        /* Desktop: centered modal */
        @media (min-width: 1024px) {
          .fs-sheet {
            border-radius: 20px !important;
            max-width: 440px !important;
            width: 440px !important;
            max-height: 90vh !important;
            bottom: auto !important;
            top: 50% !important;
            left: 50% !important;
            transform: translate(-50%, ${animateIn ? '-50%' : '-40%'}) !important;
          }
        }
        /* Mobile / tablet: full screen slide-up */
        @media (max-width: 1023px) {
          .fs-sheet {
            border-radius: 20px 20px 0 0 !important;
            width: 100% !important;
            max-width: 100% !important;
            bottom: 0 !important;
            left: 0 !important;
            right: 0 !important;
          }
        }
      `}</style>

      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:   'fixed',
          inset:      0,
          background: `rgba(0,0,0,${animateIn ? 0.75 : 0})`,
          transition: 'background 0.35s',
          zIndex:     150,
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fs-sheet"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{
          position:        'fixed',
          background:      '#0f0f0f',
          zIndex:          151,
          display:         'flex',
          flexDirection:   'column',
          overflow:        'hidden',
          transition:      'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
          // Mobile default transform (overridden by media query CSS for desktop)
          transform:       animateIn ? 'translateY(0)' : 'translateY(100%)',
          fontFamily:      "'Inter', -apple-system, sans-serif",
          paddingBottom:   'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Drag handle (mobile) */}
        <div style={{
          width: 36, height: 4, background: '#2d2d2d',
          borderRadius: 2, margin: '14px auto 0', flexShrink: 0,
        }} />

        {/* Header */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'space-between',
          padding:        '12px 20px 0',
          flexShrink:     0,
        }}>
          <button onClick={onClose} style={btnStyle} title="Close">
            <ChevronDownIcon />
          </button>
          <div style={{ textAlign: 'center', flex: 1, minWidth: 0 }}>
            <p style={{ color: '#6b7280', fontSize: 11, letterSpacing: '0.08em', textTransform: 'uppercase', margin: 0 }}>
              Now Playing
            </p>
          </div>
          <button onClick={() => setShowOptions(true)} style={btnStyle} title="More options">
            <DotsIcon />
          </button>
        </div>

        {/* Album art */}
        <div style={{ padding: '24px 32px 20px', flexShrink: 0 }}>
          <img
            src={currentSong.coverUrl}
            alt={currentSong.title}
            style={{
              width:        '100%',
              aspectRatio:  '1 / 1',
              borderRadius: 16,
              objectFit:    'cover',
              background:   '#1a1a1a',
              display:      'block',
              boxShadow:    '0 16px 48px rgba(0,0,0,0.6)',
            }}
            onError={(e) => { e.target.src = 'https://placehold.co/400x400/111/333?text=♪'; }}
          />
        </div>

        {/* Song info + like */}
        <div style={{
          display:        'flex',
          alignItems:     'center',
          padding:        '0 28px',
          gap:            12,
          flexShrink:     0,
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{
              color: '#fff', fontSize: 20, fontWeight: 700, margin: 0,
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              {currentSong.title}
            </p>
            <p style={{ color: '#9ca3af', fontSize: 14, margin: '4px 0 0' }}>
              {currentSong.artist}
            </p>
          </div>
          <LikeButton song={currentSong} size="lg" />
        </div>

        {/* Progress */}
        <div style={{ padding: '20px 28px 4px', flexShrink: 0 }}>
          <input
            ref={seekRef}
            type="range"
            className="fs-range"
            min="0"
            max={duration || 0}
            value={progress}
            step="0.1"
            onMouseDown={handleSeekStart}
            onTouchStart={handleSeekStart}
            onChange={handleSeekChange}
            onMouseUp={handleSeekEnd}
            onTouchEnd={handleSeekEnd}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
            <span style={{ color: '#6b7280', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{fmt(progress)}</span>
            <span style={{ color: '#6b7280', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>{fmt(duration)}</span>
          </div>
        </div>

        {/* Transport controls */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '12px 28px', flexShrink: 0 }}>
          <PlayerControls size="lg" showShuffle showRepeat />
        </div>

        {/* Volume */}
        <div style={{
          display:     'flex',
          alignItems:  'center',
          gap:         10,
          padding:     '4px 32px 24px',
          flexShrink:  0,
        }}>
          <VolumeMinIcon />
          <input
            ref={volumeRef}
            type="range"
            className="fs-range"
            min="0" max="1" step="0.01"
            value={volume}
            onChange={handleVolume}
          />
          <VolumeMaxIcon />
        </div>
      </div>

      {/* Options sheet on top */}
      <OptionsSheet
        song={currentSong}
        isOpen={showOptions}
        onClose={() => setShowOptions(false)}
      />
    </>
  );
});

FullScreenPlayer.displayName = 'FullScreenPlayer';

// ── Shared button style ────────────────────────────────────────────────────────
const btnStyle = {
  width: 38, height: 38,
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  background: 'none', border: 'none', cursor: 'pointer',
  color: '#9ca3af', borderRadius: 8, flexShrink: 0,
  transition: 'color 0.15s',
};

// ── Icons ──────────────────────────────────────────────────────────────────────
const ChevronDownIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
const DotsIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
    <circle cx="12" cy="5" r="1.5" /><circle cx="12" cy="12" r="1.5" /><circle cx="12" cy="19" r="1.5" />
  </svg>
);
const VolumeMinIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#6b7280">
    <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
  </svg>
);
const VolumeMaxIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#6b7280">
    <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
  </svg>
);

export default FullScreenPlayer;