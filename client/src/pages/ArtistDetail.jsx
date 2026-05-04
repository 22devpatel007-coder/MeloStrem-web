/**
 * client/src/pages/ArtistDetail.jsx
 *
 * PHASE 4 — TASK 4.4 AUDIT: Replace raw error string renders.
 *
 * WHAT CHANGED (surgical — only error states):
 *
 *   1. Imported ErrorState from components/errors/ErrorState.
 *
 *   2. "Artist not found" block — was: plain <div> with hardcoded <p> + <Link>.
 *      Now: <ErrorState variant="page" ...> — consistent error UI.
 *
 *   3. "Could not load artist" block — same treatment as #2.
 *
 * WHAT DID NOT CHANGE:
 *   - Task 3.5 virtualization (useVirtualizer, listRef, sentinel) — 100% identical
 *   - Hero section — 100% identical
 *   - Discography section — 100% identical
 *   - handlePlaySong / handlePlayAll — identical
 *   - isActive highlighting — identical
 *   - Link null-safety for album — identical
 *   - All styles object — 100% identical
 *   - formatDuration helper — identical
 *   - useArtist / usePlayerStore / useAuthStore usage — identical
 *   - All constants (ARTIST_ROW_HEIGHT, OVERSCAN, SENTINEL_OFFSET, LIST_MAX_HEIGHT) — identical
 *   - PERMANENT FIX comment (Navbar removed) — preserved
 */

import { useRef, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useArtist } from "../hooks/useArtist";
import { usePlayerStore } from "../store/playerStore";
import { useAuthStore } from "../store/authStore";
import Loader from "../components/ui/Loader";
import ErrorState from "../components/errors/ErrorState";

// ── Constants — identical to original ────────────────────────────────────────
const ARTIST_ROW_HEIGHT = 56;
const OVERSCAN          = 5;
const SENTINEL_OFFSET   = 8;
const LIST_MAX_HEIGHT   = 'calc(100vh - 360px)';

