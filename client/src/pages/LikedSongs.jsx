import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { useLikedSongs } from "../hooks/useLikedSongs";
import { usePlayerStore } from "../store/playerStore";
import LikedSongsHero from "../components/songs/LikedSongsHero";
import LikedSongsFilters from "../components/songs/LikedSongsFilters";
import LikedSongsTable from "../components/songs/LikedSongsTable";
import LikedSongsSkeleton from "../components/songs/LikedSongsSkeleton";

/**
 * LikedSongs — Production Fix
 *
 * BUG FIXED: playSong(song, "liked", queue) is WRONG.
 * playerStore.playSong signature is: playSong(song) — one argument only.
 * The "liked" context and queue were silently dropped, meaning playback
 * context was never set → skip/shuffle/queue all broken for liked songs.
 *
 * CORRECT PATTERN (from playerStore source):
 *   1. setPlaybackContext(type, id, songs, startIndex) — seeds queue + context
 *   2. playSong(song) — starts audio for the specific song
 *
 * This is the same pattern used by Library and Playlist pages.
 */

const LikedSongs = () => {
  const { user } = useAuthStore();
  const { likedSongs, isLoading, isError, refetch } = useLikedSongs(user?.uid);

  // Filter / sort / group — local UI state only
  const [activeGenre, setActiveGenre] = useState(null);
  const [sortBy, setSortBy] = useState("default");
  const [groupByGenre, setGroupByGenre] = useState(false);

  // ── Store access ──────────────────────────────────────────────────────────
  const setPlaybackContext = usePlayerStore((s) => s.setPlaybackContext);
  const playSong           = usePlayerStore((s) => s.playSong);
  const currentSong        = usePlayerStore((s) => s.currentSong);
  const isGloballyPlaying  = usePlayerStore((s) => s.isPlaying);
  const setShuffleMode     = usePlayerStore((s) => s.setShuffleMode);
  // ── Unified play handler ──────────────────────────────────────────────────
  // CORRECT: setPlaybackContext first (seeds queue + context), then playSong.
  // startIndex tells the queue where to start so Next/Prev work correctly.
  const playSongFromContext = useCallback(
    (song, index, queue) => {
      if (!song) return;
      const safeQueue = Array.isArray(queue) && queue.length > 0 ? queue : [song];
      const safeIndex = typeof index === "number" && index >= 0 ? index : 0;
      // Seed the liked context + full queue first
      setPlaybackContext("liked", "liked-songs", safeQueue, safeIndex);
      // Then start playback for the clicked song
      
    },
    [setPlaybackContext, playSong],
  );

  // ── Smart Play queue ──────────────────────────────────────────────────────
  

  // ── Stage 1: Skeleton ─────────────────────────────────────────────────────
  if (isLoading) return <LikedSongsSkeleton />;

  // ── Error state ───────────────────────────────────────────────────────────
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

  // ── Empty state ───────────────────────────────────────────────────────────
  if (likedSongs.length === 0) {
    return (
      <div className="ls-page ls-page--centered">
        <div className="ls-empty">
          <div className="ls-empty__heart-ring" aria-hidden="true">
            <HeartOutlineIcon />
          </div>
          <p className="ls-empty__title">Nothing here yet</p>
          <p className="ls-empty__sub">
            Heart a song to save it here for quick access.
          </p>
          <Link to="/" className="ls-btn-browse">
            Browse Library
          </Link>
        </div>
      </div>
    );
  }

  // ── Full page ─────────────────────────────────────────────────────────────
  return (
    <div className="ls-page">
      {/* Stage 2 — Hero */}
      <div className="ls-hero-enter">
        <LikedSongsHero
          songs={likedSongs}
          onPlayAll={() =>
            likedSongs[0] && playSongFromContext(likedSongs[0], 0, likedSongs)
          }
          onSmartPlay={() => {
  if (!likedSongs.length) return;
  const randomIndex = Math.floor(Math.random() * likedSongs.length);
  setPlaybackContext("liked", "liked-songs", likedSongs, randomIndex);
  setShuffleMode("smart");
}}
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
        {/*
          IMPORTANT: toggleLike and likedSongIds are passed DOWN from here.
          LikedSongsTable must NOT call useLikedSongs internally — that creates
          a second React Query subscription and conflicts with optimistic updates.
        */}
        <LikedSongsTable
          songs={likedSongs}
          sortBy={sortBy}
          activeGenre={activeGenre}
          groupByGenreEnabled={groupByGenre}
          currentSongId={currentSong?.id ?? null}
          isGloballyPlaying={isGloballyPlaying}
          onPlaySong={playSongFromContext}
          uid={user?.uid}
        />
      </div>
    </div>
  );
};

const HeartOutlineIcon = () => (
  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path
      d="M12 21C12 21 3 14.5 3 8.5C3 5.42 5.42 3 8.5 3C10.24 3 11.91 3.81 13 5.09C14.09 3.81 15.76 3 17.5 3C20.58 3 23 5.42 23 8.5C23 14.5 14 21 12 21Z"
      stroke="#6b7280"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

export default LikedSongs;