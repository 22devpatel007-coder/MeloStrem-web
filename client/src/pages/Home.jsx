/**
 * client/src/pages/Home.jsx
 *
 * PLAYBACK CONTEXT CHANGES:
 *
 * handlePlaySong — now calls setPlaybackContext('library', null, queue, idx)
 *   instead of queueStore.setQueue(). This ensures playerStore knows the active
 *   context is 'library' so shuffle operates only over the filtered/featured pool.
 *
 * logPick — called on every song click for affinity data collection.
 *   Passes current playing song as previousSong for co-occurrence logging.
 *   uid from authStore passed so server logging can associate picks with user.
 *
 * All existing BUG fixes preserved unchanged.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import { collection, query, where, orderBy, getDocs } from "firebase/firestore";
import { db } from "../firebase";
import Navbar from "../components/layout/Navbar";
import SongList from "../components/songs/SongList";
import Loader from "../components/ui/Loader";
import { usePlayerStore } from "../store/playerStore";
import { useAuthStore } from "../store/authStore";
import { useSongs } from "../hooks/useSongs";

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
    /* storage full — ignore */
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

const fmtDuration = (secs) => {
  if (!secs && secs !== 0) return null;
  const n = Number(secs);
  if (isNaN(n) || n <= 0) return null;
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
};

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
  const [featuredPlaylists, setFeaturedPlaylists] = useState([]);

  const inputRef = useRef(null);
  const wrapRef = useRef(null);
  const blurTimerRef = useRef(null);
  const sentinelRef = useRef(null);

  const {
    recentlyPlayed,
    currentSong,
    isPlaying,
    setPlaybackContext,
    logPick,
  } = usePlayerStore();
  const { user } = useAuthStore();

  const showHistory =
    searchFocused && searchText.trim() === "" && history.length > 0;

  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setSearchFocused(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

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

  useEffect(() => {
    const fetchFeatured = async () => {
      try {
        const q = query(
          collection(db, "playlists"),
          where("isFeatured", "==", true),
          where("isPublic", "==", true),
          orderBy("createdAt", "desc"),
        );
        const snap = await getDocs(q);
        setFeaturedPlaylists(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        if (
          err.code === "failed-precondition" ||
          err.message?.includes("index")
        ) {
          console.warn("[Home] Featured playlists index not ready.");
        } else {
          console.error("[Home] featured playlists:", err.message);
        }
      }
    };
    fetchFeatured();
  }, []);

  const genres = useMemo(() => {
    const g = new Set(songs.map((s) => s.genre).filter(Boolean));
    return ["All", ...Array.from(g).sort()];
  }, [songs]);

  const filtered = useMemo(() => {
    let result =
      activeGenre === "All"
        ? songs
        : songs.filter((s) => s.genre === activeGenre);
    if (searchText.trim().length >= 1) {
      const q = searchText.trim().toLowerCase();
      result = result.filter(
        (s) =>
          (s.title || "").toLowerCase().includes(q) ||
          (s.artist || "").toLowerCase().includes(q),
      );
    }
    return result;
  }, [songs, activeGenre, searchText]);

  const featuredSongs = useMemo(
    () => songs.filter((s) => s.featured === true).slice(0, 10),
    [songs],
  );

  const recentSongs = useMemo(() => {
    if (!recentlyPlayed.length || !songs.length) return [];
    return recentlyPlayed
      .map((rp) => songs.find((s) => s.id === (rp.id || rp)))
      .filter(Boolean)
      .slice(0, 10);
  }, [recentlyPlayed, songs]);

  const handleFocus = () => {
    clearTimeout(blurTimerRef.current);
    setSearchFocused(true);
  };
  const handleBlur = () => {
    blurTimerRef.current = setTimeout(() => setSearchFocused(false), 150);
  };
  const handleClear = () => {
    setSearchText("");
    inputRef.current?.focus();
  };

  // CONTEXT FIX: use setPlaybackContext instead of queueStore.setQueue directly.
  // This tells playerStore that we're in 'library' context so shuffle
  // operates over the correct pool (filtered/featured subset, not global library).
  const handlePlaySong = useCallback(
    (song, pool) => {
      const safePool = Array.isArray(pool) && pool.length > 0 ? pool : songs;
      const idx = safePool.findIndex((s) => s.id === song.id);

      // Log pick for affinity (currentSong is previousSong in this transition)
      logPick(song, currentSong, user?.uid);

      setPlaybackContext("library", null, safePool, idx >= 0 ? idx : 0);
      setHistory(addToHistory(song));
    },
    [songs, setPlaybackContext, logPick, currentSong, user?.uid],
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

  if (loading) return <Loader />;

  if (error) {
    return (
      <div style={styles.page}>
        <Navbar />
        <div style={styles.errorWrap}>
          <p style={styles.errorTitle}>Could not load your library</p>
          <p style={styles.errorSub}>
            {error?.message || "Something went wrong. Please try again."}
          </p>
          <button onClick={refetch} style={styles.retryBtn}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ ...styles.page, paddingBottom: 120 }}>
      <Navbar />
      <div style={styles.container}>
        {/* ── Header + inline filter ──────────────────────────────────────── */}
        <div style={styles.header}>
          <div>
            <h1 style={styles.heading}>Your Library</h1>
            <p style={styles.subheading}>{songs.length} songs loaded</p>
          </div>

          <div ref={wrapRef} style={styles.searchOuter}>
            <div
              style={{
                ...styles.searchWrap,
                borderColor: searchFocused ? "#22c55e" : "#2d2d2d",
                boxShadow: searchFocused
                  ? "0 0 0 3px rgba(34,197,94,0.1)"
                  : "none",
                borderBottomLeftRadius: showHistory ? 0 : 10,
                borderBottomRightRadius: showHistory ? 0 : 10,
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 20 20"
                fill="none"
                style={{
                  flexShrink: 0,
                  color: searchFocused ? "#22c55e" : "#6b7280",
                  transition: "color 0.2s",
                }}
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
                placeholder="Filter songs or artists…"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={styles.searchInput}
                autoComplete="off"
                spellCheck={false}
              />
              {searchText.length > 0 && (
                <button
                  onClick={handleClear}
                  style={styles.clearBtn}
                  aria-label="Clear filter"
                >
                  <svg
                    width="14"
                    height="14"
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

            {showHistory && (
              <div style={styles.historyDropdown}>
                <div style={styles.historyHeader}>
                  <span style={styles.historyLabel}>Recent searches</span>
                  <button
                    onMouseDown={handleClearAllHistory}
                    style={styles.clearAllBtn}
                  >
                    Clear all
                  </button>
                </div>
                {history.map((item) => (
                  <div
                    key={item.id}
                    style={styles.historyRow}
                    onMouseDown={() => handlePlayFromHistory(item)}
                  >
                    <div style={styles.historyIconWrap}>
                      <svg
                        width="13"
                        height="13"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#6b7280"
                        strokeWidth="2"
                      >
                        <circle cx="12" cy="12" r="10" />
                        <polyline points="12 6 12 12 16 14" />
                      </svg>
                    </div>
                    <img
                      src={
                        item.coverUrl ||
                        "https://placehold.co/34x34/111/555?text=♪"
                      }
                      alt=""
                      style={styles.historyCover}
                      onError={(e) => {
                        e.target.src =
                          "https://placehold.co/34x34/111/555?text=♪";
                      }}
                    />
                    <div style={styles.historyInfo}>
                      <p style={styles.historyTitle}>{item.title}</p>
                      <p style={styles.historyArtist}>{item.artist}</p>
                    </div>
                    <button
                      onMouseDown={(e) => handleRemoveHistory(e, item.id)}
                      style={styles.historyRemoveBtn}
                      aria-label="Remove"
                    >
                      <svg
                        width="12"
                        height="12"
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
        </div>

        {/* ── Featured Songs ──────────────────────────────────────────────── */}
        {featuredSongs.length > 0 && !searchText && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>
              <StarIcon /> Featured
            </h2>
            <div style={styles.featuredGrid}>
              {featuredSongs.map((song) => {
                const active = currentSong?.id === song.id;
                const dur = fmtDuration(song.duration);
                return (
                  <div
                    key={song.id}
                    onClick={() => handlePlaySong(song, featuredSongs)}
                    style={{
                      ...styles.featuredCard,
                      outline: active
                        ? "2px solid #22c55e"
                        : "2px solid transparent",
                    }}
                  >
                    <div style={styles.featuredImgWrap}>
                      <img
                        src={
                          song.coverUrl ||
                          "https://placehold.co/120x120/1a1a1a/555?text=♪"
                        }
                        alt={song.title}
                        style={styles.featuredImg}
                        onError={(e) => {
                          e.target.src =
                            "https://placehold.co/120x120/1a1a1a/555?text=♪";
                        }}
                      />
                      <div style={styles.featuredOverlay}>
                        {active && isPlaying ? (
                          <PauseIcon />
                        ) : (
                          <PlayIconSmall />
                        )}
                      </div>
                    </div>
                    <div style={styles.featuredInfo}>
                      <p
                        style={{
                          ...styles.featuredTitle,
                          color: active ? "#22c55e" : "#fff",
                        }}
                      >
                        {song.title}
                      </p>
                      <p style={styles.featuredArtist}>{song.artist}</p>
                      <div style={styles.featuredMeta}>
                        <span style={styles.featuredGenre}>{song.genre}</span>
                        {dur && <span style={styles.featuredDur}>{dur}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Recently Played ─────────────────────────────────────────────── */}
        {recentSongs.length > 0 && !searchText && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>
              <ClockIcon /> Recently Played
            </h2>
            <div style={styles.recentScroll}>
              {recentSongs.map((song) => (
                <div
                  key={song.id}
                  onClick={() => handlePlaySong(song, recentSongs)}
                  style={styles.recentChip}
                  title={`${song.title} — ${song.artist}`}
                >
                  <img
                    src={song.coverUrl}
                    alt={song.title}
                    style={styles.recentCover}
                    onError={(e) => {
                      e.target.src =
                        "https://placehold.co/40x40/111/555?text=♪";
                    }}
                  />
                  <div style={styles.recentInfo}>
                    <p style={styles.recentTitle}>{song.title}</p>
                    <p style={styles.recentArtist}>{song.artist}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Featured Playlists ──────────────────────────────────────────── */}
        {featuredPlaylists.length > 0 && !searchText && (
          <div style={styles.section}>
            <h2 style={styles.sectionTitle}>
              <PlaylistIcon /> Featured Playlists
            </h2>
            <div style={styles.recentScroll}>
              {featuredPlaylists.map((pl) => (
                <Link
                  key={pl.id}
                  to={`/playlists/${pl.id}`}
                  style={{ ...styles.recentChip, textDecoration: "none" }}
                >
                  {pl.coverUrl ? (
                    <img
                      src={pl.coverUrl}
                      alt={pl.name}
                      style={styles.recentCover}
                      onError={(e) => {
                        e.target.src =
                          "https://placehold.co/36x36/1a1a1a/555?text=♪";
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        ...styles.recentCover,
                        background: "#2d2d2d",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "#4b5563",
                        fontSize: 14,
                      }}
                    >
                      ♪
                    </div>
                  )}
                  <div style={styles.recentInfo}>
                    <p style={styles.recentTitle}>{pl.name}</p>
                    <p style={styles.recentArtist}>
                      {pl.songIds?.length || 0} songs
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}

        {/* ── Genre Pills ─────────────────────────────────────────────────── */}
        {genres.length > 1 && !searchText && (
          <div style={styles.pillsRow}>
            {genres.map((g) => (
              <button
                key={g}
                onClick={() => setActiveGenre(g)}
                style={{
                  ...styles.pill,
                  ...(activeGenre === g ? styles.pillActive : {}),
                }}
              >
                {g}
              </button>
            ))}
          </div>
        )}

        {searchText.trim().length >= 1 && (
          <p style={styles.filterInfo}>
            {filtered.length === 0
              ? `No songs match "${searchText}"`
              : `${filtered.length} song${filtered.length === 1 ? "" : "s"} match "${searchText}"`}
          </p>
        )}

        <SongList songs={filtered} onPlay={handlePlaySong} />

        <div ref={sentinelRef} style={styles.sentinel}>
          {!searchText.trim() && loadingMore && (
            <div style={styles.loadingMore}>
              <div style={styles.spinner} />
              <span style={styles.loadingText}>Loading more songs…</span>
            </div>
          )}
          {!searchText.trim() &&
            !hasMore &&
            songs.length > 0 &&
            !loadingMore && (
              <p style={styles.allLoadedText}>
                All {songs.length} songs loaded
              </p>
            )}
        </div>
      </div>
    </div>
  );
};

const StarIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="currentColor"
    strokeWidth="1"
    style={{ marginRight: 6, color: "#f59e0b" }}
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);
const ClockIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    style={{ marginRight: 6 }}
  >
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const PlaylistIcon = () => (
  <svg
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    style={{ marginRight: 6 }}
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);
const PlayIconSmall = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="#000">
    <path d="M8 5.14v14l11-7-11-7z" />
  </svg>
);
const PauseIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="#000">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0f0f0f",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  container: { maxWidth: "1200px", margin: "0 auto", padding: "32px 20px 0" },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 16,
    marginBottom: 24,
  },
  heading: {
    color: "#fff",
    fontSize: 22,
    fontWeight: 700,
    letterSpacing: "-0.3px",
    marginBottom: 4,
  },
  subheading: { color: "#6b7280", fontSize: 13 },
  searchOuter: { position: "relative", width: "100%", maxWidth: 340 },
  searchWrap: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    borderRadius: 10,
    padding: "0 12px",
    height: 42,
    transition: "border-color 0.2s, box-shadow 0.2s, border-radius 0.1s",
  },
  searchInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#fff",
    fontSize: 14,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  clearBtn: {
    background: "none",
    border: "none",
    color: "#6b7280",
    cursor: "pointer",
    padding: 2,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  historyDropdown: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    zIndex: 100,
    background: "#1a1a1a",
    border: "1px solid #22c55e",
    borderTop: "1px solid #2d2d2d",
    borderRadius: "0 0 12px 12px",
    overflow: "hidden",
    boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
  },
  historyHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 14px 8px",
    borderBottom: "1px solid #2d2d2d",
  },
  historyLabel: {
    color: "#6b7280",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  clearAllBtn: {
    background: "none",
    border: "none",
    color: "#22c55e",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
    padding: 0,
  },
  historyRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 14px",
    cursor: "pointer",
    transition: "background 0.1s",
    borderBottom: "1px solid #1f1f1f",
  },
  historyIconWrap: {
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 20,
  },
  historyCover: {
    width: 34,
    height: 34,
    borderRadius: 6,
    objectFit: "cover",
    flexShrink: 0,
  },
  historyInfo: { flex: 1, minWidth: 0 },
  historyTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    marginBottom: 2,
  },
  historyArtist: {
    color: "#6b7280",
    fontSize: 11,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  historyRemoveBtn: {
    background: "none",
    border: "none",
    color: "#4b5563",
    cursor: "pointer",
    padding: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    borderRadius: "50%",
    transition: "color 0.15s",
  },
  filterInfo: { color: "#6b7280", fontSize: 13, marginBottom: 16 },
  errorWrap: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "60vh",
    gap: 12,
  },
  errorTitle: { color: "#fff", fontSize: 16, fontWeight: 600 },
  errorSub: { color: "#6b7280", fontSize: 13 },
  retryBtn: {
    background: "#22c55e",
    color: "#000",
    border: "none",
    borderRadius: 8,
    padding: "10px 24px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  section: { marginBottom: 28 },
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    color: "#9ca3af",
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    marginBottom: 12,
  },
  featuredGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
    gap: 12,
  },
  featuredCard: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    borderRadius: 10,
    padding: 10,
    cursor: "pointer",
    transition: "background 0.15s, outline 0.15s",
    overflow: "hidden",
  },
  featuredImgWrap: { position: "relative", flexShrink: 0 },
  featuredImg: {
    width: 52,
    height: 52,
    borderRadius: 8,
    objectFit: "cover",
    display: "block",
  },
  featuredOverlay: {
    position: "absolute",
    inset: 0,
    borderRadius: 8,
    background: "rgba(0,0,0,0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: 0,
    transition: "opacity 0.2s",
  },
  featuredInfo: { flex: 1, minWidth: 0 },
  featuredTitle: {
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    marginBottom: 2,
  },
  featuredArtist: {
    color: "#6b7280",
    fontSize: 11,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    marginBottom: 5,
  },
  featuredMeta: { display: "flex", alignItems: "center", gap: 6 },
  featuredGenre: {
    background: "rgba(34,197,94,0.1)",
    color: "#22c55e",
    border: "1px solid rgba(34,197,94,0.2)",
    borderRadius: 4,
    padding: "1px 6px",
    fontSize: 10,
    fontWeight: 500,
  },
  featuredDur: { color: "#4b5563", fontSize: 11 },
  recentScroll: {
    display: "flex",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 6,
    scrollbarWidth: "none",
    msOverflowStyle: "none",
  },
  recentChip: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    borderRadius: 8,
    padding: "8px 12px 8px 8px",
    cursor: "pointer",
    flexShrink: 0,
    minWidth: 160,
    maxWidth: 200,
    transition: "background 0.15s",
  },
  recentCover: {
    width: 36,
    height: 36,
    borderRadius: 6,
    objectFit: "cover",
    flexShrink: 0,
  },
  recentInfo: { minWidth: 0 },
  recentTitle: {
    color: "#fff",
    fontSize: 12,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  recentArtist: {
    color: "#6b7280",
    fontSize: 11,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  pillsRow: { display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 24 },
  pill: {
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    color: "#9ca3af",
    borderRadius: 20,
    padding: "6px 14px",
    fontSize: 13,
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.15s",
    fontFamily: "inherit",
  },
  pillActive: {
    background: "rgba(34,197,94,0.1)",
    borderColor: "#22c55e",
    color: "#22c55e",
  },
  sentinel: {
    height: 60,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    marginTop: 24,
  },
  loadingMore: { display: "flex", alignItems: "center", gap: 10 },
  spinner: {
    width: 18,
    height: 18,
    borderRadius: "50%",
    border: "2px solid #2d2d2d",
    borderTopColor: "#22c55e",
    animation: "spin 0.7s linear infinite",
  },
  loadingText: { color: "#6b7280", fontSize: 13 },
  allLoadedText: { color: "#4b5563", fontSize: 12, textAlign: "center" },
};

if (
  typeof document !== "undefined" &&
  !document.getElementById("home-spin-style")
) {
  const s = document.createElement("style");
  s.id = "home-spin-style";
  s.textContent = "@keyframes spin { to { transform: rotate(360deg); } }";
  document.head.appendChild(s);
}

export default Home;
