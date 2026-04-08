/**
 * client/src/pages/ArtistDetail.jsx
 *
 * Artist detail page — /artist/:id
 *
 * Layout:
 *   Hero  — artist image, name, verified badge, song/album counts
 *   Top Songs — first 10 songs, plays inline via playerStore (context: 'artist')
 *   Discography — album cards grid, each links to /album/:albumId
 *   Load More — appears when artist has more than 10 songs
 *
 * Playback context:
 *   Song clicks set context type 'library' scoped to the artist's song list
 *   (no dedicated 'artist' context type exists — 'library' is the correct
 *    fallback per playerStore design; playlist/liked/dynamic are the other
 *    explicit contexts).
 *
 * Null safety:
 *   - song.artistId null → artist name renders as plain text (not a link)
 *   - album.coverUrl ''  → placeholder image shown
 *   - 404 from API      → friendly not-found state, no crash
 */

import { useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useArtist } from "../hooks/useArtist";
import { useQuery } from "@tanstack/react-query";
import { usePlayerStore } from "../store/playerStore";
import { useAuthStore } from "../store/authStore";
import { QUERY_KEYS } from "../constants/queryKeys";
import api from "../services/api";
import Navbar from "../components/layout/Navbar";
import Loader from "../components/ui/Loader";

// Fetch all albums for this artist (non-paginated — used only here)
const fetchArtistAlbums = async (artistId) => {
  const res = await api.get(`/artists/${artistId}/songs`); // albums fetched separately below
  return res?.data ?? res;
};

const fetchAlbumsByArtist = async (artistId) => {
  // Albums don't have a dedicated list endpoint yet — query Firestore-side
  // via a lightweight albums search. For now we fetch from the albums collection
  // by artistId using the existing GET /api/albums route pattern.
  // This will be wired up when album list endpoint is added; for Phase 5 we
  // derive album cards from the songs data already loaded in useArtist.
  return [];
};

