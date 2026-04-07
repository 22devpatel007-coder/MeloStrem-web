/**
 * client/src/store/queueStore.js
 *
 * SHUFFLE OVERHAUL CHANGES:
 *
 * addToQueue — in Classic mode, new songs are appended to the REMAINING
 *   unplayed portion of shuffledOrder (after the current shuffledIndex).
 *   This means the user can add a song and it will play in the upcoming
 *   shuffled sequence rather than being ignored until the next re-roll.
 *
 * reorderQueue — new action for drag-and-drop manual reordering.
 *   Accepts fromIndex and toIndex, moves the song, and updates shuffledOrder
 *   and shuffledIndex in playerStore to stay consistent.
 *
 * setQueue — calls resetShuffleSession() when a new queue is loaded so
 *   play counts and shuffled order start fresh.
 *
 * PRESERVED FIXES:
 * BUG 4 FIX: registerQueueStore() pattern preserved — playerStore reads
 *   live queue state synchronously via the registered getter.
 */

import { create } from 'zustand';
import usePlayerStore, { registerQueueStore, vinylRoll } from './playerStore';

const useQueueStore = create((set, get) => ({
  queue:        [],
  currentIndex: 0,

  // ── setQueue ───────────────────────────────────────────────────────────────
  setQueue: (songs, startIndex = 0) => {
    if (!songs || songs.length === 0) return;

    const idx = Math.max(0, Math.min(startIndex, songs.length - 1));
    set({ queue: songs, currentIndex: idx });

    // Reset shuffle session — new queue means fresh play counts + re-roll
    usePlayerStore.getState().resetShuffleSession();
    usePlayerStore.getState().playSong(songs[idx]);
  },

  // ── addToQueue ─────────────────────────────────────────────────────────────
  // Appends song to queue.
  // In Classic mode: also inserts into the remaining (unplayed) portion of
  // shuffledOrder so it plays in the current shuffle cycle, not the next one.
  addToQueue: (song) => {
    if (!song) return;

    set((s) => ({ queue: [...s.queue, song] }));

    // Classic shuffle — splice into remaining unplayed shuffled positions
    const playerState = usePlayerStore.getState();
    if (playerState.shuffleMode === 'classic') {
      const { shuffledOrder, shuffledIndex } = playerState;

      if (shuffledOrder.length > 0) {
        // Insert at a random position after the current index
        const remaining = shuffledOrder.length - (shuffledIndex + 1);
        const insertAt  = shuffledIndex + 1 + Math.floor(Math.random() * (remaining + 1));

        const newOrder = [
          ...shuffledOrder.slice(0, insertAt),
          song,
          ...shuffledOrder.slice(insertAt),
        ];

        usePlayerStore.setState({ shuffledOrder: newOrder });
      } else {
        // No existing shuffled order yet — just append
        usePlayerStore.setState({ shuffledOrder: [song] });
      }
    }
  },

  // ── removeFromQueue ────────────────────────────────────────────────────────
  removeFromQueue: (songId) => {
    set((s) => ({
      queue: s.queue.filter((song) => song.id !== songId),
    }));

    // Also remove from Classic shuffled order if present
    const { shuffleMode, shuffledOrder, shuffledIndex } = usePlayerStore.getState();
    if (shuffleMode === 'classic' && shuffledOrder.length) {
      const removeIdx  = shuffledOrder.findIndex((s) => s.id === songId);
      if (removeIdx === -1) return;

      const newOrder = shuffledOrder.filter((s) => s.id !== songId);
      // Adjust pointer if removed song was before current position
      const newIdx   = removeIdx < shuffledIndex ? shuffledIndex - 1 : shuffledIndex;
      usePlayerStore.setState({ shuffledOrder: newOrder, shuffledIndex: Math.max(-1, newIdx) });
    }
  },

  // ── reorderQueue ───────────────────────────────────────────────────────────
  // Drag-and-drop reorder. Moves song from fromIndex to toIndex.
  // Also updates Classic shuffledOrder to stay consistent.
  reorderQueue: (fromIndex, toIndex) => {
    if (fromIndex === toIndex) return;

    set((s) => {
      const next = [...s.queue];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return { queue: next };
    });

    // Sync Classic shuffled order — treat manual reorder as overriding the
    // shuffle for the affected songs; splice the same move into shuffledOrder
    const { shuffleMode, shuffledOrder, shuffledIndex } = usePlayerStore.getState();
    if (shuffleMode === 'classic' && shuffledOrder.length) {
      const next = [...shuffledOrder];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);

      // Recalculate shuffledIndex after the move
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
  // These are direct index-based jumps (used by QueueDrawer click-to-play).
  // They bypass shuffle mode intentionally — clicking a song in the queue
  // plays it immediately regardless of shuffle.
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

// BUG 4 FIX: Register this store's getState with playerStore so
// playNext/playPrev can read live queue state synchronously.
registerQueueStore(useQueueStore.getState);

export { useQueueStore };
export default useQueueStore;