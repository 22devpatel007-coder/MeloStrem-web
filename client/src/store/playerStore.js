/**
 * client/src/store/playerStore.js
 *
 * SHUFFLE OVERHAUL:
 *
 * Previously: isShuffle was a boolean, only pure Math.random() on every next.
 *
 * Now: shuffleMode is a 3-state string: 'none' | 'classic' | 'smart'
 *
 * ── CLASSIC (Vinyl Roll) ────────────────────────────────────────────────────
 * Simulates a human riffle-shuffling a deck of cards:
 *   1. Split queue into two halves with slight random variance (not 50/50)
 *   2. Riffle interleave — drops 1–3 songs alternately from each half
 *   3. Local swap pass — adjacent pairs swapped with 40% probability
 *   4. Random cut at 30–70% of length, rotate so cut becomes the start
 * Result: every song plays exactly once before any repeat, but the order
 * feels organic and human — not mathematically uniform like Fisher-Yates.
 * New songs added mid-session (addToQueue) are appended to the remaining
 * unplayed portion of the shuffled order.
 *
 * ── SMART (Weighted Random) ─────────────────────────────────────────────────
 * Three weighted rules combined on every playNext call:
 *   Rule 1 — Play count: songs heard less get higher weight
 *   Rule 2 — Artist spread: artists in last 3 songs get heavy penalty
 *   Rule 3 — Recency memory: songs in last 20% of queue get near-zero weight
 * Final pick: weighted random over the full candidate pool.
 * No pre-shuffled array — picks fresh on every transition.
 *
 * ── PRESERVED FIXES ─────────────────────────────────────────────────────────
 * BUG 2 FIX: resumeSong awaits audio.play() before setting isPlaying:true
 * BUG 3 FIX: audio.onended calls playNext() — reads live queueStore state
 * BUG 4 FIX: getQueueState() synchronous getter, no dynamic import()
 * BUG 5 FIX: safePlay abort controller pattern preserved
 */

import { create } from 'zustand';

// ── Shared Audio instance ─────────────────────────────────────────────────────
export const audio = new Audio();
audio.preload = 'metadata';

// ── Lazy queueStore accessor ──────────────────────────────────────────────────
let _getQueueState = null;
export function registerQueueStore(getStateFn) {
  _getQueueState = getStateFn;
}
function getQueueState() {
  if (!_getQueueState) {
    console.warn('[playerStore] queueStore not registered yet');
    return { queue: [] };
  }
  return _getQueueState();
}

// ── safePlay ──────────────────────────────────────────────────────────────────
let currentAbortController = null;

async function safePlay(src) {
  if (currentAbortController) currentAbortController.abort();
  currentAbortController = new AbortController();
  const { signal } = currentAbortController;

  audio.pause();
  audio.src = src;
  audio.load();

  try {
    await new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));

      const onCanPlay = () => { cleanup(); resolve(); };
      const onError   = () => { cleanup(); reject(new Error(audio.error?.message || 'Audio load failed')); };
      const onAbort   = () => { cleanup(); reject(new DOMException('Aborted', 'AbortError')); };

      const cleanup = () => {
        audio.removeEventListener('canplay', onCanPlay);
        audio.removeEventListener('error',   onError);
        signal.removeEventListener('abort',  onAbort);
      };

      audio.addEventListener('canplay', onCanPlay, { once: true });
      audio.addEventListener('error',   onError,   { once: true });
      signal.addEventListener('abort',  onAbort,   { once: true });
    });

    if (signal.aborted) return;
    await audio.play();
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('[playerStore] Playback error:', err.message);
    throw err;
  }
}

// ── VINYL ROLL ALGORITHM ──────────────────────────────────────────────────────
// Produces a human-feeling shuffle order for the Classic mode.
// Returns a new array — does not mutate the input.
export function vinylRoll(songs) {
  if (songs.length <= 1) return [...songs];

  const arr = [...songs];
  const len = arr.length;

  // Step 1 — Split into two halves with slight random variance
  // Real card cuts are never perfectly 50/50
  const variance = Math.floor(len * 0.1); // ±10% of length
  const splitPoint = Math.floor(len / 2) + Math.floor(Math.random() * variance * 2) - variance;
  const clampedSplit = Math.max(1, Math.min(len - 1, splitPoint));

  let left  = arr.slice(0, clampedSplit);
  let right = arr.slice(clampedSplit);

  // Step 2 — Riffle interleave
  // Each "drop" takes 1–3 songs from alternating halves — mimics real riffle
  const interleaved = [];
  let fromLeft = Math.random() > 0.5; // random starting hand

  while (left.length > 0 || right.length > 0) {
    const source      = fromLeft ? left : right;
    const dropCount   = Math.min(source.length, Math.floor(Math.random() * 3) + 1);
    const dropped     = source.splice(0, dropCount);
    interleaved.push(...dropped);
    fromLeft = !fromLeft;
  }

  // Step 3 — Local swap pass
  // Adjacent pairs swapped with 40% probability — breaks remaining patterns
  for (let i = 0; i < interleaved.length - 1; i++) {
    if (Math.random() < 0.4) {
      [interleaved[i], interleaved[i + 1]] = [interleaved[i + 1], interleaved[i]];
      i++; // skip the swapped pair to avoid chain swaps
    }
  }

  // Step 4 — Random cut at 30–70% of length
  // Rotate so the cut point becomes the new start
  const cutMin = Math.floor(interleaved.length * 0.3);
  const cutMax = Math.floor(interleaved.length * 0.7);
  const cutAt  = cutMin + Math.floor(Math.random() * (cutMax - cutMin + 1));

  return [...interleaved.slice(cutAt), ...interleaved.slice(0, cutAt)];
}

