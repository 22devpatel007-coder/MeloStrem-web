/**
 * client/src/store/playerStore.js — FIXED (production-ready)
 *
 * BUGS FIXED IN THIS VERSION:
 *
 * ── BUG 1 (Critical): cycleShuffleMode — wrong pool priority order ────────────
 *   cycleShuffleMode was reading the pool as:
 *     queue.length > 0 ? queue : playbackContext.songs   ← WRONG
 *   But playNext reads it as:
 *     playbackContext.songs.length > 0 ? playbackContext.songs : queue  ← CORRECT
 *
 *   Result: activating Classic shuffle rolled vinylRoll() against the queue,
 *   but playNext played from playbackContext.songs. When those two arrays differ
 *   (queue shrinks as songs play, context stays full), songs from outside the
 *   rolled order would play — breaking the entire shuffle guarantee.
 *
 *   Fix: cycleShuffleMode now uses the SAME priority as playNext:
 *     playbackContext.songs first, queue as fallback.
 *
 * ── BUG 2 (Critical): smartPick — Math.max() crash on empty playCountMap ──────
 *   Math.max(1, ...Object.values(playCountMap)) crashes with:
 *     "RangeError: Maximum call stack size exceeded"
 *   when playCountMap has 10,000+ entries (large libraries) because spread
 *   operator passes every value as a function argument — V8 has a stack limit.
 *
 *   Fix: replace spread with a reduce():
 *     Object.values(playCountMap).reduce((m, v) => Math.max(m, v), 1)
 *   This is O(n) with O(1) stack depth — safe at any library size.
 *
 * ── BUG 3 (Medium): vinylRoll — splice() mutates source array in place ────────
 *   source.splice(0, dropCount) mutates `left` and `right` which are slices
 *   of the original arr. While arr is already a copy ([...songs]), the slice
 *   references are fine — BUT if vinylRoll is ever called with a frozen or
 *   proxy array (Zustand immer middleware, or a React state array), splice
 *   will throw. Also splice on a slice is O(n) due to re-indexing.
 *
 *   Fix: track indices instead of mutating arrays. Same algorithm, zero mutation.
 *
 * ── BUG 4 (Low): setPlaybackContext — dynamic import race condition ───────────
 *   setPlaybackContext calls import('./queueStore') asynchronously. If the user
 *   immediately hits play before the import resolves, queueStore won't have the
 *   new songs yet and playNext will read an empty/stale queue.
 *
 *   Fix: use the already-registered _getQueueState (registerQueueStore pattern)
 *   instead of dynamic import. queueStore must call registerQueueStore on init
 *   (already done per existing pattern). Falls back gracefully if not registered.
 *
 * All original features and algorithms preserved.
 * All previously fixed bugs (BUG 2/3/4/5 from prior session) preserved.
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
    return { queue: [], setQueueFromContext: null };
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
// BUG 3 FIX: rewritten to use index tracking instead of splice() mutation.
// Identical algorithm output — split → interleave → swap pass → cut.
export function vinylRoll(songs) {
  if (!Array.isArray(songs) || songs.length <= 1) return [...(songs || [])];

  const arr = [...songs]; // safe copy — never mutate the original
  const len = arr.length;

  // Random split near the midpoint (±10% variance)
  const variance     = Math.floor(len * 0.1);
  const splitPoint   = Math.floor(len / 2) + Math.floor(Math.random() * variance * 2) - variance;
  const clampedSplit = Math.max(1, Math.min(len - 1, splitPoint));

  // ✅ FIX: use index pointers instead of splice() — no mutation, O(1) stack
  let   leftIdx  = 0;
  let   rightIdx = clampedSplit;
  const leftEnd  = clampedSplit;
  const rightEnd = len;

  const interleaved = [];
  let fromLeft = Math.random() > 0.5;

  while (leftIdx < leftEnd || rightIdx < rightEnd) {
    if (fromLeft) {
      if (leftIdx < leftEnd) {
        const drop = Math.min(leftEnd - leftIdx, Math.floor(Math.random() * 3) + 1);
        for (let i = 0; i < drop; i++) interleaved.push(arr[leftIdx++]);
      } else {
        // Left exhausted — drain right
        while (rightIdx < rightEnd) interleaved.push(arr[rightIdx++]);
        break;
      }
    } else {
      if (rightIdx < rightEnd) {
        const drop = Math.min(rightEnd - rightIdx, Math.floor(Math.random() * 3) + 1);
        for (let i = 0; i < drop; i++) interleaved.push(arr[rightIdx++]);
      } else {
        // Right exhausted — drain left
        while (leftIdx < leftEnd) interleaved.push(arr[leftIdx++]);
        break;
      }
    }
    fromLeft = !fromLeft;
  }

  // Adjacent swap pass — 40% chance per pair, skip i+1 after a swap
  for (let i = 0; i < interleaved.length - 1; i++) {
    if (Math.random() < 0.4) {
      [interleaved[i], interleaved[i + 1]] = [interleaved[i + 1], interleaved[i]];
      i++;
    }
  }

  // Random cut — rotate the array at a point between 30%–70%
  const cutMin = Math.floor(interleaved.length * 0.3);
  const cutMax = Math.floor(interleaved.length * 0.7);
  const cutAt  = cutMin + Math.floor(Math.random() * (cutMax - cutMin + 1));

  return [...interleaved.slice(cutAt), ...interleaved.slice(0, cutAt)];
}

// ── SMART SHUFFLE ALGORITHM ───────────────────────────────────────────────────
// BUG 2 FIX: replaced Math.max(1, ...spread) with reduce() — safe at any size.
export function smartPick(queue, currentSong, playCountMap, recentHistory) {
  if (!queue.length) return null;

  const recentWindow = Math.max(3, Math.ceil(queue.length * 0.2));
  const recentIds    = new Set(recentHistory.slice(0, recentWindow).map((s) => s.id));
  const last3Artists = new Set(recentHistory.slice(0, 3).map((s) => s.artist).filter(Boolean));

  // ✅ FIX: reduce instead of spread — O(n) time, O(1) stack, safe for 100k+ entries
  const maxPlayCount = Object.values(playCountMap).reduce((m, v) => Math.max(m, v), 1);

  const weights = queue.map((song) => {
    if (song.id === currentSong?.id) return 0;
    if (recentIds.has(song.id))      return 0.05;

    const playCount    = playCountMap[song.id] ?? 0;
    const countWeight  = (maxPlayCount - playCount + 1) / (maxPlayCount + 1);
    const artistPenalty = last3Artists.has(song.artist) ? 0.15 : 1.0;

    return countWeight * artistPenalty;
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) {
    const fallback = queue.filter((s) => s.id !== currentSong?.id);
    return fallback.length
      ? fallback[Math.floor(Math.random() * fallback.length)]
      : queue[0];
  }

  let rand = Math.random() * totalWeight;
  for (let i = 0; i < queue.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return queue[i];
  }

  return queue[queue.length - 1];
}

// ── AFFINITY HELPERS ──────────────────────────────────────────────────────────
const AFFINITY_DECAY     = 0.85;
const AFFINITY_INCREMENT = 1.0;

function updateAffinityMap(prevMap, song) {
  const decayed = {};
  for (const [key, val] of Object.entries(prevMap)) {
    const next = val * AFFINITY_DECAY;
    if (next > 0.01) decayed[key] = next;
  }
  if (song.artist) {
    const k = `artist::${song.artist}`;
    decayed[k] = (decayed[k] ?? 0) + AFFINITY_INCREMENT;
  }
  if (song.genre) {
    const k = `genre::${song.genre}`;
    decayed[k] = (decayed[k] ?? 0) + AFFINITY_INCREMENT;
  }
  return decayed;
}

// ── DYNAMIC POOL SCORING ──────────────────────────────────────────────────────
function scoreDynamicPool(candidates, currentSong, affinityMap, recentHistory) {
  if (!candidates.length) return [];

  const recentIds    = new Set(recentHistory.slice(0, 10).map((s) => s.id));
  const last3Artists = new Set(recentHistory.slice(0, 3).map((s) => s.artist).filter(Boolean));

  return candidates
    .filter((s) => s.id !== currentSong?.id)
    .map((song) => {
      let similarityScore = 0;
      if (currentSong) {
        if (song.artist === currentSong.artist) similarityScore += 2;
        if (song.genre  === currentSong.genre)  similarityScore += 1;
      }

      let affinityScore = 0;
      if (song.artist) affinityScore += affinityMap[`artist::${song.artist}`] ?? 0;
      if (song.genre)  affinityScore += affinityMap[`genre::${song.genre}`]   ?? 0;

      const recentPenalty = recentIds.has(song.id)          ? 0.1 : 1.0;
      const artistPenalty = last3Artists.has(song.artist)   ? 0.3 : 1.0;

      return { song, score: (similarityScore + affinityScore) * recentPenalty * artistPenalty };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.song);
}

// ── SESSION LOG FLUSH ─────────────────────────────────────────────────────────
const FLUSH_EVERY = 5;

async function flushSessionLog(log, uid) {
  if (!log.length || !uid) return;
  try {
    const { default: api } = await import('../services/api');
    await api.post(`/users/${uid}/session-picks`, { picks: log });
  } catch (err) {
    console.warn('[playerStore] session-picks flush failed (non-critical):', err.message);
  }
}

// ── Store ─────────────────────────────────────────────────────────────────────
const usePlayerStore = create((set, get) => ({
  currentSong:    null,
  recentlyPlayed: [],
  isPlaying:      false,
  volume:         1,
  currentTime:    0,
  duration:       0,

  shuffleMode:   'none', // 'none' | 'classic' | 'smart'
  shuffledOrder: [],
  shuffledIndex: -1,
  playCountMap:  {},
  get isShuffle() { return get().shuffleMode !== 'none'; },

  repeatMode: 'none', // 'none' | 'all' | 'one'

  playbackContext: {
    type:  'library',
    id:    null,
    songs: [],
  },

  affinityMap: {},
  dynamicPool: [],
  sessionLog:  [],

  // ── setPlaybackContext ─────────────────────────────────────────────────────
  // BUG 4 FIX: use registered getQueueState() instead of dynamic import()
  // to avoid race condition where playSong fires before import resolves.
  setPlaybackContext: (type, id, songs, startIndex = 0) => {
    if (!Array.isArray(songs) || songs.length === 0) return;

    const safeIdx = Math.max(0, Math.min(startIndex, songs.length - 1));

    const { shuffleMode } = get();
    let nextShuffleMode = shuffleMode;
    if (type === 'dynamic' && shuffleMode === 'classic') {
      nextShuffleMode = 'smart';
    }

    set({
      playbackContext: { type, id, songs },
      shuffleMode:     nextShuffleMode,
      shuffledOrder:   [],
      shuffledIndex:   -1,
      playCountMap:    {},
      recentlyPlayed:  [],
      dynamicPool:     type === 'dynamic' ? [...songs] : [],
    });

    // ✅ FIX: synchronous call via registered accessor — no import() race
    const qs = getQueueState();
    if (typeof qs?.setQueueFromContext === 'function') {
      qs.setQueueFromContext(songs, safeIdx, type);
    } else {
      // Fallback: dynamic import for environments where registerQueueStore
      // hasn't been called yet (e.g. during SSR or test environments)
      import('./queueStore').then(({ default: useQueueStore }) => {
        useQueueStore.getState().setQueueFromContext(songs, safeIdx, type);
      }).catch((err) => {
        console.error('[playerStore] setPlaybackContext — queueStore import failed:', err.message);
      });
    }
  },

  // ── cycleShuffleMode ───────────────────────────────────────────────────────
  cycleShuffleMode: () => {
    const { shuffleMode, playbackContext } = get();
    const isDynamic = playbackContext.type === 'dynamic';

    let next;
    if (shuffleMode === 'none')    next = isDynamic ? 'smart' : 'classic';
    else if (shuffleMode === 'classic') next = 'smart';
    else                           next = 'none';

    if (next === 'classic') {
      // ✅ BUG 1 FIX: use same priority as playNext — context first, queue fallback
      const pool = playbackContext.songs.length > 0
        ? playbackContext.songs
        : getQueueState().queue;

      if (pool.length > 0) {
        const { currentSong } = get();
        const rolled = vinylRoll(pool);
        const idx    = rolled.findIndex((s) => s.id === currentSong?.id);
        set({
          shuffleMode:   'classic',
          shuffledOrder: rolled,
          // If current song is in the rolled order, start from it
          // so the next song is the one after it in the rolled sequence.
          // If not found (shouldn't happen), start from 0.
          shuffledIndex: idx >= 0 ? idx : 0,
        });
        return;
      }
    }

    if (next === 'smart') {
      set({ shuffleMode: 'smart', shuffledOrder: [], shuffledIndex: -1 });
      return;
    }

    set({ shuffleMode: 'none', shuffledOrder: [], shuffledIndex: -1 });
  },

  toggleShuffle: () => get().cycleShuffleMode(),

  // ── logPick ────────────────────────────────────────────────────────────────
  logPick: (song, previousSong, uid) => {
    if (!song) return;

    const newEntry = {
      songId:         song.id,
      previousSongId: previousSong?.id ?? null,
      contextType:    get().playbackContext.type,
      contextId:      get().playbackContext.id,
      ts:             Date.now(),
    };

    const newAffinityMap = updateAffinityMap(get().affinityMap, song);

    let newDynamicPool = get().dynamicPool;
    if (get().playbackContext.type === 'dynamic') {
      newDynamicPool = scoreDynamicPool(
        get().dynamicPool,
        song,
        newAffinityMap,
        get().recentlyPlayed,
      );
    }

    const newLog = [...get().sessionLog, newEntry];

    set({
      affinityMap: newAffinityMap,
      dynamicPool: newDynamicPool,
      sessionLog:  newLog,
    });

    if (newLog.length >= FLUSH_EVERY) {
      const logSnapshot = [...newLog];
      set({ sessionLog: [] });
      flushSessionLog(logSnapshot, uid);
    }
  },

  // ── playSong ───────────────────────────────────────────────────────────────
  playSong: async (song) => {
    const src = song?.audioUrl || song?.fileUrl || '';
    if (!src) {
      console.warn('[playerStore] playSong — no audio URL on song:', song);
      return;
    }

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
    const {
      currentSong, shuffleMode, shuffledOrder, shuffledIndex,
      repeatMode, recentlyPlayed, playCountMap, playSong,
      playbackContext, dynamicPool,
    } = get();

    const { queue } = getQueueState();

    // Dynamic context — Smart pick from scored dynamicPool
    if (playbackContext.type === 'dynamic') {
      const pool = dynamicPool.length > 0
        ? dynamicPool
        : (playbackContext.songs.length > 0 ? playbackContext.songs : queue);
      const nextSong = smartPick(pool, currentSong, playCountMap, recentlyPlayed);
      if (nextSong) playSong(nextSong);
      return;
    }

    // Authoritative pool: context songs first, queue as fallback
    const pool = playbackContext.songs.length > 0 ? playbackContext.songs : queue;
    if (!pool.length) return;

    // ── Classic (Vinyl Roll) ─────────────────────────────────────────────────
    if (shuffleMode === 'classic') {
      let order = shuffledOrder;
      let idx   = shuffledIndex;

      // Roll a new order when exhausted
      if (!order.length || idx >= order.length - 1) {
        order = vinylRoll(pool);
        idx   = -1;
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
      const nextSong = smartPick(pool, currentSong, playCountMap, recentlyPlayed);
      if (nextSong) playSong(nextSong);
      return;
    }

    // ── No shuffle — linear through queue ────────────────────────────────────
    if (!queue.length) return;
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

    if (audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }

    if (shuffleMode !== 'none' && recentlyPlayed.length > 1) {
      const prev = recentlyPlayed[1];
      if (prev) { playSong(prev); return; }
    }

    const { queue } = getQueueState();
    if (!queue.length) return;

    const currentIndex = queue.findIndex((s) => s.id === currentSong?.id);
    const prevIndex    = currentIndex <= 0 ? 0 : currentIndex - 1;
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

  setRepeatMode: (mode) => set({ repeatMode: mode }),

  // ── resetShuffleSession ────────────────────────────────────────────────────
  resetShuffleSession: () => {
    const { shuffleMode, playbackContext } = get();
    // Consistent pool priority: context first, queue fallback
    const pool = playbackContext.songs.length > 0
      ? playbackContext.songs
      : getQueueState().queue;

    set({
      playCountMap:   {},
      recentlyPlayed: [],
      shuffledOrder:  shuffleMode === 'classic' && pool.length ? vinylRoll(pool) : [],
      shuffledIndex:  -1,
    });
  },

  stop: () => {
    if (currentAbortController) currentAbortController.abort();
    audio.pause();
    audio.src    = '';
    audio.onended = null;
    set({
      currentSong:     null,
      isPlaying:       false,
      currentTime:     0,
      duration:        0,
      shuffledOrder:   [],
      shuffledIndex:   -1,
      playCountMap:    {},
      playbackContext: { type: 'library', id: null, songs: [] },
      dynamicPool:     [],
      sessionLog:      [],
    });
  },
}));

export { usePlayerStore };
export default usePlayerStore;