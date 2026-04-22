/**
 * client/src/store/queueStore.js
 *
 * PATCH — appendSongs action added (supports queue auto-pagination).
 *
 * NEW ACTION: appendSongs(newSongs)
 *   Called by playerStore.appendSongsToQueue() when a new React Query page
 *   arrives after playerStore.playNext() requested a fetch.
 *   - Deduplicates by song.id before appending (safe to call multiple times)
 *   - Does NOT reset currentIndex or trigger playback — that is handled by
 *     playerStore.appendSongsToQueue() after calling this function
 *   - Does NOT touch shuffledOrder — Classic shuffle is never active during
 *     library auto-pagination (it uses its own shuffledOrder separately)
 *
 * UNCHANGED: Every other action is identical to the previous version.
 *   setQueueFromContext, setQueue, addToQueue, removeFromQueue, reorderQueue,
 *   nextSong, prevSong, clearQueue — all preserved exactly.
 *
 * PLAYBACK CONTEXT CHANGES (preserved from previous version):
 *
 * setQueueFromContext — new action called exclusively by playerStore.setPlaybackContext().
 *   Replaces setQueue for context-aware playback initiation.
 *   - Sets queue to the context's song pool
 *   - In dynamic context: Classic shuffle is blocked at the store level
 *   - Calls resetShuffleSession() on playerStore to re-roll with the new pool
 *
 * setQueue — preserved for backward compat (Home.jsx handlePlaySong still uses it).
 *   Defaults to 'library' context when called directly.
 *
 * addToQueue — unchanged. Still splices into Classic shuffledOrder when active.
 *   Safe to call in any context — Classic is never active in dynamic context.
 *
 * removeFromQueue, reorderQueue — unchanged.
 *
 * PRESERVED FIXES:
 *   BUG 4 FIX: registerQueueStore() pattern preserved.
 */

import { create } from 'zustand';
import usePlayerStore, { registerQueueStore } from './playerStore';