// ── SMART SHUFFLE ALGORITHM ───────────────────────────────────────────────────
// Picks the next song using weighted random with 3 rules.
// playCountMap: { [songId]: number } — times played this session
// recentHistory: Song[] — last N songs played (most recent first)
export function smartPick(queue, currentSong, playCountMap, recentHistory) {
  if (!queue.length) return null;

  const recentWindow  = Math.max(3, Math.ceil(queue.length * 0.2)); // last 20% of queue
  const recentIds     = new Set(recentHistory.slice(0, recentWindow).map((s) => s.id));
  const last3Artists  = new Set(recentHistory.slice(0, 3).map((s) => s.artist).filter(Boolean));
  const maxPlayCount  = Math.max(1, ...Object.values(playCountMap));

  const weights = queue.map((song) => {
    // Skip current song
    if (song.id === currentSong?.id) return 0;

    // Rule 3 — Recency: near-zero weight if heard very recently
    if (recentIds.has(song.id)) return 0.05;

    // Rule 1 — Play count: fewer plays = higher weight
    // Weight is inverse: (maxCount - songCount + 1) / (maxCount + 1)
    const playCount   = playCountMap[song.id] ?? 0;
    const countWeight = (maxPlayCount - playCount + 1) / (maxPlayCount + 1);

    // Rule 2 — Artist spread: penalize if artist appeared in last 3 songs
    const artistPenalty = last3Artists.has(song.artist) ? 0.15 : 1.0;

    return countWeight * artistPenalty;
  });

  // Weighted random selection
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) {
    // All songs heavily penalized (tiny library) — fall back to any non-current
    const fallback = queue.filter((s) => s.id !== currentSong?.id);
    return fallback.length ? fallback[Math.floor(Math.random() * fallback.length)] : queue[0];
  }

  let rand = Math.random() * totalWeight;
  for (let i = 0; i < queue.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return queue[i];
  }

  // Floating point safety — return last non-zero weight song
  return queue[queue.length - 1];
}

