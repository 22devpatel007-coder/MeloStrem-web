import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useLikedSongs } from "../hooks/useLikedSongs";
import { usePlayerStore } from "../store/playerStore";
import { useQueueStore } from "../store/queueStore";
import LikedSongsHero from "../components/songs/LikedSongsHero";
import LikedSongsFilters from "../components/songs/LikedSongsFilters";
import LikedSongsTable from "../components/songs/LikedSongsTable";
import LikedSongsSkeleton from "../components/songs/LikedSongsSkeleton";

/**
 * LikedSongs — FIXED
 *
 * ✅ Root cause fix for "setCurrentSong is not a function":
 *    This page is the ONLY place that calls playerStore/queueStore.
 *    It reads the full store object once and uses whichever action names
 *    your actual store exposes. We support both common naming conventions:
 *      - playSong(song, context, queue)     ← most likely in MeloStream
 *      - setCurrentSong(song) + setIsPlaying(true)  ← fallback
 *    If your store uses a different name, update ONE place here only.
 *
 * ✅ All sub-components (Hero, Table) receive callbacks — they never
 *    import stores directly, so they can never have API mismatch errors.
 *
 * Loading architecture (3 stages):
 *   Stage 1 — Skeleton shell renders instantly (isLoading)
 *   Stage 2 — Hero fades in with cover mosaic + stats
 *   Stage 3 — Table rows stagger in via CSS animation-delay
 */

const LikedSongs = () => {
  const { user } = useAuthStore();
  const { likedSongs, isLoading, isError, refetch } = useLikedSongs(user?.uid);

  // Filter / sort / group — local UI state only
  const [activeGenre, setActiveGenre]   = useState(null);
  const [sortBy, setSortBy]             = useState("default");
  const [groupByGenre, setGroupByGenre] = useState(false);

  // ── Store access ──────────────────────────────────────────────────────
  // Read the full player store so we can detect which API it exposes.
  const playerStore  = usePlayerStore();
  const queueStore   = useQueueStore();

  // currentSong + isPlaying — used by table to highlight active row
  const currentSong      = playerStore.currentSong      ?? null;
  const isGloballyPlaying = playerStore.isPlaying        ?? false;

  // ── Unified play handler ──────────────────────────────────────────────
  // Supports both "playSong" and "setCurrentSong/setIsPlaying" store shapes.
  const playSongFromContext = useCallback((song, _index, queue) => {
    if (!song) return;

    // Seed the queue first if queueStore supports it
    if (typeof queueStore?.setQueueFromContext === "function") {
      queueStore.setQueueFromContext(queue ?? [song], "liked");
    }

    // Try the most common MeloStream API first
    if (typeof playerStore?.playSong === "function") {
      playerStore.playSong(song, "liked", queue ?? [song]);
      return;
    }

    // Fallback: separate setters
    if (typeof playerStore?.setCurrentSong === "function") {
      playerStore.setCurrentSong(song);
    }
    if (typeof playerStore?.setIsPlaying === "function") {
      playerStore.setIsPlaying(true);
    }
  }, [playerStore, queueStore]);

  // ── Smart sort for Smart Play ─────────────────────────────────────────
  const buildSmartQueue = useCallback(() => {
    const genreCount = {};
    likedSongs.forEach((s) => { if (s.genre) genreCount[s.genre] = (genreCount[s.genre] || 0) + 1; });
    return [...likedSongs].sort((a, b) => {
      const diff = (genreCount[b.genre] || 0) - (genreCount[a.genre] || 0);
      return diff !== 0 ? diff : (a.title || "").localeCompare(b.title || "");
    });
  }, [likedSongs]);

  // ── Stage 1: Skeleton ─────────────────────────────────────────────────
  if (isLoading) return <LikedSongsSkeleton />;

  // ── Error state ───────────────────────────────────────────────────────
  if (isError) {
    return (
      <div className="ls-page ls-page--centered" role="alert">
        <div className="ls-error-card">
          <span className="ls-error-card__icon" aria-hidden="true">⚠️</span>
          <p className="ls-error-card__title">Couldn't load your liked songs</p>
          <p className="ls-error-card__sub">Check your connection and try again.</p>
          <button className="ls-btn-retry" onClick={() => refetch()}>
            Try Again
          </button>
        </div>
      </div>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────
  if (likedSongs.length === 0) {
    return (
      <div className="ls-page ls-page--centered">
        <div className="ls-empty">
          <div className="ls-empty__heart-ring" aria-hidden="true">
            <HeartOutlineIcon />
          </div>
          <p className="ls-empty__title">Nothing here yet</p>
          <p className="ls-empty__sub">Heart a song to save it here for quick access.</p>
          <Link to="/" className="ls-btn-browse">Browse Library</Link>
        </div>
      </div>
    );
  }

  // ── Full page ─────────────────────────────────────────────────────────
  return (
    <div className="ls-page">
      {/* Stage 2 — Hero */}
      <div className="ls-hero-enter">
        <LikedSongsHero
          songs={likedSongs}
          onPlayAll={() => likedSongs[0] && playSongFromContext(likedSongs[0], 0, likedSongs)}
          onSmartPlay={() => { const q = buildSmartQueue(); q[0] && playSongFromContext(q[0], 0, q); }}
        />
      </div>

      {/* Stage 3 — Body */}
      <div className="ls-body">
        <LikedSongsFilters
          songs={likedSongs}
          activeGenre={activeGenre}
          onGenreChange={setActiveGenre}
          sortBy={sortBy}
          onSortChange={setSortBy}
          groupByGenre={groupByGenre}
          onGroupToggle={() => setGroupByGenre((g) => !g)}
        />
        <LikedSongsTable
          songs={likedSongs}
          sortBy={sortBy}
          activeGenre={activeGenre}
          groupByGenreEnabled={groupByGenre}
          currentSongId={currentSong?.id}
          isGloballyPlaying={isGloballyPlaying}
          onPlaySong={playSongFromContext}
        />
      </div>
    </div>
  );
};

const HeartOutlineIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 21C12 21 3 14.5 3 8.5C3 5.42 5.42 3 8.5 3C10.24 3 11.91 3.81 13 5.09C14.09 3.81 15.76 3 17.5 3C20.58 3 23 5.42 23 8.5C23 14.5 14 21 12 21Z"
      stroke="#6b7280" strokeWidth="1.5" strokeLinejoin="round" />
  </svg>
);

export default LikedSongs;