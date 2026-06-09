/**
 * client/src/hooks/usePlayTracker.js
 *
 * Tracks how long the current song has been listened to and fires a single
 * POST /api/plays/:songId request once the 30-second threshold is crossed.
 *
 * RULES:
 *   - Fires exactly ONCE per song per mount cycle (tracked via firedRef).
 *   - Resets automatically when currentSong.id changes.
 *   - Only counts time while the audio is actually playing (not paused/buffering).
 *   - Sends listenedSeconds (elapsed play time) and songDuration to the backend.
 *   - If the user is not authenticated, the call is silently skipped.
 *   - Network failures are caught and logged — never throw to the UI.
 *   - Uses a 1-second polling interval (not audio timeupdate events) to avoid
 *     tying this hook to a ref on the HTMLAudioElement.
 *
 * USAGE:
 *   Mount once inside a component that has access to playerStore — e.g. MusicPlayer.
 *   No props required. Hook reads everything it needs from the stores.
 *
 *   import { usePlayTracker } from '../hooks/usePlayTracker';
 *   // inside MusicPlayer or App:
 *   usePlayTracker();
 *
 * BACKEND CONTRACT:
 *   POST /api/plays/:songId
 *   Headers: Authorization: Bearer <idToken>   (set by axios interceptor)
 *   Body:    { listenedSeconds: number, songDuration: number | null }
 *   Success: { success: true }
 *   Errors:  { success: false, error: { message, code } }
 */

import { useEffect, useRef } from 'react';
import { usePlayerStore }    from '../store/playerStore';
import { useAuthStore }      from '../store/authStore';
import api                   from '../services/api';

const THRESHOLD_SECS  = 30;   // Must match MIN_LISTEN_SECS in plays.controller.js
const POLL_INTERVAL   = 1000; // 1 second tick — lightweight, no AudioElement coupling

export const usePlayTracker = () => {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const isPlaying   = usePlayerStore((s) => s.isPlaying);

  // listenedSeconds accumulated for the current song this mount cycle
  const listenedRef = useRef(0);
  // Whether we have already fired the play event for the current song
  const firedRef    = useRef(false);
  // The song ID we are currently tracking (detects song changes)
  const songIdRef   = useRef(null);
  // Interval handle
  const timerRef    = useRef(null);

  useEffect(() => {
    const song = currentSong;

    // ── Song changed — reset tracking state ────────────────────────────────
    if (!song || song.id !== songIdRef.current) {
      // Clear any running timer from the previous song
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      listenedRef.current = 0;
      firedRef.current    = false;
      songIdRef.current   = song?.id ?? null;
    }

    // Nothing to track if no song or already fired for this song
    if (!song || firedRef.current) return;

    // ── Start polling ──────────────────────────────────────────────────────
    // Only start a new interval if one isn't already running
    if (timerRef.current) return;

    timerRef.current = setInterval(() => {
      // Only accumulate time while actively playing
      if (!usePlayerStore.getState().isPlaying) return;

      listenedRef.current += 1;

      // Threshold crossed — fire once and stop the timer
      if (listenedRef.current >= THRESHOLD_SECS && !firedRef.current) {
        firedRef.current = true;
        clearInterval(timerRef.current);
        timerRef.current = null;

        // Fire-and-forget — never blocks playback
        const uid      = useAuthStore.getState().user?.uid;
        const duration = usePlayerStore.getState().currentSong?.duration ?? null;
        const sid      = usePlayerStore.getState().currentSong?.id;

        if (!uid || !sid) return; // unauthenticated or song disappeared

        api.post(`/plays/${sid}`, {
          listenedSeconds: listenedRef.current,
          songDuration:    duration,
        }).catch((err) => {
          // Non-fatal — playback continues regardless
          console.warn('[usePlayTracker] failed to record play:', err?.response?.data ?? err.message);
        });
      }
    }, POLL_INTERVAL);

    // ── Cleanup on unmount or song change ──────────────────────────────────
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [currentSong, isPlaying]); // re-run when song changes; isPlaying dep keeps closure fresh
};