/**
 * client/src/store/playerStore.js
 *
 * PLAYBACK CONTEXT + HYBRID RECOMMENDATION (Option D):
 *
 * New concepts added:
 *
 * ── playbackContext ──────────────────────────────────────────────────────────
 *   { type: 'library' | 'playlist' | 'liked' | 'dynamic', id: string | null, songs: Song[] }
 *   Set when the user initiates playback from any surface.
 *   All shuffle algorithms operate only on context.songs — not the global library.
 *
 * ── affinityMap ──────────────────────────────────────────────────────────────
 *   { [key: string]: number }  where key = `artist::${artist}` or `genre::${genre}`
 *   Updated on every manual pick. Decays over time (older picks count less).
 *   Used by Smart shuffle + Dynamic queue candidate scoring.
 *
 * ── dynamicPool ──────────────────────────────────────────────────────────────
 *   Song[] — live candidate list for the dynamic context.
 *   Scored and sorted on every pick using Phase 1 (similarity) + Phase 2 (affinity).
 *   Classic shuffle is DISABLED when context type is 'dynamic'.
 *
 * ── sessionLog ───────────────────────────────────────────────────────────────
 *   Array of pick events batched and sent to POST /api/users/:uid/session-picks.
 *   Fire-and-forget — never blocks playback.
 *
 * ── setPlaybackContext(type, id, songs) ──────────────────────────────────────
 *   Called by PlaylistDetail, Home, LikedSongs when user hits Play/Shuffle.
 *   Resets shuffle session and seeds queue through queueStore.
 *
 * ── logPick(song, previousSong) ──────────────────────────────────────────────
 *   Records pick to sessionLog + updates affinityMap.
 *   Flushes log to server after every 5 picks (batched, non-blocking).
 *
 * PRESERVED FIXES:
 *   BUG 2 FIX: resumeSong awaits audio.play() before setting isPlaying:true
 *   BUG 3 FIX: audio.onended calls playNext() — reads live queueStore state
 *   BUG 4 FIX: getQueueState() synchronous getter, no dynamic import()
 *   BUG 5 FIX: safePlay abort controller pattern preserved
 *
 * SHUFFLE RULES:
 *   Context 'library' | 'playlist' | 'liked' → Classic ✅  Smart ✅
 *   Context 'dynamic'                         → Classic ❌  Smart ✅ (forced)
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
export function vinylRoll(songs) {
  if (songs.length <= 1) return [...songs];

  const arr = [...songs];
  const len = arr.length;

  const variance    = Math.floor(len * 0.1);
  const splitPoint  = Math.floor(len / 2) + Math.floor(Math.random() * variance * 2) - variance;
  const clampedSplit = Math.max(1, Math.min(len - 1, splitPoint));

  let left  = arr.slice(0, clampedSplit);
  let right = arr.slice(clampedSplit);

  const interleaved = [];
  let fromLeft = Math.random() > 0.5;

  while (left.length > 0 || right.length > 0) {
    const source    = fromLeft ? left : right;
    const dropCount = Math.min(source.length, Math.floor(Math.random() * 3) + 1);
    interleaved.push(...source.splice(0, dropCount));
    fromLeft = !fromLeft;
  }

  for (let i = 0; i < interleaved.length - 1; i++) {
    if (Math.random() < 0.4) {
      [interleaved[i], interleaved[i + 1]] = [interleaved[i + 1], interleaved[i]];
      i++;
    }
  }

  const cutMin = Math.floor(interleaved.length * 0.3);
  const cutMax = Math.floor(interleaved.length * 0.7);
  const cutAt  = cutMin + Math.floor(Math.random() * (cutMax - cutMin + 1));

  return [...interleaved.slice(cutAt), ...interleaved.slice(0, cutAt)];
}

// ── SMART SHUFFLE ALGORITHM ───────────────────────────────────────────────────
export function smartPick(queue, currentSong, playCountMap, recentHistory) {
  if (!queue.length) return null;

  const recentWindow = Math.max(3, Math.ceil(queue.length * 0.2));
  const recentIds    = new Set(recentHistory.slice(0, recentWindow).map((s) => s.id));
  const last3Artists = new Set(recentHistory.slice(0, 3).map((s) => s.artist).filter(Boolean));
  const maxPlayCount = Math.max(1, ...Object.values(playCountMap));

  const weights = queue.map((song) => {
    if (song.id === currentSong?.id) return 0;
    if (recentIds.has(song.id)) return 0.05;

    const playCount   = playCountMap[song.id] ?? 0;
    const countWeight = (maxPlayCount - playCount + 1) / (maxPlayCount + 1);
    const artistPenalty = last3Artists.has(song.artist) ? 0.15 : 1.0;

    return countWeight * artistPenalty;
  });

  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  if (totalWeight === 0) {
    const fallback = queue.filter((s) => s.id !== currentSong?.id);
    return fallback.length ? fallback[Math.floor(Math.random() * fallback.length)] : queue[0];
  }

  let rand = Math.random() * totalWeight;
  for (let i = 0; i < queue.length; i++) {
    rand -= weights[i];
    if (rand <= 0) return queue[i];
  }

  return queue[queue.length - 1];
}

// ── AFFINITY HELPERS ──────────────────────────────────────────────────────────
// Decay factor: each pick contributes less than the previous over time.
// New pick weight = 1.0, then decays by multiplying existing weights by 0.85.
const AFFINITY_DECAY = 0.85;
const AFFINITY_INCREMENT = 1.0;

function updateAffinityMap(prevMap, song) {
  // Decay all existing weights first
  const decayed = {};
  for (const [key, val] of Object.entries(prevMap)) {
    const next = val * AFFINITY_DECAY;
    if (next > 0.01) decayed[key] = next; // prune near-zero weights
  }

  // Increment for this song's artist and genre
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
// Phase 1: similarity to seed song (artist/genre match).
// Phase 2: affinity map scoring.
// Returns songs sorted by combined score descending.
function scoreDynamicPool(candidates, currentSong, affinityMap, recentHistory) {
  if (!candidates.length) return [];

  const recentIds    = new Set(recentHistory.slice(0, 10).map((s) => s.id));
  const last3Artists = new Set(recentHistory.slice(0, 3).map((s) => s.artist).filter(Boolean));

  return candidates
    .filter((s) => s.id !== currentSong?.id)
    .map((song) => {
      // Phase 1 — similarity to current song
      let similarityScore = 0;
      if (currentSong) {
        if (song.artist === currentSong.artist) similarityScore += 2;
        if (song.genre  === currentSong.genre)  similarityScore += 1;
      }

      // Phase 2 — affinity map
      let affinityScore = 0;
      if (song.artist) affinityScore += affinityMap[`artist::${song.artist}`] ?? 0;
      if (song.genre)  affinityScore += affinityMap[`genre::${song.genre}`]   ?? 0;

      // Penalties
      const recentPenalty  = recentIds.has(song.id) ? 0.1 : 1.0;
      const artistPenalty  = last3Artists.has(song.artist) ? 0.3 : 1.0;

      const totalScore = (similarityScore + affinityScore) * recentPenalty * artistPenalty;

      return { song, score: totalScore };
    })
    .sort((a, b) => b.score - a.score)
    .map((entry) => entry.song);
}

// ── SESSION LOG FLUSH ─────────────────────────────────────────────────────────
// Batched, fire-and-forget. Never blocks playback.
// Requires uid from authStore — imported lazily to avoid circular dep.
const FLUSH_EVERY = 5;

async function flushSessionLog(log, uid) {
  if (!log.length || !uid) return;
  try {
    // Dynamic import to avoid circular dependency with authStore
    const { default: api } = await import('../services/api');
    await api.post(`/users/${uid}/session-picks`, { picks: log });
  } catch (err) {
    // Non-blocking — log but never surface to user
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

  // ── Shuffle state ──────────────────────────────────────────────────────────
  shuffleMode:   'none', // 'none' | 'classic' | 'smart'
  shuffledOrder: [],
  shuffledIndex: -1,
  playCountMap:  {},
  get isShuffle() { return get().shuffleMode !== 'none'; },

  repeatMode: 'none', // 'none' | 'all' | 'one'

  // ── Playback context ───────────────────────────────────────────────────────
  // type: 'library' | 'playlist' | 'liked' | 'dynamic'
  // id:   playlist ID or null for library/liked/dynamic
  // songs: Song[] — the pool for this context (shuffled only within this pool)
  playbackContext: {
    type:  'library',
    id:    null,
    songs: [],
  },

  // ── Affinity map ───────────────────────────────────────────────────────────
  // { [key: string]: number } — persists across context switches within session
  affinityMap: {},

  // ── Dynamic pool ───────────────────────────────────────────────────────────
  // Scored candidate list — only populated when context type === 'dynamic'
  dynamicPool: [],

  // ── Session log ────────────────────────────────────────────────────────────
  // Pick events queued for server-side co-occurrence data collection
  sessionLog: [],

  // ── setPlaybackContext ─────────────────────────────────────────────────────
  // Called by PlaylistDetail / Home / LikedSongs when user initiates playback.
  // Seeds the queue through queueStore after setting context.
  //
  // type: 'library' | 'playlist' | 'liked' | 'dynamic'
  // id:   playlist ID or null
  // songs: full Song[] for this context
  // startIndex: which song to start from (default 0)
  setPlaybackContext: (type, id, songs, startIndex = 0) => {
    if (!Array.isArray(songs) || songs.length === 0) return;

    const safeIdx = Math.max(0, Math.min(startIndex, songs.length - 1));

    // In dynamic context, Classic shuffle is not allowed — force Smart if Classic is active
    const { shuffleMode } = get();
    let nextShuffleMode = shuffleMode;
    if (type === 'dynamic' && shuffleMode === 'classic') {
      nextShuffleMode = 'smart';
    }

    set({
      playbackContext:  { type, id, songs },
      shuffleMode:      nextShuffleMode,
      shuffledOrder:    [],
      shuffledIndex:    -1,
      playCountMap:     {},
      recentlyPlayed:   [],
      dynamicPool:      type === 'dynamic' ? [...songs] : [],
    });

    // Seed the queue store with this context's songs
    // Import lazily to avoid circular dependency
    import('./queueStore').then(({ default: useQueueStore }) => {
      useQueueStore.getState().setQueueFromContext(songs, safeIdx, type);
    }).catch((err) => {
      console.error('[playerStore] setPlaybackContext — queueStore import failed:', err.message);
    });
  },

  // ── cycleShuffleMode ───────────────────────────────────────────────────────
  // none → classic → smart → none
  // Classic is skipped when context is 'dynamic'
  cycleShuffleMode: () => {
    const { shuffleMode, playbackContext } = get();
    const isDynamic = playbackContext.type === 'dynamic';

    let next;
    if (shuffleMode === 'none') {
      // Dynamic context skips Classic
      next = isDynamic ? 'smart' : 'classic';
    } else if (shuffleMode === 'classic') {
      next = 'smart';
    } else {
      next = 'none';
    }

    if (next === 'classic') {
      const { queue } = getQueueState();
      const pool = queue.length > 0 ? queue : get().playbackContext.songs;
      const { currentSong } = get();
      if (pool.length > 0) {
        const rolled = vinylRoll(pool);
        const idx    = rolled.findIndex((s) => s.id === currentSong?.id);
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

    set({ shuffleMode: 'none', shuffledOrder: [], shuffledIndex: -1 });
  },

  toggleShuffle: () => get().cycleShuffleMode(),

  // ── logPick ────────────────────────────────────────────────────────────────
  // Records a manual song pick for affinity + server-side co-occurrence logging.
  // previousSong: the song that was playing before this pick.
  // uid: current user ID (from authStore — caller must pass it in).
  logPick: (song, previousSong, uid) => {
    if (!song) return;

    const newEntry = {
      songId:         song.id,
      previousSongId: previousSong?.id ?? null,
      contextType:    get().playbackContext.type,
      contextId:      get().playbackContext.id,
      ts:             Date.now(),
    };

    // Update affinity map with decay
    const newAffinityMap = updateAffinityMap(get().affinityMap, song);

    // Update dynamic pool scoring when in dynamic context
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

    // Flush to server every FLUSH_EVERY picks — fire-and-forget
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
  // Routes through Static path (library/playlist/liked) or Dynamic path.
  playNext: () => {
    const {
      currentSong, shuffleMode, shuffledOrder, shuffledIndex,
      repeatMode, recentlyPlayed, playCountMap, playSong,
      playbackContext, dynamicPool,
    } = get();

    const { queue } = getQueueState();

    // Dynamic context — Smart pick from scored dynamicPool
    if (playbackContext.type === 'dynamic') {
      const pool = dynamicPool.length > 0 ? dynamicPool : (
        playbackContext.songs.length > 0 ? playbackContext.songs : queue
      );
      const nextSong = smartPick(pool, currentSong, playCountMap, recentlyPlayed);
      if (nextSong) playSong(nextSong);
      return;
    }

    // Use context songs as the authoritative pool for shuffling
    // Fall back to queue if context is not set
    const pool = playbackContext.songs.length > 0 ? playbackContext.songs : queue;
    if (!pool.length) return;

    // ── Classic (Vinyl Roll) ─────────────────────────────────────────────────
    if (shuffleMode === 'classic') {
      let order = shuffledOrder;
      let idx   = shuffledIndex;

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
    audio.src = '';
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