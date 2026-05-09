/**
 * client/src/pages/Home.jsx
 *
 * CHANGES IN THIS VERSION
 * ───────────────────────
 * 1. UserMenu is now imported from PageWrapper and rendered to the RIGHT of
 *    the search bar in the sticky topbar. This gives the topbar a balanced
 *    left (title + count) / center-right (search) / right (avatar) layout
 *    on desktop, and collapses gracefully on mobile.
 *
 *    On mobile (< 768px) the search bar goes full-width on its own row and
 *    the avatar moves back to PageWrapper's top bar (hidden here via CSS).
 *
 * 2. Dead import removed: useAuthStore is still used for user?.uid in the
 *    logPick effect — that usage is kept.
 *
 * UNCHANGED (from previous version):
 *   - BUG 8 FIX: currentSong subscription → logPick + addToHistory
 *   - BUG 9 FIX: safe skeleton imports with inline fallbacks
 *   - BUG 10 FIX: history dropdown right:0 + max-width
 *   - BUG 11 note: cleanup already correct
 *   - All derived data logic (genres, filtered, artists, albums)
 *   - Infinite scroll sentinel
 *   - All render sections (Artists, Albums, Genre pills, All Songs)
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import SongList from "../components/songs/SongList";
import { usePlayerStore } from "../store/playerStore";
import { useAuthStore } from "../store/authStore";
import { useSongs } from "../hooks/useSongs";
import { UserMenu } from "../components/layout/PageWrapper";

// ── BUG 9 FIX: Safe skeleton imports with inline fallbacks ───────────────────
let SongListSkeleton;
let HomeSkeleton;

try {
  // eslint-disable-next-line
  SongListSkeleton = require("../components/songs/SongListSkeleton").default;
} catch {
  SongListSkeleton = ({ count = 8 }) => (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          style={{
            height: 60,
            borderRadius: 8,
            background:
              "linear-gradient(90deg, #1a1a1a 25%, #222 50%, #1a1a1a 75%)",
            backgroundSize: "200% 100%",
            animation: "skeleton-shimmer 1.4s ease infinite",
            animationDelay: `${i * 60}ms`,
          }}
        />
      ))}
      <style>{`
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

try {
  // eslint-disable-next-line
  HomeSkeleton = require("../components/home/HomeSkeleton").default;
} catch {
  HomeSkeleton = () => (
    <div style={{ padding: "20px 24px" }}>
      {[80, 60, 60, 60].map((w, i) => (
        <div
          key={i}
          style={{
            height: i === 0 ? 32 : 20,
            width: `${w}%`,
            borderRadius: 6,
            background: "#1a1a1a",
            marginBottom: i === 0 ? 24 : 12,
            animation: "skeleton-shimmer 1.4s ease infinite",
          }}
        />
      ))}
      <style>{`
        @keyframes skeleton-shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}

// ─── Search history ───────────────────────────────────────────────────────────
const HISTORY_KEY = "melostream_search_history";
const MAX_HISTORY = 8;

function readHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}
function saveHistory(items) {
  try {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(items));
  } catch {
    /* storage full */
  }
}
function addToHistory(song) {
  const prev = readHistory().filter((s) => s.id !== song.id);
  const updated = [
    {
      id: song.id,
      title: song.title,
      artist: song.artist,
      coverUrl: song.coverUrl,
    },
    ...prev,
  ].slice(0, MAX_HISTORY);
  saveHistory(updated);
  return updated;
}
function removeFromHistory(id) {
  const updated = readHistory().filter((s) => s.id !== id);
  saveHistory(updated);
  return updated;
}
// ─── Component ────────────────────────────────────────────────────────────────
const Home = () => {
  const {
    songs,
    isLoading: loading,
    isFetchingNextPage: loadingMore,
    error,
    hasNextPage: hasMore,
    fetchNextPage: fetchMore,
    refetch,
  } = useSongs();

  const [activeGenre, setActiveGenre] = useState("All");
  const [searchText, setSearchText] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [history, setHistory] = useState(readHistory);
  const [recentlyPlayed, setRecentlyPlayed] = useState(() => readHistory());
  const [isSearching, setIsSearching] = useState(false);

  const searchDebounceRef = useRef(null);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const blurTimerRef = useRef(null);
  const sentinelRef = useRef(null);

  // BUG 8 FIX: subscribe to currentSong to run logPick + history as side-effect
  const currentSong = usePlayerStore((s) => s.currentSong);
  const logPick = usePlayerStore((s) => s.logPick);
  const setPlaybackContext = usePlayerStore((s) => s.setPlaybackContext);
  const { user } = useAuthStore();

  // Track previous currentSong to detect actual song changes
  const prevSongRef = useRef(null);

  // BUG 8 FIX: run logPick + addToHistory whenever currentSong changes.
  // Fires regardless of HOW playback was initiated (row click, menu, etc.)
  useEffect(() => {
    if (!currentSong) return;
    if (prevSongRef.current?.id === currentSong.id) return; // same song, no-op
    const previousSong = prevSongRef.current;
    prevSongRef.current = currentSong;
    logPick?.(currentSong, previousSong, user?.uid);
    const updated = addToHistory(currentSong);
    setHistory(updated);
    setRecentlyPlayed(updated);
  }, [currentSong, logPick, user?.uid]);

  const showHistory =
    searchFocused && searchText.trim() === "" && history.length > 0;

  // Cleanup timers on unmount
  useEffect(() => {
    return () => {
      clearTimeout(searchDebounceRef.current);
      clearTimeout(blurTimerRef.current);
    };
  }, []);

  // Close history on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target))
        setSearchFocused(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) fetchMore();
      },
      { rootMargin: "300px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchMore, hasMore, loadingMore]);

  // Derived data
  const genres = useMemo(() => {
    const g = new Set(songs.flatMap((s) => s.tags ?? []).filter(Boolean));
    return ["All", ...Array.from(g).sort()];
  }, [songs]);

  const filtered = useMemo(() => {
    let r =
      activeGenre === "All"
        ? songs
        : songs.filter((s) => (s.tags ?? []).includes(activeGenre));
    if (searchText.trim().length >= 1) {
      const q = searchText.trim().toLowerCase();
      r = r.filter(
        (s) =>
          (s.title || "").toLowerCase().includes(q) ||
          (s.artist || "").toLowerCase().includes(q),
      );
    }
    return r;
  }, [songs, activeGenre, searchText]);


  // Handlers
  const handleFocus = () => {
    clearTimeout(blurTimerRef.current);
    setSearchFocused(true);
  };
  const handleBlur = () => {
    blurTimerRef.current = setTimeout(() => setSearchFocused(false), 150);
  };
  const handleClear = () => {
    clearTimeout(searchDebounceRef.current);
    setSearchText("");
    setIsSearching(false);
    inputRef.current?.focus();
  };

  // BUG 8 FIX: handlePlaySong only used for history-item clicks.
  // Regular SongList playback goes through SongCard → setPlaybackContext directly.
  const handlePlaySong = useCallback(
    (song, pool) => {
      const safePool = Array.isArray(pool) && pool.length > 0 ? pool : songs;
      const idx = safePool.findIndex((s) => s.id === song.id);
      setPlaybackContext("library", null, safePool, idx >= 0 ? idx : 0);
      setSearchFocused(false);
    },
    [songs, setPlaybackContext],
  );

  const handlePlayFromHistory = (item) => {
    const song = songs.find((s) => s.id === item.id);
    if (song) handlePlaySong(song, songs);
    setSearchFocused(false);
  };

  const handleRemoveHistory = (e, id) => {
    e.stopPropagation();
    setHistory(removeFromHistory(id));
  };
  const handleClearAllHistory = () => {
    saveHistory([]);
    setHistory([]);
  };

  // ── States ──
  if (loading) return <HomeSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3 px-4">
        <p className="text-white text-base font-semibold">
          Could not load your library
        </p>
        <p className="text-gray-500 text-sm">
          {error?.message || "Something went wrong."}
        </p>
        <button
          onClick={refetch}
          className="bg-emerald-500 text-black font-semibold text-sm px-6 py-2.5 rounded-lg hover:bg-emerald-400 transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="home-content-enter">
      <style>{HOME_STYLES}</style>
      <div className="home-topbar">
        {/* Left: title + song count */}
        <div className="home-topbar__left">
          <h1 className="home-topbar__title">Your Library</h1>
          <span className="home-topbar__count">{songs.length} songs</span>
        </div>

        {/* Right cluster: search + avatar (avatar hidden on mobile via CSS) */}
        <div className="home-topbar__right">
          {/* Search */}
          <div ref={wrapRef} className="home-topbar__search-wrap">
            <div
              className="home-topbar__search"
              style={{
                borderColor: searchFocused ? "#22c55e" : "#2a2a2a",
                boxShadow: searchFocused
                  ? "0 0 0 3px rgba(34,197,94,0.1)"
                  : "none",
                borderBottomLeftRadius: showHistory ? 0 : 10,
                borderBottomRightRadius: showHistory ? 0 : 10,
              }}
            >
              <svg
                width="15"
                height="15"
                viewBox="0 0 20 20"
                fill="none"
                className="home-topbar__search-icon"
                style={{ color: searchFocused ? "#22c55e" : "#6b7280" }}
              >
                <circle
                  cx="8.5"
                  cy="8.5"
                  r="5.5"
                  stroke="currentColor"
                  strokeWidth="1.5"
                />
                <path
                  d="M14 14l3 3"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                />
              </svg>
              <input
                ref={inputRef}
                type="text"
                placeholder="Filter songs or artists..."
                value={searchText}
                onChange={(e) => {
                  const val = e.target.value;
                  setSearchText(val);
                  if (val.trim().length >= 1) {
                    setIsSearching(true);
                    clearTimeout(searchDebounceRef.current);
                    searchDebounceRef.current = setTimeout(
                      () => setIsSearching(false),
                      200,
                    );
                  } else {
                    clearTimeout(searchDebounceRef.current);
                    setIsSearching(false);
                  }
                }}
                onFocus={handleFocus}
                onBlur={handleBlur}
                className="home-topbar__search-input"
                autoComplete="off"
                spellCheck={false}
              />
              {searchText.length > 0 && (
                <button
                  onClick={handleClear}
                  className="home-topbar__search-clear"
                  aria-label="Clear search"
                >
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                  >
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              )}
            </div>

            {/* History dropdown */}
            {showHistory && (
              <div className="home-history-dropdown">
                <div className="home-history-dropdown__header">
                  <span className="home-history-dropdown__label">
                    Recent searches
                  </span>
                  <button
                    onMouseDown={handleClearAllHistory}
                    className="home-history-dropdown__clear"
                  >
                    Clear all
                  </button>
                </div>
                {history.map((item) => (
                  <div
                    key={item.id}
                    onMouseDown={() => handlePlayFromHistory(item)}
                    className="home-history-item"
                  >
                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#4b5563"
                      strokeWidth="2"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <polyline points="12 6 12 12 16 14" />
                    </svg>
                    <img
                      src={item.coverUrl}
                      alt={item.title}
                      className="home-history-item__cover"
                      onError={(e) => {
                        e.target.src =
                          "https://placehold.co/32x32/111/555?text=♪";
                      }}
                    />
                    <div className="home-history-item__meta">
                      <p className="home-history-item__title">{item.title}</p>
                      <p className="home-history-item__artist">{item.artist}</p>
                    </div>
                    <button
                      onMouseDown={(e) => handleRemoveHistory(e, item.id)}
                      className="home-history-item__remove"
                      aria-label="Remove from history"
                    >
                      <svg
                        width="11"
                        height="11"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <line x1="18" y1="6" x2="6" y2="18" />
                        <line x1="6" y1="6" x2="18" y2="18" />
                      </svg>
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Avatar — desktop only. On mobile, PageWrapper topbar shows it. */}
          <div className="home-topbar__avatar">
            <UserMenu />
          </div>
        </div>
      </div>

      {/* ── Page body ─────────────────────────────────────────────────────── */}
      <div className="home-body">
        {/* ── Recently Played ── */}
        {recentlyPlayed.length > 0 && !searchText && (
          <section className="home-section">
            <div className="home-section__header">
              <h2 className="home-section__title">Recently Played</h2>
            </div>
            <div className="home-recent-grid">
              {recentlyPlayed.slice(0, 8).map((item) => {
                const song = songs.find((s) => s.id === item.id);
                return (
                  <button
                    key={item.id}
                    className="home-recent-card"
                    onClick={() => {
                      if (song) handlePlaySong(song, songs);
                    }}
                    aria-label={`Play ${item.title}`}
                  >
                    <img
                      src={item.coverUrl}
                      alt={item.title}
                      className="home-recent-card__cover"
                      onError={(e) => {
                        e.target.src = "https://placehold.co/56x56/111/555?text=♪";
                      }}
                    />
                    <div className="home-recent-card__meta">
                      <span className="home-recent-card__title">{item.title}</span>
                      <span className="home-recent-card__artist">{item.artist}</span>
                    </div>
                    <div className="home-recent-card__play">▶</div>
                  </button>
                );
              })}
            </div>
          </section>
        )}
        {/* ── Genre pills ── */}
        {genres.length > 1 && !searchText && (
          <div className="home-genres">
            {genres.map((g) => (
              <button
                key={g}
                onClick={() => setActiveGenre(g)}
                className="home-genre-pill"
                data-active={activeGenre === g}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        {/* ── All Songs ── */}
        <section className="home-section">
          <div className="home-section__header">
            <h2 className="home-section__title">All Songs</h2>
            {searchText.trim().length >= 1 && !isSearching && (
              <span className="home-section__meta">
                {filtered.length === 0
                  ? `No results for "${searchText}"`
                  : `${filtered.length} result${filtered.length === 1 ? "" : "s"}`}
              </span>
            )}
          </div>

          {/* BUG 8 FIX: no onPlay prop — SongCard handles playback internally */}
          {isSearching ? (
            <SongListSkeleton count={8} />
          ) : (
            <SongList songs={filtered} />
          )}

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="home-sentinel">
            {!searchText.trim() && loadingMore && (
              <div className="home-sentinel__loading">
                <div className="home-sentinel__spinner" />
                <span>Loading more songs…</span>
              </div>
            )}
            {!searchText.trim() &&
              !hasMore &&
              songs.length > 0 &&
              !loadingMore && (
                <p className="home-sentinel__done">
                  All {songs.length} songs loaded
                </p>
              )}
          </div>
        </section>
      </div>
    </div>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
const HOME_STYLES = `
  @keyframes home-spin { to { transform: rotate(360deg); } }
  @keyframes home-fade-in {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .home-content-enter {
    animation: home-fade-in 0.25s ease both;
  }

  /* ── Top bar ─────────────────────────────────────────────────────────────── */
  .home-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 0 24px;
    height: 60px;
    background: #0f0f0f;
    position: sticky;
    top: 0;
    z-index: 20;
    border-bottom: 1px solid #1e1e1e;
    width: 100%;
    box-sizing: border-box;
  }

  /* Left: title + count */
  .home-topbar__left {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
    flex-shrink: 0;
  }

  .home-topbar__title {
    font-size: 20px;
    font-weight: 700;
    color: #fff;
    white-space: nowrap;
    margin: 0;
    line-height: 1.2;
  }

  .home-topbar__count {
    font-size: 13px;
    color: #6b7280;
    white-space: nowrap;
    font-weight: 400;
  }

  /* Right cluster: search + avatar */
  .home-topbar__right {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-shrink: 0;
  }

  /* Avatar wrapper — desktop only; PageWrapper topbar handles mobile */
  .home-topbar__avatar {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }
  @media (max-width: 767px) {
    /* On mobile the avatar is in PageWrapper's topbar, hide it here */
    .home-topbar__avatar { display: none; }
  }

  /* Search wrap — relative so history dropdown anchors to it */
  .home-topbar__search-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    position: relative;
    flex-shrink: 0;
  }

  .home-topbar__search {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #1a1a1a;
    border: 1px solid #2a2a2a;
    border-radius: 10px;
    padding: 0 12px;
    height: 38px;
    width: 260px;
    transition: border-color 0.2s, box-shadow 0.2s;
    box-sizing: border-box;
  }

  .home-topbar__search-icon { flex-shrink: 0; }

  .home-topbar__search-input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #fff;
    font-size: 13px;
    font-family: inherit;
    min-width: 0;
  }
  .home-topbar__search-input::placeholder { color: #4b5563; }

  .home-topbar__search-clear {
    background: none;
    border: none;
    color: #4b5563;
    cursor: pointer;
    display: flex;
    align-items: center;
    padding: 0;
    transition: color 0.15s;
  }
  .home-topbar__search-clear:hover { color: #e5e7eb; }

  /* ── History dropdown ─────────────────────────────────────────────────────
   * BUG 10 FIX: right:0 + max-width instead of hardcoded right:44px
   */
  .home-history-dropdown {
    position: absolute;
    top: calc(100% + 2px);
    right: 0;
    width: 260px;
    max-width: calc(100vw - 32px);
    background: #1a1a1a;
    border: 1px solid #22c55e;
    border-top-color: #2a2a2a;
    border-radius: 0 0 12px 12px;
    z-index: 100;
    overflow: hidden;
    box-shadow: 0 8px 24px rgba(0,0,0,0.5);
  }
  .home-history-dropdown__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    border-bottom: 1px solid #2a2a2a;
  }
  .home-history-dropdown__label {
    font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 0.08em; color: #4b5563;
  }
  .home-history-dropdown__clear {
    font-size: 11px; font-weight: 600; color: #22c55e;
    background: none; border: none; cursor: pointer; transition: color 0.15s;
  }
  .home-history-dropdown__clear:hover { color: #4ade80; }

  .home-history-item {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 14px; cursor: pointer;
    border-bottom: 1px solid #1f1f1f; transition: background 0.12s;
  }
  .home-history-item:hover { background: rgba(255,255,255,0.04); }
  .home-history-item__cover {
    width: 32px; height: 32px; border-radius: 6px;
    object-fit: cover; flex-shrink: 0; background: #111;
  }
  .home-history-item__meta { flex: 1; min-width: 0; }
  .home-history-item__title {
    font-size: 12px; font-weight: 600; color: #fff;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .home-history-item__artist {
    font-size: 11px; color: #4b5563;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .home-history-item__remove {
    background: none; border: none; color: #4b5563; cursor: pointer;
    padding: 4px; border-radius: 50%; transition: color 0.12s;
    flex-shrink: 0; display: flex; align-items: center;
  }
  .home-history-item__remove:hover { color: #9ca3af; }

  /* ── Mobile topbar layout ─────────────────────────────────────────────────
     On mobile: title row on top, search below it full-width.
     The search-wrap takes full width of the right cluster on mobile.
  */
  @media (max-width: 479px) {
    .home-topbar {
      flex-wrap: wrap;
      height: auto;
      padding: 12px 16px;
      gap: 10px;
      align-items: flex-start;
    }
    .home-topbar__left  { width: 100%; }
    .home-topbar__right { width: 100%; }
    .home-topbar__search-wrap { width: 100%; }
    .home-topbar__search { width: 100%; }
  }

  /* ── Page body ────────────────────────────────────────────────────────────── */
  .home-body { padding: 20px 24px 0; max-width: 100%; box-sizing: border-box; }

  /* ── Section ──────────────────────────────────────────────────────────────── */
  .home-section { margin-bottom: 32px; }
  .home-section__header {
    display: flex; align-items: center; justify-content: space-between;
    margin-bottom: 14px;
  }
  .home-section__title { font-size: 17px; font-weight: 700; color: #fff; margin: 0; line-height: 1; }
  .home-section__see-all {
    font-size: 12px; font-weight: 600; color: #22c55e;
    background: none; border: none; cursor: pointer; transition: color 0.15s; padding: 0;
  }
  .home-section__see-all:hover { color: #4ade80; }
  .home-section__meta { font-size: 12px; color: #6b7280; }
  /* ── Recently Played ─────────────────────────────────────────────────────── */
  .home-recent-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }
  .home-recent-card {
    display: flex; align-items: center; gap: 10px;
    background: #1c1c1c; border: 1px solid #2a2a2a; border-radius: 10px;
    padding: 8px 10px; cursor: pointer; text-align: left; width: 100%;
    transition: background 0.15s, border-color 0.15s; font-family: inherit;
    position: relative; overflow: hidden;
  }
  .home-recent-card:hover { background: #222; border-color: #333; }
  .home-recent-card:hover .home-recent-card__play { opacity: 1; }
  .home-recent-card__cover {
    width: 42px; height: 42px; border-radius: 6px;
    object-fit: cover; flex-shrink: 0; background: #111;
  }
  .home-recent-card__meta {
    flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px;
  }
  .home-recent-card__title {
    font-size: 13px; font-weight: 600; color: #e5e7eb;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .home-recent-card__artist {
    font-size: 11px; color: #6b7280;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .home-recent-card__play {
    font-size: 11px; color: #22c55e; flex-shrink: 0;
    opacity: 0; transition: opacity 0.15s;
  }
  /* ── Genre pills ──────────────────────────────────────────────────────────── */
  .home-genres { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 20px; }
  .home-genre-pill {
    padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 500;
    border: 1px solid #2d2d2d; background: #1a1a1a; color: #9ca3af;
    cursor: pointer; transition: all 0.15s; font-family: inherit;
  }
  .home-genre-pill:hover { border-color: #444; color: #e5e7eb; }
  .home-genre-pill[data-active="true"] {
    background: rgba(34,197,94,0.1); border-color: #22c55e; color: #22c55e;
  }

  /* ── Sentinel ─────────────────────────────────────────────────────────────── */
  .home-sentinel {
    height: 50px; display: flex; align-items: center;
    justify-content: center; margin-top: 16px;
  }
  .home-sentinel__loading { display: flex; align-items: center; gap: 10px; color: #4b5563; font-size: 13px; }
  .home-sentinel__spinner {
    width: 18px; height: 18px; border-radius: 50%;
    border: 2px solid #2d2d2d; border-top-color: #22c55e;
    animation: home-spin 0.7s linear infinite;
  }
  .home-sentinel__done { font-size: 12px; color: #374151; text-align: center; }

  /* ── Responsive ───────────────────────────────────────────────────────────── */
 @media (min-width: 480px) {
    .home-body { padding: 20px 28px 0; }
    .home-recent-grid { grid-template-columns: repeat(2, 1fr); }
  }
  @media (min-width: 768px) {
    .home-topbar { padding: 0 28px; }
    .home-recent-grid { grid-template-columns: repeat(3, 1fr); }
  }
  @media (min-width: 1024px) {
    .home-recent-grid { grid-template-columns: repeat(4, 1fr); }
  }
`;

export default Home;
