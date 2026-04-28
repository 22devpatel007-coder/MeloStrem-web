import { create } from 'zustand';

// ── Shared Audio instance ─────────────────────────────────────────────────────
export const audio = new Audio();
audio.preload = 'metadata';

// NOTE: AudioContext intentionally removed.
//
// WHAT WAS WRONG:
//   The previous code called createMediaElementSource(audio) inside
//   unlockAudioContext(). That Web Audio API call permanently hijacks the
//   <audio> element's output pipeline — the element's default speaker output
//   is disconnected and all audio is rerouted through the AudioContext graph.
//   If the AudioContext was suspended (common on mobile before a gesture, or
//   after a tab loses focus), the graph produces silence. The HTMLMediaElement
//   continued decoding normally — timer moved, isPlaying was true — but zero
//   audio reached the speakers because the AudioContext graph wasn't running.
//
// WHY IT IS NOT NEEDED:
//   AudioContext unlock was a Safari/Android workaround from ~2017. Current
//   browser policy (Chrome 71+, Safari 13+, Firefox, all mobile browsers) only
//   requires that audio.play() is called from a user-gesture callstack. This
//   code already does that — the user clicks play → playSong() → safePlay() →
//   audio.play(). No AudioContext is needed. Removing it restores the default
//   audio output path which works on every browser and device.

// Module-level audio event listeners — registered once, never duplicated
audio.addEventListener('ended', () => {
  const { repeatMode, playNext } = usePlayerStore.getState();
  if (repeatMode === 'one') {
    audio.currentTime = 0;
    audio.play().catch(() => {});
  } else {
    playNext();
  }
});

audio.addEventListener('timeupdate', () => {
  usePlayerStore.setState({ currentTime: audio.currentTime });
});

audio.addEventListener('durationchange', () => {
  if (Number.isFinite(audio.duration) && audio.duration > 0) {
    usePlayerStore.setState({ duration: audio.duration });
  }
});

audio.addEventListener('play', () => {
  usePlayerStore.setState({ isPlaying: true });
});

audio.addEventListener('pause', () => {
  usePlayerStore.setState({ isPlaying: false });
});

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

// ── Pagination bridge ─────────────────────────────────────────────────────────
//
// Registered by useSongs() after mount. Allows playerStore to request more
// songs from React Query when the queue runs dry in library context.
//
// Shape: {
//   fetchNextPage: () => void          — triggers React Query page fetch
//   hasNextPage:   () => boolean       — getter so value stays live
//   appendSongs:   (songs[]) => void   — called by useSongs to grow the queue
// }
//
let _paginationBridge = null;

export function registerPaginationBridge(bridge) {
  if (
    bridge &&
    typeof bridge.fetchNextPage === 'function' &&
    typeof bridge.hasNextPage   === 'function' &&
    typeof bridge.appendSongs   === 'function'
  ) {
    _paginationBridge = bridge;
  } else {
    console.warn('[playerStore] registerPaginationBridge: invalid bridge shape', bridge);
  }
}

// Transient flag — set when playNext() requests a fetch and is waiting for
// appendSongsToQueue() to fire. Never stored in Zustand (no re-render needed).
let _pendingNextAfterFetch = false;
audio.volume = parseFloat(localStorage.getItem('melostream_volume') ?? '1');

/**
 * Called by useSongs() when a new page of songs arrives.
 * Appends songs to the queue and, if a playNext() was waiting, continues.
 *
 * @param {Song[]} newSongs  — freshly fetched page (already normalized)
 */