const ArtistDetail = () => {
  const { id } = useParams();
  const {
    artist,
    songs,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isLoading,
    error,
  } = useArtist(id);
  const { setPlaybackContext, logPick, currentSong } = usePlayerStore();
  const { user } = useAuthStore();

  const [showAll, setShowAll] = useState(false);

  // Derive unique album stubs from songs data (avoids a separate albums endpoint
  // for Phase 5 — full album list endpoint can be added in a future phase).
  const albumMap = new Map();
  songs.forEach((song) => {
    if (song.albumId && !albumMap.has(song.albumId)) {
      albumMap.set(song.albumId, {
        albumId: song.albumId,
        albumName: song.album || "Unknown Album",
        coverUrl: song.coverUrl || "",
        genre: song.genre || "",
      });
    }
  });
  const albums = Array.from(albumMap.values());

  const displayedSongs = showAll ? songs : songs.slice(0, 10);

  const handlePlaySong = useCallback(
    (song, index) => {
      logPick(song, currentSong, user?.uid);
      setPlaybackContext("library", id, songs, index);
    },
    [songs, id, setPlaybackContext, logPick, currentSong, user?.uid],
  );

  const handlePlayAll = useCallback(() => {
    if (!songs.length) return;
    setPlaybackContext("library", id, songs, 0);
  }, [songs, id, setPlaybackContext]);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (isLoading) return <Loader />;

  // ── Not found ────────────────────────────────────────────────────────────
  if (!artist && !isLoading) {
    return (
      <div style={styles.page}>
        <Navbar />
        <div style={styles.notFound}>
          <p style={styles.notFoundTitle}>Artist not found</p>
          <p style={styles.notFoundSub}>
            This artist page doesn't exist or hasn't been created yet.
          </p>
          <Link to="/" style={styles.backLink}>
            ← Back to Library
          </Link>
        </div>
      </div>
    );
  }

  // ── Error ────────────────────────────────────────────────────────────────
  if (error && !artist) {
    return (
      <div style={styles.page}>
        <Navbar />
        <div style={styles.notFound}>
          <p style={styles.notFoundTitle}>Could not load artist</p>
          <p style={styles.notFoundSub}>
            Something went wrong. Please try again.
          </p>
          <Link to="/" style={styles.backLink}>
            ← Back to Library
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      <Navbar />

      {/* ── Hero ──────────────────────────────────────────────────────────── */}
      <div style={styles.hero}>
        <div style={styles.heroInner}>
          {artist.imageUrl ? (
            <img
              src={artist.imageUrl}
              alt={artist.name}
              style={styles.heroImg}
              onError={(e) => {
                e.target.src = "https://placehold.co/160x160/1a1a1a/555?text=♪";
              }}
            />
          ) : (
            <div style={styles.heroImgPlaceholder}>♪</div>
          )}

          <div style={styles.heroMeta}>
            <div style={styles.heroType}>
              <span style={styles.typeLabel}>ARTIST</span>
              {artist.verified && (
                <span style={styles.verifiedBadge}>✓ Verified</span>
              )}
            </div>
            <h1 style={styles.heroName}>{artist.name}</h1>
            {artist.bio && <p style={styles.heroBio}>{artist.bio}</p>}
            <div style={styles.heroStats}>
              <span style={styles.statItem}>
                {artist.songCount ?? songs.length} songs
              </span>
              {(artist.albumCount > 0 || albums.length > 0) && (
                <span style={styles.statItem}>
                  {artist.albumCount ?? albums.length} albums
                </span>
              )}
            </div>
            {songs.length > 0 && (
              <div style={styles.heroControls}>
                <button style={styles.playBtn} onClick={handlePlayAll}>
                  ▶ Play All
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={styles.container}>
        {/* ── Top Songs ───────────────────────────────────────────────────── */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Songs</h2>

          {songs.length === 0 ? (
            <p style={styles.empty}>No songs found for this artist.</p>
          ) : (
            <>
              {displayedSongs.map((song, index) => {
                const isActive = currentSong?.id === song.id;
                return (
                  <div
                    key={song.id}
                    style={{
                      ...styles.songRow,
                      background: isActive
                        ? "rgba(34,197,94,0.06)"
                        : "transparent",
                    }}
                    onClick={() => handlePlaySong(song, index)}
                  >
                    <span style={styles.rowNum}>
                      {isActive ? "♪" : index + 1}
                    </span>
                    <img
                      src={
                        song.coverUrl ||
                        "https://placehold.co/40x40/111/555?text=♪"
                      }
                      alt={song.title}
                      style={styles.songCover}
                      onError={(e) => {
                        e.target.src =
                          "https://placehold.co/40x40/111/555?text=♪";
                      }}
                    />
                    <div style={styles.songInfo}>
                      <p
                        style={{
                          ...styles.songTitle,
                          color: isActive ? "#22c55e" : "#fff",
                        }}
                      >
                        {song.title}
                      </p>
                      <p style={styles.songMeta}>
                        {song.albumId ? (
                          <Link
                            to={`/album/${song.albumId}`}
                            style={styles.albumLink}
                            onClick={(e) => e.stopPropagation()}
                          >
                            {song.album || "Unknown Album"}
                          </Link>
                        ) : (
                          <span style={styles.songMetaText}>
                            {song.album || ""}
                          </span>
                        )}
                      </p>
                    </div>
                    {song.genre && (
                      <span style={styles.genreBadge}>{song.genre}</span>
                    )}
                    <span style={styles.duration}>
                      {formatDuration(song.duration)}
                    </span>
                  </div>
                );
              })}

              {/* Show more / less toggle */}
              {songs.length > 10 && (
                <button
                  style={styles.showMoreBtn}
                  onClick={() => {
                    if (!showAll && hasNextPage) fetchNextPage();
                    setShowAll((prev) => !prev);
                  }}
                >
                  {showAll
                    ? "Show less"
                    : `Show all ${artist.songCount ?? songs.length} songs`}
                </button>
              )}

              {isFetchingNextPage && (
                <p style={styles.loadingMore}>Loading more songs...</p>
              )}
            </>
          )}
        </section>

        {/* ── Discography ─────────────────────────────────────────────────── */}
        {albums.length > 0 && (
          <section style={styles.section}>
            <h2 style={styles.sectionTitle}>Discography</h2>
            <div style={styles.albumGrid}>
              {albums.map((alb) => (
                <Link
                  key={alb.albumId}
                  to={`/album/${alb.albumId}`}
                  style={styles.albumCard}
                >
                  <img
                    src={
                      alb.coverUrl ||
                      "https://placehold.co/160x160/1a1a1a/555?text=♪"
                    }
                    alt={alb.albumName}
                    style={styles.albumCover}
                    onError={(e) => {
                      e.target.src =
                        "https://placehold.co/160x160/1a1a1a/555?text=♪";
                    }}
                  />
                  <p style={styles.albumName}>{alb.albumName}</p>
                  {alb.genre && <p style={styles.albumGenre}>{alb.genre}</p>}
                </Link>
              ))}
            </div>
          </section>
        )}
      </div>
      <div style={{ height: 88 }} />
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = String(Math.floor(seconds % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0f0f0f",
    fontFamily: "'Inter', sans-serif",
  },

  // Hero
  hero: {
    background: "linear-gradient(180deg, #1a1a1a 0%, #0f0f0f 100%)",
    paddingBottom: 32,
  },
  heroInner: {
    maxWidth: 1000,
    margin: "0 auto",
    padding: "36px 20px 0",
    display: "flex",
    gap: 32,
    alignItems: "flex-end",
    flexWrap: "wrap",
  },
  heroImg: {
    width: 160,
    height: 160,
    borderRadius: "50%",
    objectFit: "cover",
    flexShrink: 0,
    boxShadow: "0 12px 40px rgba(0,0,0,0.6)",
  },
  heroImgPlaceholder: {
    width: 160,
    height: 160,
    borderRadius: "50%",
    background: "#1e1e1e",
    border: "1px solid #2d2d2d",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 48,
    color: "#4b5563",
    flexShrink: 0,
  },
  heroMeta: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingBottom: 8,
  },
  heroType: { display: "flex", alignItems: "center", gap: 8 },
  typeLabel: {
    color: "#22c55e",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "1.5px",
  },
  verifiedBadge: {
    background: "rgba(34,197,94,0.1)",
    color: "#22c55e",
    border: "1px solid rgba(34,197,94,0.25)",
    borderRadius: 20,
    padding: "2px 10px",
    fontSize: 11,
    fontWeight: 700,
  },
  heroName: {
    color: "#fff",
    fontSize: 42,
    fontWeight: 800,
    letterSpacing: "-1px",
    lineHeight: 1.1,
    margin: 0,
  },
  heroBio: {
    color: "#9ca3af",
    fontSize: 14,
    lineHeight: 1.6,
    maxWidth: 520,
    margin: 0,
  },
  heroStats: { display: "flex", gap: 20 },
  statItem: { color: "#6b7280", fontSize: 13 },
  heroControls: { marginTop: 8 },
  playBtn: {
    background: "#22c55e",
    color: "#000",
    border: "none",
    borderRadius: 8,
    padding: "10px 28px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },

  // Container
  container: { maxWidth: 1000, margin: "0 auto", padding: "0 20px" },
  section: { marginTop: 40 },
  sectionTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 16,
    letterSpacing: "-0.3px",
  },

  // Song rows
  songRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 12px",
    borderRadius: 8,
    cursor: "pointer",
    transition: "background 0.15s",
  },
  rowNum: {
    color: "#6b7280",
    fontSize: 12,
    width: 20,
    textAlign: "center",
    flexShrink: 0,
  },
  songCover: {
    width: 40,
    height: 40,
    borderRadius: 6,
    objectFit: "cover",
    flexShrink: 0,
  },
  songInfo: { flex: 1, minWidth: 0 },
  songTitle: {
    fontSize: 13,
    fontWeight: 600,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    marginBottom: 2,
  },
  songMeta: {
    fontSize: 11,
    color: "#6b7280",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    margin: 0,
  },
  songMetaText: { color: "#6b7280" },
  albumLink: {
    color: "#9ca3af",
    textDecoration: "none",
    ":hover": { color: "#22c55e" },
  },
  genreBadge: {
    background: "rgba(34,197,94,0.1)",
    color: "#22c55e",
    border: "1px solid rgba(34,197,94,0.2)",
    borderRadius: 4,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 500,
    flexShrink: 0,
  },
  duration: {
    color: "#6b7280",
    fontSize: 12,
    flexShrink: 0,
    minWidth: 36,
    textAlign: "right",
  },

  showMoreBtn: {
    background: "none",
    border: "none",
    color: "#9ca3af",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    padding: "12px 12px",
    fontFamily: "inherit",
    ":hover": { color: "#fff" },
  },
  loadingMore: { color: "#6b7280", fontSize: 13, padding: "8px 12px" },

  // Album grid
  albumGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
    gap: 20,
  },
  albumCard: {
    textDecoration: "none",
    display: "flex",
    flexDirection: "column",
    gap: 8,
    cursor: "pointer",
  },
  albumCover: {
    width: "100%",
    aspectRatio: "1",
    borderRadius: 10,
    objectFit: "cover",
    background: "#1a1a1a",
    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
    transition: "transform 0.2s",
    ":hover": { transform: "scale(1.03)" },
  },
  albumName: {
    color: "#fff",
    fontSize: 13,
    fontWeight: 600,
    margin: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  albumGenre: { color: "#6b7280", fontSize: 11, margin: 0 },

  // Not found / error
  notFound: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    height: "60vh",
    gap: 12,
    textAlign: "center",
  },
  notFoundTitle: { color: "#fff", fontSize: 18, fontWeight: 700 },
  notFoundSub: { color: "#6b7280", fontSize: 14 },
  backLink: {
    color: "#22c55e",
    fontSize: 13,
    fontWeight: 600,
    textDecoration: "none",
    marginTop: 8,
  },

  empty: { color: "#6b7280", fontSize: 14, padding: "24px 0" },
};

export default ArtistDetail;