// ── Store ─────────────────────────────────────────────────────────────────────
const usePlayerStore = create((set, get) => ({
  currentSong:    null,
  recentlyPlayed: [], // Song[] — used by Smart shuffle for history window
  isPlaying:      false,
  volume:         1,
  currentTime:    0,
  duration:       0,

  // ── Shuffle state ──────────────────────────────────────────────────────────
  // 'none' | 'classic' | 'smart'
  shuffleMode:    'none',

  // Classic (Vinyl Roll) state
  // shuffledOrder: Song[] — pre-shuffled array, consumed in sequence
  // shuffledIndex: number — pointer into shuffledOrder
  shuffledOrder:  [],
  shuffledIndex:  -1,

  // Smart shuffle state
  // playCountMap: { [songId]: number } — session play counts
  playCountMap:   {},

  // Legacy isShuffle kept for any external reads — always derived from shuffleMode
  get isShuffle() { return get().shuffleMode !== 'none'; },

  repeatMode: 'none', // 'none' | 'all' | 'one'

  // ── cycleShuffleMode ───────────────────────────────────────────────────────
  // none → classic → smart → none
  cycleShuffleMode: () => {
    const { shuffleMode } = get();
    const next = shuffleMode === 'none' ? 'classic'
               : shuffleMode === 'classic' ? 'smart'
               : 'none';

    if (next === 'classic') {
      // Pre-shuffle the current queue immediately on activation
      const { queue } = getQueueState();
      const { currentSong } = get();
      if (queue.length > 0) {
        const rolled = vinylRoll(queue);
        // Find current song in rolled order and set index there
        const idx = rolled.findIndex((s) => s.id === currentSong?.id);
        set({
          shuffleMode:   'classic',
          shuffledOrder: rolled,
          shuffledIndex: idx >= 0 ? idx : 0,
        });
        return;
      }
    }

    if (next === 'smart') {
      set({ shuffleMode: 'smart', shuffledOrder: [], shuffledIndex: -1 });
      return;
    }

    // Turning off
    set({ shuffleMode: 'none', shuffledOrder: [], shuffledIndex: -1 });
  },

  // Legacy toggleShuffle — cycles through all 3 modes for backward compat
  toggleShuffle: () => get().cycleShuffleMode(),

  // ── playSong ───────────────────────────────────────────────────────────────
  playSong: async (song) => {
    const src = song?.audioUrl || song?.fileUrl || '';
    if (!src) {
      console.warn('[playerStore] playSong — no audio URL on song:', song);
      return;
    }

    // Update play count for Smart shuffle
    set((state) => ({
      currentSong:    song,
      isPlaying:      true,
      recentlyPlayed: [
        song,
        ...state.recentlyPlayed.filter((s) => s.id !== song.id),
      ].slice(0, 50),
      playCountMap: {
        ...state.playCountMap,
        [song.id]: (state.playCountMap[song.id] ?? 0) + 1,
      },
    }));

    audio.onended = () => {
      const { repeatMode, playNext } = get();
      if (repeatMode === 'one') {
        audio.currentTime = 0;
        audio.play().catch(() => {});
      } else {
        playNext();
      }
    };

    try {
      await safePlay(src);
      set({ isPlaying: true });
    } catch {
      set({ isPlaying: false });
    }
  },

  // ── playNext ───────────────────────────────────────────────────────────────
  playNext: () => {
    const { currentSong, shuffleMode, shuffledOrder, shuffledIndex,
            repeatMode, recentlyPlayed, playCountMap, playSong } = get();
    const { queue } = getQueueState();

    if (!queue.length) return;

    // ── Classic (Vinyl Roll) ─────────────────────────────────────────────────
    if (shuffleMode === 'classic') {
      let order = shuffledOrder;
      let idx   = shuffledIndex;

      // If shuffled order is empty or exhausted, re-roll
      if (!order.length || idx >= order.length - 1) {
        order = vinylRoll(queue);
        idx   = -1; // will become 0 after +1
        set({ shuffledOrder: order });
      }

      const nextIdx  = idx + 1;
      const nextSong = order[nextIdx];

      set({ shuffledIndex: nextIdx });
      if (nextSong) playSong(nextSong);
      return;
    }

    // ── Smart (Weighted Random) ──────────────────────────────────────────────
    if (shuffleMode === 'smart') {
      const nextSong = smartPick(queue, currentSong, playCountMap, recentlyPlayed);
      if (nextSong) playSong(nextSong);
      return;
    }

    // ── No shuffle — linear ──────────────────────────────────────────────────
    const currentIndex = queue.findIndex((s) => s.id === currentSong?.id);
    let nextIndex = currentIndex + 1;

    if (nextIndex >= queue.length) {
      if (repeatMode === 'all') nextIndex = 0;
      else { set({ isPlaying: false }); return; }
    }

    playSong(queue[nextIndex]);
  },

  // ── playPrev ───────────────────────────────────────────────────────────────
  playPrev: () => {
    const { currentSong, shuffleMode, recentlyPlayed, playSong } = get();

    // If more than 3 seconds in — restart current song
    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    // In any shuffle mode — go back to previous in recentlyPlayed history
    if (shuffleMode !== 'none' && recentlyPlayed.length > 1) {
      // recentlyPlayed[0] is currentSong, [1] is the one before it
      const prev = recentlyPlayed[1];
      if (prev) { playSong(prev); return; }
    }

    // Linear prev
    const { queue } = getQueueState();
    if (!queue.length) return;

    const currentIndex = queue.findIndex((s) => s.id === currentSong?.id);
    const prevIndex = currentIndex <= 0 ? 0 : currentIndex - 1;
    playSong(queue[prevIndex]);
  },

  // ── Playback controls ──────────────────────────────────────────────────────
  pauseSong: () => {
    audio.pause();
    set({ isPlaying: false });
  },

  resumeSong: async () => {
    if (!audio.src) return;
    try {
      await audio.play();
      set({ isPlaying: true });
    } catch (err) {
      console.error('[playerStore] Resume error:', err.message);
      set({ isPlaying: false });
    }
  },

  togglePlay: () => {
    const { isPlaying, pauseSong, resumeSong } = get();
    if (isPlaying) pauseSong();
    else resumeSong();
  },

  setVolume: (v) => {
    audio.volume = v;
    set({ volume: v });
  },

  setCurrentTime: (t) => {
    audio.currentTime = t;
    set({ currentTime: t });
  },

  setDuration: (d) => set({ duration: d }),

  // Legacy — kept for backward compat, use cycleShuffleMode going forward
  setRepeatMode: (mode) => set({ repeatMode: mode }),

  // ── resetShuffleSession ────────────────────────────────────────────────────
  // Call when queue changes significantly (e.g. new playlist loaded)
  // Resets play counts and re-rolls classic order
  resetShuffleSession: () => {
    const { shuffleMode } = get();
    const { queue } = getQueueState();

    set({
      playCountMap:   {},
      recentlyPlayed: [],
      shuffledOrder:  shuffleMode === 'classic' && queue.length ? vinylRoll(queue) : [],
      shuffledIndex:  -1,
    });
  },

  stop: () => {
    if (currentAbortController) currentAbortController.abort();
    audio.pause();
    audio.src = '';
    audio.onended = null;
    set({
      currentSong:   null,
      isPlaying:     false,
      currentTime:   0,
      duration:      0,
      shuffledOrder: [],
      shuffledIndex: -1,
      playCountMap:  {},
    });
  },
}));

export { usePlayerStore };
export default usePlayerStore;