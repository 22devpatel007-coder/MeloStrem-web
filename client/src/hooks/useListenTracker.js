/**
 * client/src/hooks/useListenTracker.js
 *
 * Tracks music listen time and syncs to backend.
 * - Sends "start" when playback begins
 * - Sends "stop" with duration when playback stops, song changes,
 *   tab hides, or component unmounts
 * - Fire-and-forget: never blocks playback
 */

import { useEffect, useRef } from 'react';
import { usePlayerStore }    from '../store/playerStore';
import { useAuthStore }      from '../store/authStore';
import { updateListenSession } from '../services/users.service';

export function useListenTracker() {
  const isPlaying   = usePlayerStore((s) => s.isPlaying);
  const currentSong = usePlayerStore((s) => s.currentSong);
  const user        = useAuthStore((s) => s.user);

  const sessionStartRef = useRef(null); // Date.now() when play started
  const flushedRef      = useRef(false); // guard: prevent double-flush

  const flush = (uid) => {
    if (flushedRef.current) return;
    if (!sessionStartRef.current) return;
    const duration = Math.round((Date.now() - sessionStartRef.current) / 1000);
    sessionStartRef.current = null;
    flushedRef.current = true;
    if (duration < 5) return; // ignore accidental sub-5s plays
    updateListenSession(uid, 'stop', duration).catch(() => {}); // fire-and-forget
  };

  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;

    if (isPlaying && currentSong) {
      // New play session starting
      flushedRef.current  = false;
      sessionStartRef.current = Date.now();
      updateListenSession(uid, 'start').catch(() => {}); // fire-and-forget
    } else {
      // Paused or stopped — flush duration
      flush(uid);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, currentSong?.id, user?.uid]);

  // Flush on tab hide or page unload
  useEffect(() => {
    const uid = user?.uid;
    if (!uid) return;

    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush(uid);
    };
    const onBeforeUnload = () => flush(uid);

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      flush(uid); // unmount flush
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid]);
}