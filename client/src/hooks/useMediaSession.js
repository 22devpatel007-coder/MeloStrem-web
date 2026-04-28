/**
 * client/src/hooks/useMediaSession.js
 *
 * Syncs playerStore state to the browser's Media Session API.
 *
 * What this unlocks:
 *   - Lock screen controls on Android and iOS (play, pause, next, prev)
 *   - OS notification media card on Android
 *   - macOS Control Center and Touch Bar
 *   - Windows system media overlay (Win + K)
 *   - Bluetooth headphone buttons
 *   - Earbud single/double/triple tap gestures
 *   - Accurate seek bar on the OS lock screen via setPositionState()
 *
 * Design decisions:
 *   - Single useEffect re-registers ALL handlers whenever currentSong changes.
 *     Some browsers (Chrome Android) silently clear handlers on track change,
 *     so re-registering on every song is the safe default.
 *   - setPositionState() is called on play, pause, and seek events via a
 *     separate effect that watches currentTime + isPlaying + duration.
 *     Without this, the OS lock screen shows no seek bar or wrong position.
 *   - All navigator.mediaSession calls are feature-guarded. Safari < 15,
 *     Firefox < 82, and some WebViews do not support the API — this hook
 *     gracefully does nothing on those environments.
 *   - Artwork is passed as an array of sizes. Cloudinary URLs support
 *     on-the-fly resizing via query params — we pass three sizes so the OS
 *     picks the best one for its display context.
 *   - No cleanup needed for action handlers — they are overwritten on each
 *     registration. setPositionState is a fire-and-forget call, not a listener.
 *
 * Dependencies: playerStore only. No new state, no new API calls.
 */

import { useEffect } from 'react';
import { usePlayerStore } from '../store/playerStore';

// ── Feature detection ─────────────────────────────────────────────────────────
const MEDIA_SESSION_SUPPORTED = typeof navigator !== 'undefined' && 'mediaSession' in navigator;

// ── Cloudinary artwork helper ─────────────────────────────────────────────────
//
// Cloudinary URLs look like:
//   https://res.cloudinary.com/<cloud>/image/upload/v.../filename.jpg
//
// We insert a size transformation before the version segment so the OS
// gets a correctly-sized image for its media card / lock screen.
//
// If the coverUrl is not a Cloudinary URL (or is absent), we fall back to
// the raw URL for all sizes — the OS will still work, just at one resolution.
//
function buildArtwork(coverUrl) {
  if (!coverUrl) return [];

  const SIZES = [96, 192, 512];

  const isCloudinary = coverUrl.includes('res.cloudinary.com');

  return SIZES.map((size) => {
    let src = coverUrl;

    if (isCloudinary) {
      // Insert w_N,h_N,c_fill transformation before /upload/
      // Original: .../upload/v123/song.jpg
      // Result:   .../upload/w_96,h_96,c_fill/v123/song.jpg
      src = coverUrl.replace('/upload/', `/upload/w_${size},h_${size},c_fill/`);
    }

    return {
      src,
      sizes: `${size}x${size}`,
      type:  'image/jpeg',
    };
  });
}

// ── useMediaSession ───────────────────────────────────────────────────────────

export function useMediaSession() {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const isPlaying   = usePlayerStore((s) => s.isPlaying);
  const currentTime = usePlayerStore((s) => s.currentTime);
  const duration    = usePlayerStore((s) => s.duration);

  // ── Effect 1: Metadata + action handlers ───────────────────────────────────
  //
  // Re-runs on every song change. Registers metadata and all action handlers.
  // Handlers read live store state via getState() — no stale closure risk.
  //
  useEffect(() => {
    if (!MEDIA_SESSION_SUPPORTED) return;

    // ── Metadata ─────────────────────────────────────────────────────────────
    if (currentSong) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({
          title:  currentSong.title  || 'Unknown Title',
          artist: currentSong.artist || 'Unknown Artist',
          album:  currentSong.album  || '',
          artwork: buildArtwork(currentSong.coverUrl || currentSong.coverImage || ''),
        });
      } catch (err) {
        // MediaMetadata constructor can throw in some WebViews
        console.warn('[useMediaSession] Failed to set metadata:', err.message);
      }
    } else {
      // No song — clear the media session
      // navigator.mediaSession.metadata = null;
      return; // No point registering handlers with no active song
    }

    // ── Action handlers ───────────────────────────────────────────────────────
    //
    // Each handler reads fresh state from the store via getState() so we never
    // close over stale values. This is critical for playNext/playPrev which
    // depend on the current queue position at the moment the button is pressed.
    //
    const store = () => usePlayerStore.getState();

    const handlers = {
      play:           () => store().resumeSong(),
      pause:          () => store().pauseSong(),
      stop:           () => store().stop(),
      nexttrack:      () => store().playNext(),
      previoustrack:  () => store().playPrev(),

      // seekto — fired when the user drags the OS lock screen seek bar
      seekto: (details) => {
        if (details?.seekTime != null) {
          store().setCurrentTime(details.seekTime);
        }
      },

      // seekbackward / seekforward — fired by some headphone long-press gestures
      // and the macOS Touch Bar. Default seek offset is 10s.
      seekbackward: (details) => {
        const offset = details?.seekOffset ?? 10;
        store().seekBy(-offset);
      },
      seekforward: (details) => {
        const offset = details?.seekOffset ?? 10;
        store().seekBy(offset);
      },
    };

    for (const [action, handler] of Object.entries(handlers)) {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch {
        // Some actions (seekto, seekbackward, seekforward) are not supported
        // in all browsers — silently skip unsupported ones.
      }
    }

    // No cleanup needed — handlers are overwritten on the next song change.
    // Setting them to null on cleanup would briefly disable controls between
    // songs, causing earbud button presses during that window to be ignored.
  }, [currentSong]);

  // ── Effect 2: playbackState + setPositionState ────────────────────────────
  //
  // Keeps the OS lock screen seek bar in sync with actual playback position.
  // Must be called:
  //   - When play/pause state changes (playbackState)
  //   - When currentTime changes (seek bar position)
  //   - When duration becomes available (seek bar range)
  //
  // Runs independently of Effect 1 so metadata re-registration doesn't
  // trigger unnecessary setPositionState calls.
  //
  useEffect(() => {
    if (!MEDIA_SESSION_SUPPORTED || !currentSong) return;

    // playbackState — tells the OS whether to show play or pause icon
    try {
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch {
      // Ignore — some environments don't support playbackState setter
    }

    // setPositionState — provides duration + position for the OS seek bar
    // Only call when duration is a valid positive finite number.
    // Calling with duration=0 or NaN throws a TypeError in some browsers.
    if (
      typeof navigator.mediaSession.setPositionState === 'function' &&
      Number.isFinite(duration) &&
      duration > 0 &&
      Number.isFinite(currentTime)
    ) {
      try {
        navigator.mediaSession.setPositionState({
          duration,
          playbackRate: 1,
          // Clamp position — some browsers throw if position > duration
          position: Math.min(currentTime, duration),
        });
      } catch (err) {
        // Non-fatal — position state is a UX enhancement, not critical
        console.warn('[useMediaSession] setPositionState failed:', err.message);
      }
    }
  }, [currentSong, isPlaying, currentTime, duration]);
}