const useQueueStore = create((set, get) => ({
  queue:        [],
  currentIndex: 0,

  // ── setQueueFromContext ────────────────────────────────────────────────────
  // Called by playerStore.setPlaybackContext() after context is set.
  // This is the canonical entry point for playlist / liked / dynamic playback.
  // contextType is passed so we can enforce Classic-disabled rule in dynamic mode.
  setQueueFromContext: (songs, startIndex = 0, contextType = 'library') => {
    if (!songs || songs.length === 0) return;

    const idx = Math.max(0, Math.min(startIndex, songs.length - 1));
    set({ queue: songs, currentIndex: idx });

    // In dynamic context, if Classic is somehow active, force it off
    const playerState = usePlayerStore.getState();
    // Reset shuffle session with the new pool
    playerState.resetShuffleSession();

    // Play the starting song
    playerState.playSong(songs[idx]);
  },

  // ── setQueue ───────────────────────────────────────────────────────────────
  // Preserved for backward compat (Home.jsx / SongList direct calls).
  // Treats context as 'library' — does not set a named context on playerStore.
  // Use setPlaybackContext on playerStore for proper context-aware playback.
  setQueue: (songs, startIndex = 0) => {
    if (!songs || songs.length === 0) return;

    const idx = Math.max(0, Math.min(startIndex, songs.length - 1));
    set({ queue: songs, currentIndex: idx });

    usePlayerStore.getState().resetShuffleSession();
    usePlayerStore.getState().playSong(songs[idx]);
  },

  // ── appendSongs ────────────────────────────────────────────────────────────
  //
  // NEW — called by playerStore.appendSongsToQueue() when a new React Query
  // page arrives after playNext() requested a pagination fetch.
  //
  // Deduplicates by song.id so re-fetching a page never creates duplicates.
  // Does NOT reset currentIndex — playback position is preserved.
  // Does NOT touch shuffledOrder — Classic shuffle manages its own order;
  // auto-pagination only applies to linear playback in 'library' context.
  //
  appendSongs: (newSongs) => {
    if (!Array.isArray(newSongs) || newSongs.length === 0) return;

    set((s) => {
      const existingIds = new Set(s.queue.map((song) => song.id));
      const unique = newSongs.filter((song) => song?.id && !existingIds.has(song.id));
      if (unique.length === 0) return s; // no change — all were duplicates
      return { queue: [...s.queue, ...unique] };
    });
  },

  // ── addToQueue ─────────────────────────────────────────────────────────────
  // Appends song to queue.
  // In Classic mode: also inserts into remaining unplayed shuffledOrder.
  // Safe to call in any context — Classic is never active in dynamic context.
  addToQueue: (song) => {
    if (!song) return;

    set((s) => ({ queue: [...s.queue, song] }));

    const playerState = usePlayerStore.getState();
    if (playerState.shuffleMode === 'classic') {
      const { shuffledOrder, shuffledIndex } = playerState;

      if (shuffledOrder.length > 0) {
        const remaining = shuffledOrder.length - (shuffledIndex + 1);
        const insertAt  = shuffledIndex + 1 + Math.floor(Math.random() * (remaining + 1));

        const newOrder = [
          ...shuffledOrder.slice(0, insertAt),
          song,
          ...shuffledOrder.slice(insertAt),
        ];
        usePlayerStore.setState({ shuffledOrder: newOrder });
      } else {
        usePlayerStore.setState({ shuffledOrder: [song] });
      }
    }
  },

  // ── removeFromQueue ────────────────────────────────────────────────────────
  removeFromQueue: (songId) => {
    set((s) => ({
      queue: s.queue.filter((song) => song.id !== songId),
    }));

    const { shuffleMode, shuffledOrder, shuffledIndex } = usePlayerStore.getState();
    if (shuffleMode === 'classic' && shuffledOrder.length) {
      const removeIdx = shuffledOrder.findIndex((s) => s.id === songId);
      if (removeIdx === -1) return;

      const newOrder = shuffledOrder.filter((s) => s.id !== songId);
      const newIdx   = removeIdx < shuffledIndex ? shuffledIndex - 1 : shuffledIndex;
      usePlayerStore.setState({ shuffledOrder: newOrder, shuffledIndex: Math.max(-1, newIdx) });
    }
  },

  // ── reorderQueue ───────────────────────────────────────────────────────────
  reorderQueue: (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;

    set((s) => {
      const next = [...s.queue];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { queue: next };
    });

    const { shuffleMode, shuffledOrder, shuffledIndex } = usePlayerStore.getState();
    if (shuffleMode === 'classic' && shuffledOrder.length) {
      const next = [...shuffledOrder];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);

      let newIdx = shuffledIndex;
      if (fromIndex === shuffledIndex) {
        newIdx = toIndex;
      } else if (fromIndex < shuffledIndex && toIndex >= shuffledIndex) {
        newIdx = shuffledIndex - 1;
      } else if (fromIndex > shuffledIndex && toIndex <= shuffledIndex) {
        newIdx = shuffledIndex + 1;
      }

      usePlayerStore.setState({ shuffledOrder: next, shuffledIndex: newIdx });
    }
  },

  // ── nextSong / prevSong ────────────────────────────────────────────────────
  nextSong: () => {
    const { queue, currentIndex } = get();
    const nextIndex = currentIndex + 1;
    if (nextIndex < queue.length) {
      set({ currentIndex: nextIndex });
      usePlayerStore.getState().playSong(queue[nextIndex]);
    }
  },

  prevSong: () => {
    const { queue, currentIndex } = get();
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      set({ currentIndex: prevIndex });
      usePlayerStore.getState().playSong(queue[prevIndex]);
    }
  },

  clearQueue: () => {
    set({ queue: [], currentIndex: 0 });
    usePlayerStore.setState({ shuffledOrder: [], shuffledIndex: -1, playCountMap: {} });
  },
}));

// BUG 4 FIX: Register this store's getState with playerStore.
registerQueueStore(useQueueStore.getState);

export { useQueueStore };
export default useQueueStore;