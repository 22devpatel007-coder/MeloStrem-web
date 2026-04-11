/**
 * client/src/pages/Home.jsx
 *
 * Redesigned to match target UI:
 *  - Top bar: "Your Library" + song count + filter input + user avatar
 *  - Artists section: card grid (avatar initials + name + song count)
 *  - Albums section: card grid (color cover + name + artist)
 *  - All Songs: SongList with column headers
 *  - Genre filter pills above song list
 *  - Infinite scroll sentinel
 *  - Fully responsive: mobile scroll rows → desktop grids
 *
 * Scroll: PageWrapper's <main> is the single scroll region.
 * This component renders only its content — no extra wrappers.
 */

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { Link } from "react-router-dom";
import SongList from "../components/songs/SongList";
import HomeSkeleton from "../components/home/HomeSkeleton";
import { usePlayerStore } from "../store/playerStore";
import { useAuthStore } from "../store/authStore";
import { useSongs } from "../hooks/useSongs";

// ─── Search history ───────────────────────────────────────────────────────────
const HISTORY_KEY = "melostream_search_history";
const MAX_HISTORY = 8;

function readHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
  catch { return []; }
}
function saveHistory(items) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items)); }
  catch { /* storage full */ }
}
function addToHistory(song) {
  const prev = readHistory().filter((s) => s.id !== song.id);
  const updated = [
    { id: song.id, title: song.title, artist: song.artist, coverUrl: song.coverUrl },
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

const AVATAR_COLORS = [
  { bg: "#E1F5EE", color: "#085041" },
  { bg: "#EEEDFE", color: "#3C3489" },
  { bg: "#FAECE7", color: "#712B13" },
  { bg: "#FBEAF0", color: "#72243E" },
  { bg: "#E6F1FB", color: "#0C447C" },
  { bg: "#EAF3DE", color: "#27500A" },
  { bg: "#FAEEDA", color: "#633806" },
];

const COVER_COLORS = [
  "#9FE1CB", "#CECBF6", "#F5C4B3", "#B5D4F4",
  "#FAC775", "#C0DD97", "#F4C0D1",
];

function initials(name = "") {
  return name.split(/[\s\-,]+/).filter(Boolean)
    .slice(0, 2).map((w) => w[0].toUpperCase()).join("");
}

function deriveArtists(songs) {
  const map = new Map();
  for (const s of songs) {
    const key = s.artistId || `__plain__${s.artist}`;
    if (!map.has(key)) {
      map.set(key, { artistId: s.artistId || null, artist: s.artist || "Unknown", songCount: 0 });
    }
    map.get(key).songCount += 1;
  }
  return Array.from(map.values())
    .filter((a) => a.artist && a.artist !== "Unknown")
    .sort((a, b) => b.songCount - a.songCount);
}

function deriveAlbums(songs) {
  const map = new Map();
  for (const s of songs) {
    if (!s.album) continue;
    const key = s.albumId || `__plain__${s.album}`;
    if (!map.has(key)) {
      map.set(key, { albumId: s.albumId || null, album: s.album, artist: s.artist || "", artistId: s.artistId || null });
    }
  }
  return Array.from(map.values());
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

  const [activeGenre, setActiveGenre]     = useState("All");
  const [searchText, setSearchText]       = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [history, setHistory]             = useState(readHistory);
  const [showAllArtists, setShowAllArtists] = useState(false);
  const [showAllAlbums, setShowAllAlbums]   = useState(false);

  const inputRef     = useRef(null);
  const wrapRef      = useRef(null);
  const blurTimerRef = useRef(null);
  const sentinelRef  = useRef(null);

  const { currentSong, setPlaybackContext, logPick } = usePlayerStore();
  const { user } = useAuthStore();

  const showHistory = searchFocused && searchText.trim() === "" && history.length > 0;

  // Close history on outside click
  useEffect(() => {
    const handler = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setSearchFocused(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Infinite scroll
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => { if (entries[0].isIntersecting && hasMore && !loadingMore) fetchMore(); },
      { rootMargin: "300px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [fetchMore, hasMore, loadingMore]);

  // Derived data
  const genres   = useMemo(() => { const g = new Set(songs.map((s) => s.genre).filter(Boolean)); return ["All", ...Array.from(g).sort()]; }, [songs]);
  const filtered = useMemo(() => {
    let r = activeGenre === "All" ? songs : songs.filter((s) => s.genre === activeGenre);
    if (searchText.trim().length >= 1) {
      const q = searchText.trim().toLowerCase();
      r = r.filter((s) => (s.title || "").toLowerCase().includes(q) || (s.artist || "").toLowerCase().includes(q));
    }
    return r;
  }, [songs, activeGenre, searchText]);
  const artists = useMemo(() => deriveArtists(songs), [songs]);
  const albums  = useMemo(() => deriveAlbums(songs),  [songs]);

  const visibleArtists = showAllArtists ? artists : artists.slice(0, 8);
  const visibleAlbums  = showAllAlbums  ? albums  : albums.slice(0, 8);

  // Handlers
  const handleFocus = () => { clearTimeout(blurTimerRef.current); setSearchFocused(true); };
  const handleBlur  = () => { blurTimerRef.current = setTimeout(() => setSearchFocused(false), 150); };
  const handleClear = () => { setSearchText(""); inputRef.current?.focus(); };

  const handlePlaySong = useCallback((song, pool) => {
    const safePool = Array.isArray(pool) && pool.length > 0 ? pool : songs;
    const idx = safePool.findIndex((s) => s.id === song.id);
    logPick?.(song, currentSong, user?.uid);
    setPlaybackContext("library", null, safePool, idx >= 0 ? idx : 0);
    setHistory(addToHistory(song));
  }, [songs, setPlaybackContext, logPick, currentSong, user?.uid]);

  const handlePlayFromHistory = (item) => {
    const song = songs.find((s) => s.id === item.id);
    if (song) handlePlaySong(song, songs);
    setSearchFocused(false);
  };
  const handleRemoveHistory   = (e, id) => { e.stopPropagation(); setHistory(removeFromHistory(id)); };
  const handleClearAllHistory = () => { saveHistory([]); setHistory([]); };

  // ── States ──
  if (loading) return <HomeSkeleton />;

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-3 px-4">
        <p className="text-white text-base font-semibold">Could not load your library</p>
        <p className="text-gray-500 text-sm">{error?.message || "Something went wrong."}</p>
        <button onClick={refetch} className="bg-emerald-500 text-black font-semibold text-sm px-6 py-2.5 rounded-lg hover:bg-emerald-400 transition-colors">
          Retry
        </button>
      </div>
    );
  }

  // ── Render ──
  return (
    <div className="home-content-enter">
      <style>{HOME_STYLES}</style>

      {/* ── Top bar ────────────────────────────────────────────────────────── */}
      <div className="home-topbar">
        <div className="home-topbar__left">
          <h1 className="home-topbar__title">Your Library</h1>
          <span className="home-topbar__count">{songs.length} songs</span>
        </div>

        {/* Search */}
        <div ref={wrapRef} className="home-topbar__search-wrap">
          <div
            className="home-topbar__search"
            style={{
              borderColor: searchFocused ? "#22c55e" : "#2a2a2a",
              boxShadow: searchFocused ? "0 0 0 3px rgba(34,197,94,0.1)" : "none",
              borderBottomLeftRadius: showHistory ? 0 : 10,
              borderBottomRightRadius: showHistory ? 0 : 10,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" className="home-topbar__search-icon" style={{ color: searchFocused ? "#22c55e" : "#6b7280" }}>
              <circle cx="8.5" cy="8.5" r="5.5" stroke="currentColor" strokeWidth="1.5" />
              <path d="M14 14l3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              placeholder="Filter songs or artists..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
              className="home-topbar__search-input"
              autoComplete="off"
              spellCheck={false}
            />
            {searchText.length > 0 && (
              <button onClick={handleClear} className="home-topbar__search-clear" aria-label="Clear">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            )}
          </div>

          {/* User avatar */}
          {user && (
            <div className="home-topbar__avatar" title={user.displayName || user.email}>
              {user.photoURL
                ? <img src={user.photoURL} alt="avatar" className="home-topbar__avatar-img" />
                : <span className="home-topbar__avatar-initials">{initials(user.displayName || user.email || "U")}</span>
              }
            </div>
          )}

          {/* History dropdown */}
          {showHistory && (
            <div className="home-history-dropdown">
              <div className="home-history-dropdown__header">
                <span className="home-history-dropdown__label">Recent searches</span>
                <button onMouseDown={handleClearAllHistory} className="home-history-dropdown__clear">Clear all</button>
              </div>
              {history.map((item) => (
                <div key={item.id} onMouseDown={() => handlePlayFromHistory(item)} className="home-history-item">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#4b5563" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <img src={item.coverUrl} alt={item.title} className="home-history-item__cover" onError={(e) => { e.target.src = "https://placehold.co/32x32/111/555?text=♪"; }} />
                  <div className="home-history-item__meta">
                    <p className="home-history-item__title">{item.title}</p>
                    <p className="home-history-item__artist">{item.artist}</p>
                  </div>
                  <button onMouseDown={(e) => handleRemoveHistory(e, item.id)} className="home-history-item__remove" aria-label="Remove">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Page body ─────────────────────────────────────────────────────── */}
      <div className="home-body">

        {/* ── Artists ── */}
        {artists.length > 0 && !searchText && (
          <section className="home-section">
            <div className="home-section__header">
              <h2 className="home-section__title">Artists</h2>
              {artists.length > 8 && (
                <button onClick={() => setShowAllArtists((v) => !v)} className="home-section__see-all">
                  {showAllArtists ? "Show less" : "See all"}
                </button>
              )}
            </div>

            <div className="home-artists-grid">
              {visibleArtists.map((a, i) => {
                const col = AVATAR_COLORS[i % AVATAR_COLORS.length];
                const av = initials(a.artist);
                const card = (
                  <div className="home-artist-card">
                    <div className="home-artist-card__av" style={{ background: col.bg, color: col.color }}>{av}</div>
                    <span className="home-artist-card__name">{a.artist}</span>
                    <span className="home-artist-card__count">{a.songCount} songs</span>
                  </div>
                );
                return a.artistId ? (
                  <Link key={a.artistId} to={`/artist/${a.artistId}`} style={{ textDecoration: "none" }}>{card}</Link>
                ) : (
                  <div key={a.artist}>{card}</div>
                );
              })}
            </div>
          </section>
        )}

        {/* ── Albums ── */}
        {albums.length > 0 && !searchText && (
          <section className="home-section">
            <div className="home-section__header">
              <h2 className="home-section__title">Albums</h2>
              {albums.length > 8 && (
                <button onClick={() => setShowAllAlbums((v) => !v)} className="home-section__see-all">
                  {showAllAlbums ? "Show less" : "See all"}
                </button>
              )}
            </div>

            <div className="home-albums-grid">
              {visibleAlbums.map((al, i) => {
                const bg = COVER_COLORS[i % COVER_COLORS.length];
                const card = (
                  <div className="home-album-card">
                    <div className="home-album-card__cover" style={{ background: bg }}>
                      <span className="home-album-card__cover-icon">♪</span>
                    </div>
                    <div className="home-album-card__info">
                      <span className="home-album-card__name">{al.album}</span>
                      {al.artistId ? (
                        <Link to={`/artist/${al.artistId}`} className="home-album-card__artist home-album-card__artist--link" onClick={(e) => e.stopPropagation()}>
                          {al.artist}
                        </Link>
                      ) : (
                        <span className="home-album-card__artist">{al.artist}</span>
                      )}
                    </div>
                  </div>
                );
                return al.albumId ? (
                  <Link key={al.albumId} to={`/album/${al.albumId}`} style={{ textDecoration: "none" }}>{card}</Link>
                ) : (
                  <div key={al.album || i}>{card}</div>
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
            {searchText.trim().length >= 1 && (
              <span className="home-section__meta">
                {filtered.length === 0
                  ? `No results for "${searchText}"`
                  : `${filtered.length} result${filtered.length === 1 ? "" : "s"}`}
              </span>
            )}
          </div>

          <SongList songs={filtered} onPlay={handlePlaySong} />

          {/* Infinite scroll sentinel */}
          <div ref={sentinelRef} className="home-sentinel">
            {!searchText.trim() && loadingMore && (
              <div className="home-sentinel__loading">
                <div className="home-sentinel__spinner" />
                <span>Loading more songs…</span>
              </div>
            )}
            {!searchText.trim() && !hasMore && songs.length > 0 && !loadingMore && (
              <p className="home-sentinel__done">All {songs.length} songs loaded</p>
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

  /* Content enters smoothly after skeleton is replaced */
  .home-content-enter {
    animation: home-fade-in 0.25s ease both;
  }

  /* ── Top bar ─────────────────────────────────────────────────────────────── */
  .home-topbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    padding: 20px 24px 16px;
    background: #0f0f0f;
    position: sticky;
    top: 0;
    z-index: 20;
    border-bottom: 1px solid #1e1e1e;
    width: 100%;
    box-sizing: border-box;
  }

  .home-topbar__left {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
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

  .home-topbar__avatar {
    width: 34px;
    height: 34px;
    border-radius: 50%;
    background: #22c55e;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    overflow: hidden;
    cursor: pointer;
  }
  .home-topbar__avatar-img {
    width: 100%; height: 100%; object-fit: cover;
  }
  .home-topbar__avatar-initials {
    font-size: 12px;
    font-weight: 700;
    color: #000;
    letter-spacing: 0;
  }

  /* ── History dropdown ────────────────────────────────────────────────────── */
  .home-history-dropdown {
    position: absolute;
    top: calc(100% + 2px);
    right: 44px; /* align with search box, offset avatar */
    width: 260px;
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
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: #4b5563;
  }
  .home-history-dropdown__clear {
    font-size: 11px;
    font-weight: 600;
    color: #22c55e;
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.15s;
  }
  .home-history-dropdown__clear:hover { color: #4ade80; }

  .home-history-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 14px;
    cursor: pointer;
    border-bottom: 1px solid #1f1f1f;
    transition: background 0.12s;
  }
  .home-history-item:hover { background: rgba(255,255,255,0.04); }
  .home-history-item__cover { width: 32px; height: 32px; border-radius: 6px; object-fit: cover; flex-shrink: 0; background: #111; }
  .home-history-item__meta { flex: 1; min-width: 0; }
  .home-history-item__title { font-size: 12px; font-weight: 600; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .home-history-item__artist { font-size: 11px; color: #4b5563; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .home-history-item__remove { background: none; border: none; color: #4b5563; cursor: pointer; padding: 4px; border-radius: 50%; transition: color 0.12s; flex-shrink: 0; display: flex; align-items: center; }
  .home-history-item__remove:hover { color: #9ca3af; }

  /* ── Page body ───────────────────────────────────────────────────────────── */
  .home-body {
    padding: 20px 24px 0;
    max-width: 100%;
  }

  /* ── Section ─────────────────────────────────────────────────────────────── */
  .home-section { margin-bottom: 32px; }

  .home-section__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 14px;
  }

  .home-section__title {
    font-size: 17px;
    font-weight: 700;
    color: #fff;
    margin: 0;
    line-height: 1;
  }

  .home-section__see-all {
    font-size: 12px;
    font-weight: 600;
    color: #22c55e;
    background: none;
    border: none;
    cursor: pointer;
    transition: color 0.15s;
    padding: 0;
  }
  .home-section__see-all:hover { color: #4ade80; }

  .home-section__meta {
    font-size: 12px;
    color: #6b7280;
  }

  /* ── Artists grid ────────────────────────────────────────────────────────── */
  .home-artists-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .home-artist-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 18px 12px 14px;
    gap: 8px;
    background: #1c1c1c;
    border: 1px solid #2a2a2a;
    border-radius: 12px;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
    text-align: center;
  }
  .home-artist-card:hover { background: #222; border-color: #333; }

  .home-artist-card__av {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 18px;
    font-weight: 700;
    flex-shrink: 0;
  }

  .home-artist-card__name {
    font-size: 13px;
    font-weight: 600;
    color: #e5e7eb;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  .home-artist-card__count {
    font-size: 11px;
    color: #6b7280;
  }

  /* ── Albums grid ─────────────────────────────────────────────────────────── */
  .home-albums-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .home-album-card {
    display: flex;
    flex-direction: column;
    background: #1c1c1c;
    border: 1px solid #2a2a2a;
    border-radius: 12px;
    overflow: hidden;
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }
  .home-album-card:hover { background: #222; border-color: #333; }

  .home-album-card__cover {
    width: 100%;
    aspect-ratio: 1;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .home-album-card__cover-icon {
    font-size: 28px;
    opacity: 0.7;
  }

  .home-album-card__info {
    padding: 10px 12px 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .home-album-card__name {
    font-size: 13px;
    font-weight: 500;
    color: #e5e7eb;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .home-album-card__artist {
    font-size: 11px;
    color: #6b7280;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-decoration: none;
  }
  .home-album-card__artist--link { color: #4ade80; transition: color 0.15s; }
  .home-album-card__artist--link:hover { color: #22c55e; text-decoration: underline; text-underline-offset: 2px; }

  /* ── Genre pills ─────────────────────────────────────────────────────────── */
  .home-genres {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 20px;
  }

  .home-genre-pill {
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 500;
    border: 1px solid #2d2d2d;
    background: #1a1a1a;
    color: #9ca3af;
    cursor: pointer;
    transition: all 0.15s;
    font-family: inherit;
  }
  .home-genre-pill:hover { border-color: #444; color: #e5e7eb; }
  .home-genre-pill[data-active="true"] {
    background: rgba(34,197,94,0.1);
    border-color: #22c55e;
    color: #22c55e;
  }

  /* ── Sentinel ────────────────────────────────────────────────────────────── */
  .home-sentinel {
    height: 64px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-top: 16px;
  }

  .home-sentinel__loading {
    display: flex;
    align-items: center;
    gap: 10px;
    color: #4b5563;
    font-size: 13px;
  }

  .home-sentinel__spinner {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 2px solid #2d2d2d;
    border-top-color: #22c55e;
    animation: home-spin 0.7s linear infinite;
  }

  .home-sentinel__done {
    font-size: 12px;
    color: #374151;
    text-align: center;
  }

  /* ── Responsive ──────────────────────────────────────────────────────────── */

  /* sm: 2-col → keep, just wider padding */
  @media (min-width: 480px) {
    .home-topbar { padding: 20px 28px 16px; width: 100%; }
    .home-body   { padding: 20px 28px 0; max-width: 100%; }
  }

  /* md: 3-col grids */
  @media (min-width: 768px) {
    .home-artists-grid { grid-template-columns: repeat(3, 1fr); }
    .home-albums-grid  { grid-template-columns: repeat(3, 1fr); }
    .home-topbar__search { width: 300px; }
  }

  /* lg: 4-col grids */
  @media (min-width: 1024px) {
    .home-artists-grid { grid-template-columns: repeat(4, 1fr); }
    .home-albums-grid  { grid-template-columns: repeat(4, 1fr); }
    .home-topbar__search { width: 340px; }
  }

  /* mobile: smaller padding, smaller search */
  @media (max-width: 479px) {
    .home-topbar { padding: 14px 16px 12px; flex-wrap: wrap; gap: 10px; width: 100%; }
    .home-body   { padding: 14px 16px 0; max-width: 100%; }
    .home-topbar__search { width: 100%; }
    .home-topbar__search-wrap { width: 100%; flex-wrap: wrap; }
    .home-topbar__left { width: 100%; }
    .home-history-dropdown { right: 0; width: 100%; }
  }
`;

export default Home;