// ── Component ─────────────────────────────────────────────────────────────────
/**
 * PERMANENT FIX: Navbar import and usage removed entirely.
 * PageWrapper owns layout. Page renders only its own content.
 */
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

  // ── Virtual scroll ref — identical to original ────────────────────────────
  const listRef = useRef(null);

  const virtualizer = useVirtualizer({
    count:            songs.length,
    getScrollElement: () => listRef.current,
    estimateSize:     () => ARTIST_ROW_HEIGHT,
    overscan:         OVERSCAN,
  });

  const virtualItems = virtualizer.getVirtualItems();
  const totalHeight  = virtualizer.getTotalSize();

  // ── Infinite scroll sentinel — identical to original ──────────────────────
  useEffect(() => {
    if (!fetchNextPage || !hasNextPage || isFetchingNextPage) return;
    if (virtualItems.length === 0) return;

    const lastItem = virtualItems[virtualItems.length - 1];
    if (lastItem.index >= (songs.length - SENTINEL_OFFSET)) {
      fetchNextPage();
    }
  }, [virtualItems, songs.length, fetchNextPage, hasNextPage, isFetchingNextPage]);

  // ── Discography data — identical to original ──────────────────────────────
  const albumMap = new Map();
  songs.forEach((song) => {
    if (song.albumId && !albumMap.has(song.albumId)) {
      albumMap.set(song.albumId, {
        albumId:   song.albumId,
        albumName: song.album || "Unknown Album",
        coverUrl:  song.coverUrl || "",
      });
    }
  });
  const albums = Array.from(albumMap.values());

  // ── Handlers — identical to original ─────────────────────────────────────
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

  // ── Guards ────────────────────────────────────────────────────────────────
  if (isLoading) return <Loader />;

  // ── TASK 4.4: Not found — replaced with ErrorState ─────────────────────────
  if (!artist && !isLoading) {
    return (
      <ErrorState
        variant="page"
        title="Artist not found"
        message="This artist page doesn't exist or hasn't been created yet."
        actionLabel="Go to Library"
        onAction={() => { window.location.href = '/'; }}
        showHomeButton={false}
      />
    );
  }

  // ── TASK 4.4: Load error — replaced with ErrorState ────────────────────────
  if (error && !artist) {
    return (
      <ErrorState
        variant="page"
        title="Could not load artist"
        message="Something went wrong. Please try again."
        actionLabel="Try again"
        onAction={() => { window.location.reload(); }}
        showHomeButton={true}
      />
    );
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ── Hero — 100% identical to original ── */}
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
        {/* ── Songs section — virtualizer identical to original ── */}
        <section style={styles.section}>
          <h2 style={styles.sectionTitle}>Songs</h2>
          {songs.length === 0 ? (
            <p style={styles.empty}>No songs found for this artist.</p>
          ) : (
            <>
              <div
                ref={listRef}
                style={{
                  overflowY:      'auto',
                  maxHeight:      LIST_MAX_HEIGHT,
                  position:       'relative',
                  scrollbarWidth: 'thin',
                  scrollbarColor: 'rgba(255,255,255,0.08) transparent',
                }}
              >
                <div style={{ height: totalHeight, position: 'relative' }}>
                  {virtualItems.map((virtualItem) => {
                    const song = songs[virtualItem.index];
                    if (!song) return null;
                    const isActive = currentSong?.id === song.id;

                    return (
                      <div
                        key={song.id}
                        data-index={virtualItem.index}
                        ref={virtualizer.measureElement}
                        style={{
                          position:  'absolute',
                          top:       0,
                          left:      0,
                          width:     '100%',
                          transform: `translateY(${virtualItem.start}px)`,
                        }}
                      >
                        <div
                          style={{
                            ...styles.songRow,
                            background: isActive
                              ? "rgba(34,197,94,0.06)"
                              : "transparent",
                          }}
                          onClick={() => handlePlaySong(song, virtualItem.index)}
                        >
                          <span style={styles.rowNum}>
                            {isActive ? "♪" : virtualItem.index + 1}
                          </span>
                          <img
                            src={
                              song.coverUrl ||
                              "https://placehold.co/40x40/1a1a1a/555?text=♪"
                            }
                            alt={song.title}
                            style={styles.songCover}
                            onError={(e) => {
                              e.target.src =
                                "https://placehold.co/40x40/1a1a1a/555?text=♪";
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
                              <span style={styles.songMetaText}>
                                {song.artist}
                              </span>
                              {song.albumId ? (
                                <>
                                  {" · "}
                                  <Link
                                    to={`/album/${song.albumId}`}
                                    style={styles.albumLink}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {song.album || "Unknown Album"}
                                  </Link>
                                </>
                              ) : song.album ? (
                                <span style={styles.songMetaText}>
                                  {" · "}{song.album}
                                </span>
                              ) : null}
                            </p>
                          </div>
                          {Array.isArray(song.tags) && song.tags.length > 0 && (
                            <span style={styles.genreBadge}>{song.tags[0]}</span>
                          )}
                          <span style={styles.duration}>
                            {formatDuration(song.duration)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
              {isFetchingNextPage && (
                <p style={styles.loadingMore}>Loading more…</p>
              )}
            </>
          )}
        </section>

        {/* ── Discography — 100% identical to original ── */}
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
                      "https://placehold.co/150x150/1a1a1a/555?text=♪"
                    }
                    alt={alb.albumName}
                    style={styles.albumCover}
                    onError={(e) => {
                      e.target.src =
                        "https://placehold.co/150x150/1a1a1a/555?text=♪";
                    }}
                  />
                  <p style={styles.albumName}>{alb.albumName}</p>
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

// ── Helpers — identical to original ──────────────────────────────────────────
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = String(Math.floor(seconds % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

// ── Styles — 100% identical to original ──────────────────────────────────────
const styles = {
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
  container: { maxWidth: 1000, margin: "0 auto", padding: "0 20px" },
  section: { marginTop: 40 },
  sectionTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: 700,
    marginBottom: 16,
    letterSpacing: "-0.3px",
  },
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
  albumLink: { color: "#9ca3af", textDecoration: "none" },
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
  loadingMore: { color: "#6b7280", fontSize: 13, padding: "8px 12px" },
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
  empty: { color: "#6b7280", fontSize: 14, padding: "24px 0" },
};

export default ArtistDetail;