export function appendSongsToQueue(newSongs) {
  if (!Array.isArray(newSongs) || newSongs.length === 0) {
    _pendingNextAfterFetch = false;
    return;
  }

  // Grow the queue
  const qs = getQueueState();
  if (typeof qs?.appendSongs === 'function') {
    qs.appendSongs(newSongs);
  } else {
    console.warn('[playerStore] appendSongsToQueue — queueStore.appendSongs not available');
    _pendingNextAfterFetch = false;
    return;
  }

  // If playNext() was waiting for this page, resume playback now
  if (_pendingNextAfterFetch) {
    _pendingNextAfterFetch = false;
    // Small tick so the queue state has settled before playNext reads it
    setTimeout(() => {
      usePlayerStore.getState().playNext();
    }, 0);
  }
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
  audio.volume = usePlayerStore.getState().volume;

  try {
    await new Promise((resolve, reject) => {
      if (signal.aborted) return reject(new DOMException('Aborted', 'AbortError'));

      // FIX: canplay race condition.
      // HTMLMediaElement.readyState >= 3 (HAVE_FUTURE_DATA) means the browser
      // already has enough data to begin playback — canplay has already fired
      // or will never fire again for this load. If we only attached the
      // 'canplay' listener we would hang forever waiting for an event that
      // already happened (common on CDN edge cache hits or fast connections).
      if (audio.readyState >= 3) {
        resolve();
        return;
      }

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

    // NOTE: No AudioContext calls here. Direct audio.play() is correct and
    // sufficient. The browser allows this because it is called from within
    // the user-gesture callstack (click → playSong → safePlay).
    await audio.play();
  } catch (err) {
    if (err.name === 'AbortError') return;
    console.error('[playerStore] Playback error:', err.message);
    throw err;
  }
}

// ── VINYL ROLL ALGORITHM ──────────────────────────────────────────────────────
// BUG 3 FIX: rewritten to use index tracking instead of splice() mutation.
export function vinylRoll(songs) {
  if (!Array.isArray(songs) || songs.length <= 1) return [...(songs || [])];

  const arr = [...songs];
  const len = arr.length;

  const variance     = Math.floor(len * 0.1);
  const splitPoint   = Math.floor(len / 2) + Math.floor(Math.random() * variance * 2) - variance;
  const clampedSplit = Math.max(1, Math.min(len - 1, splitPoint));

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
        while (rightIdx < rightEnd) interleaved.push(arr[rightIdx++]);
        break;
      }
    } else {
      if (rightIdx < rightEnd) {
        const drop = Math.min(rightEnd - rightIdx, Math.floor(Math.random() * 3) + 1);
        for (let i = 0; i < drop; i++) interleaved.push(arr[rightIdx++]);
      } else {
        while (leftIdx < leftEnd) interleaved.push(arr[leftIdx++]);
        break;
      }
    }
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
// BUG 2 FIX: replaced Math.max(1, ...spread) with reduce()
export function smartPick(queue, currentSong, playCountMap, recentHistory) {
  if (!queue.length) return null;

  const recentWindow = Math.max(3, Math.ceil(queue.length * 0.2));
  const recentIds    = new Set(recentHistory.slice(0, recentWindow).map((s) => s.id));
  const last3Artists = new Set(recentHistory.slice(0, 3).map((s) => s.artist).filter(Boolean));

  // Exhaustion check — if every song (except current) has been played, reset counts
  const exhausted    = queue.every((s) => s.id === currentSong?.id || (playCountMap[s.id] ?? 0) > 0);
  const effectiveMap = exhausted ? {} : playCountMap;

  const maxPlayCount = Object.values(effectiveMap).reduce((m, v) => Math.max(m, v), 1);

  const weights = queue.map((song) => {
    if (song.id === currentSong?.id) return 0;
    if (recentIds.has(song.id))      return 0.05;

    const playCount     = effectiveMap[song.id] ?? 0;
    const countWeight   = (maxPlayCount - playCount + 1) / (maxPlayCount + 1);
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
    if (weights[i] === 0) continue;
    rand -= weights[i];
    if (rand <= 0) return queue[i];
  }
  for (let i = queue.length - 1; i >= 0; i--) {
    if (weights[i] > 0) return queue[i];
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

  const recentWindow = Math.max(5, Math.ceil(recentHistory.length * 0.3));
  const recentIds    = new Set(recentHistory.slice(0, recentWindow).map((s) => s.id));
  const last3Artists = new Set(recentHistory.slice(0, 3).map((s) => s.artist).filter(Boolean));

  const allExhausted = candidates
    .filter((s) => s.id !== currentSong?.id)
    .every((s) => recentIds.has(s.id));
  const effectiveRecentIds = allExhausted ? new Set() : recentIds;

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

      const recentPenalty = effectiveRecentIds.has(song.id)  ? 0.1 : 1.0;
      const artistPenalty = last3Artists.has(song.artist)    ? 0.3 : 1.0;

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
  volume:         parseFloat(localStorage.getItem('melostream_volume') ?? '1'),
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

    const qs = getQueueState();
    if (typeof qs?.setQueueFromContext === 'function') {
      qs.setQueueFromContext(songs, safeIdx, type);
    } else {
      import('./queueStore').then(({ default: useQueueStore }) => {
        useQueueStore.getState().setQueueFromContext(songs, safeIdx, type);
      }).catch((err) => {
        console.error('[playerStore] setPlaybackContext — queueStore import failed:', err.message);
      });
    }
  },

  // ── cycleShuffleMode ───────────────────────────────────────────────────────
  cycleShuffleMode: () => {
    const { shuffleMode, playbackContext, setShuffleMode } = get();
    const isDynamic = playbackContext.type === 'dynamic';

    let next;
    if (shuffleMode === 'none')         next = isDynamic ? 'smart' : 'classic';
    else if (shuffleMode === 'classic') next = 'smart';
    else                                next = 'none';

    setShuffleMode(next);
  },

  // ── setShuffleMode ─────────────────────────────────────────────────────────
  // HARD GUARD — single enforced entry point for all shuffle state changes.
  setShuffleMode: (mode) => {
    const { playbackContext } = get();
    const isDynamic = playbackContext.type === 'dynamic';

    const safeMode = (isDynamic && mode === 'classic') ? 'smart' : mode;

    if (process.env.NODE_ENV !== 'production' && safeMode !== mode) {
      console.warn(
        '[playerStore] setShuffleMode: classic shuffle blocked in dynamic context — coerced to smart'
      );
    }

    if (safeMode === 'classic') {
      const pool = playbackContext.songs.length > 0
        ? playbackContext.songs
        : getQueueState().queue;

      if (pool.length > 0) {
        const { currentSong } = get();
        const rolled = vinylRoll(pool);
        const idx    = rolled.findIndex((s) => s.id === currentSong?.id);
        set({ shuffleMode: 'classic', shuffledOrder: rolled, shuffledIndex: idx >= 0 ? idx : 0 });
        return;
      }
    }

    set({ shuffleMode: safeMode, shuffledOrder: [], shuffledIndex: -1 });
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
    if (!song?.id) {
      console.warn('[playerStore] playSong — song has no id:', song);
      return;
    }

    // Fetch audioUrl on-demand — list normalizer intentionally strips it.
    // GET /api/songs/:id is cached at 300s TTL on the backend.
    let src = song.audioUrl || song.fileUrl || '';
    if (!src) {
      try {
        const { getSongAudioUrl } = await import('../services/songs.service');
        src = await getSongAudioUrl(song.id);
      } catch (err) {
        console.warn('[playerStore] playSong — getSongAudioUrl failed:', err.message);
      }
    }

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

    // Dynamic context — always smart-pick from pool, never paginate
    if (playbackContext.type === 'dynamic') {
      const pool = dynamicPool.length > 0
        ? dynamicPool
        : (playbackContext.songs.length > 0 ? playbackContext.songs : queue);
      const nextSong = smartPick(pool, currentSong, playCountMap, recentlyPlayed);
      if (nextSong) playSong(nextSong);
      return;
    }

    const pool = playbackContext.songs.length > 0 ? playbackContext.songs : queue;
    if (!pool.length) return;

    // ── Classic shuffle ──────────────────────────────────────────────────────
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

    // ── Smart shuffle ────────────────────────────────────────────────────────
    if (shuffleMode === 'smart') {
      const nextSong = smartPick(pool, currentSong, playCountMap, recentlyPlayed);
      if (nextSong) playSong(nextSong);
      return;
    }

    // ── Linear playback ──────────────────────────────────────────────────────
    if (!queue.length) return;

    const currentIndex = queue.findIndex((s) => s.id === currentSong?.id);
    let nextIndex = currentIndex + 1;

    if (nextIndex < queue.length) {
      // Normal case — next song is already in queue
      playSong(queue[nextIndex]);
      return;
    }

    // ── End of queue reached ─────────────────────────────────────────────────
    //
    // Only auto-paginate in 'library' context. Other contexts (playlist, liked)
    // have a fixed pool and should respect repeatMode instead.
    //
    if (playbackContext.type === 'library' && _paginationBridge) {
      const hasMore = _paginationBridge.hasNextPage();
      if (hasMore) {
        // Signal that we want to play next as soon as the new page arrives.
        // Keep isPlaying:true so the UI doesn't flash to a stopped state.
        _pendingNextAfterFetch = true;
        _paginationBridge.fetchNextPage();
        // Do NOT stop — appendSongsToQueue() will resume playback
        return;
      }
    }

    // No more pages — respect repeatMode
    if (repeatMode === 'all') {
      playSong(queue[0]);
    } else {
      set({ isPlaying: false });
    }
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
    localStorage.setItem('melostream_volume', String(v));
    set({ volume: v });
  },

  setCurrentTime: (t) => {
    audio.currentTime = t;
    set({ currentTime: t });
  },

  seekBy: (seconds) => {
    const t = Math.max(0, Math.min(audio.duration || 0, audio.currentTime + seconds));
    audio.currentTime = t;
    set({ currentTime: t });
  },

  toggleMute: () => {
    const next = audio.volume > 0 ? 0 : (parseFloat(localStorage.getItem('melostream_volume') ?? '1') || 1);
    audio.volume = next;
    set({ volume: next });
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

  // ── stop ──────────────────────────────────────────────────────────────────
  stop: () => {
    if (currentAbortController) currentAbortController.abort();
    audio.pause();
    audio.src     = '';
    _pendingNextAfterFetch = false; // cancel any pending fetch-and-play
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

  // ── stopAndClose ──────────────────────────────────────────────────────────
  stopAndClose: () => {
    if (currentAbortController) currentAbortController.abort();

    audio.pause();
    audio.src     = '';

    _pendingNextAfterFetch = false; // cancel any pending fetch-and-play

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

    try {
      const qs = getQueueState();
      if (typeof qs?.setQueueFromContext === 'function') {
        qs.setQueueFromContext([], 0, 'library');
      }
    } catch (err) {
      console.warn('[playerStore] stopAndClose — could not clear queue:', err.message);
    }
  },
}));

export { usePlayerStore };
export default usePlayerStore;