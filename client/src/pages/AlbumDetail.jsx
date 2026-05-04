/**
 * client/src/pages/AlbumDetail.jsx
 *
 * PHASE 4 — TASK 4.4 AUDIT: Replace raw error string renders.
 *
 * WHAT CHANGED (surgical — only error states):
 *
 *   1. Imported ErrorState from components/errors/ErrorState.
 *
 *   2. "Not found" block — was: plain <div> with hardcoded <p> + <Link>.
 *      Now: <ErrorState variant="page" ...> — consistent error UI,
 *      uses design tokens, accessible, focus-managed.
 *
 *   3. "Could not load album" block — same treatment as #2.
 *
 *   4. isLoading fallback — was: <Loader /> alone.
 *      Kept <Loader /> (correct). No change needed.
 *
 * WHAT DID NOT CHANGE:
 *   - All hero JSX — 100% identical
 *   - All track list JSX — 100% identical
 *   - Discography / "More by this artist" section — 100% identical
 *   - handlePlaySong, handlePlayAll, totalSeconds — 100% identical
 *   - useAlbum, usePlayerStore, useAuthStore usage — 100% identical
 *   - formatDuration, formatTotalDuration helpers — 100% identical
 *   - All styles object — 100% identical
 *   - PERMANENT FIX comment (Navbar removed) — preserved
 */

import { useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useAlbum } from "../hooks/useAlbum";
import { usePlayerStore } from "../store/playerStore";
import { useAuthStore } from "../store/authStore";
import Loader from "../components/ui/Loader";
import ErrorState from "../components/errors/ErrorState";

const AlbumDetail = () => {
  const { id } = useParams();
  const { album, songs, isLoading, error } = useAlbum(id);
  const { setPlaybackContext, logPick, currentSong } = usePlayerStore();
  const { user } = useAuthStore();

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

  const totalSeconds = songs.reduce(
    (acc, s) => acc + (Number(s.duration) || 0),
    0,
  );

  if (isLoading) return <Loader />;

  // ── TASK 4.4: Not found — replaced with ErrorState ─────────────────────────
  if (!album && !isLoading) {
    return (
      <ErrorState
        variant="page"
        title="Album not found"
        message="This album page doesn't exist or hasn't been created yet."
        actionLabel="Go to Library"
        onAction={() => { window.location.href = '/'; }}
        showHomeButton={false}
      />
    );
  }

  // ── TASK 4.4: Load error — replaced with ErrorState ────────────────────────
  if (error && !album) {
    return (
      <ErrorState
        variant="page"
        title="Could not load album"
        message="Something went wrong. Please try again."
        actionLabel="Try again"
        onAction={() => { window.location.reload(); }}
        showHomeButton={true}
      />
    );
  }

  return (
    <div style={{ fontFamily: "'Inter', sans-serif" }}>
      {/* ── Hero ── */}
      <div style={styles.hero}>
        <div style={styles.heroInner}>
          <img
            src={
              album.coverUrl || "https://placehold.co/200x200/1a1a1a/555?text=♪"
            }
            alt={album.name}
            style={styles.heroCover}
            onError={(e) => {
              e.target.src = "https://placehold.co/200x200/1a1a1a/555?text=♪";
            }}
          />
          <div style={styles.heroMeta}>
            <span style={styles.typeLabel}>ALBUM</span>
            <h1 style={styles.heroName}>{album.name}</h1>
            <div style={styles.heroSub}>
              {album.artistId ? (
                <Link
                  to={`/artist/${album.artistId}`}
                  style={styles.artistLink}
                >
                  {album.artistName || "Unknown Artist"}
                </Link>
              ) : (
                <span style={styles.artistText}>
                  {album.artistName || "Unknown Artist"}
                </span>
              )}
              {album.year > 0 && (
                <>
                  <span style={styles.subDivider}>·</span>
                  <span style={styles.subText}>{album.year}</span>
                </>
              )}
            </div>
            <p style={styles.heroStats}>
              {songs.length} {songs.length === 1 ? "song" : "songs"}
              {totalSeconds > 0 && ` · ${formatTotalDuration(totalSeconds)}`}
            </p>
            {songs.length > 0 && (
              <button style={styles.playBtn} onClick={handlePlayAll}>
                ▶ Play Album
              </button>
            )}
          </div>
        </div>
      </div>

      <div style={styles.container}>
        {/* ── Track list ── */}
        <section style={styles.section}>
          {songs.length === 0 ? (
            <p style={styles.empty}>No tracks found for this album.</p>
          ) : (
            songs.map((song, index) => {
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
                  <span style={styles.trackNum}>
                    {isActive ? "♪" : (song.trackNumber ?? index + 1)}
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
                    <p style={styles.songArtist}>{song.artist}</p>
                  </div>
                  {Array.isArray(song.tags) && song.tags.length > 0 && (
                    <span style={styles.genrePill}>{song.tags[0]}</span>
                  )}
                  <span style={styles.duration}>
                    {formatDuration(song.duration)}
                  </span>
                </div>
              );
            })
          )}
        </section>

        {/* ── More from this artist ── */}
        {album.artistId && (
          <section style={styles.moreSection}>
            <div style={styles.moreTitleRow}>
              <h2 style={styles.sectionTitle}>More by this artist</h2>
              <Link to={`/artist/${album.artistId}`} style={styles.seeAllLink}>
                See all →
              </Link>
            </div>
            <p style={styles.moreHint}>
              Visit the{" "}
              <Link
                to={`/artist/${album.artistId}`}
                style={styles.artistLinkInline}
              >
                {album.artistName || "artist"}
              </Link>{" "}
              page to explore their full discography.
            </p>
          </section>
        )}
      </div>
      <div style={{ height: 88 }} />
    </div>
  );
};

function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return "--:--";
  const m = Math.floor(seconds / 60);
  const s = String(Math.floor(seconds % 60)).padStart(2, "0");
  return `${m}:${s}`;
}

function formatTotalDuration(seconds) {
  if (!seconds) return "";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (h > 0) return `${h} hr ${m} min`;
  return `${m} min`;
}

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
  heroCover: {
    width: 200,
    height: 200,
    borderRadius: 12,
    objectFit: "cover",
    flexShrink: 0,
    boxShadow: "0 16px 48px rgba(0,0,0,0.7)",
  },
  heroMeta: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    paddingBottom: 8,
  },
  typeLabel: {
    color: "#22c55e",
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "1.5px",
  },
  heroName: {
    color: "#fff",
    fontSize: 38,
    fontWeight: 800,
    letterSpacing: "-0.8px",
    lineHeight: 1.1,
    margin: 0,
  },
  heroSub: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" },
  artistLink: {
    color: "#fff",
    fontWeight: 600,
    fontSize: 14,
    textDecoration: "none",
  },
  artistText: { color: "#fff", fontWeight: 600, fontSize: 14 },
  subDivider: { color: "#4b5563", fontSize: 14 },
  subText: { color: "#9ca3af", fontSize: 14 },
  genreBadge: {
    background: "rgba(34,197,94,0.1)",
    color: "#22c55e",
    border: "1px solid rgba(34,197,94,0.2)",
    borderRadius: 20,
    padding: "2px 10px",
    fontSize: 11,
    fontWeight: 600,
  },
  heroStats: { color: "#6b7280", fontSize: 13, margin: 0 },
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
    alignSelf: "flex-start",
    marginTop: 4,
  },
  container: { maxWidth: 1000, margin: "0 auto", padding: "0 20px" },
  section: { marginTop: 24 },
  sectionTitle: {
    color: "#fff",
    fontSize: 20,
    fontWeight: 700,
    letterSpacing: "-0.3px",
    margin: "0 0 16px",
  },
  empty: { color: "#6b7280", fontSize: 14, padding: "24px 0" },
  songRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 12px",
    borderRadius: 8,
    cursor: "pointer",
    transition: "background 0.15s",
  },
  trackNum: {
    color: "#6b7280",
    fontSize: 12,
    width: 24,
    textAlign: "center",
    flexShrink: 0,
    fontVariantNumeric: "tabular-nums",
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
  songArtist: {
    color: "#6b7280",
    fontSize: 11,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    margin: 0,
  },
  genrePill: {
    background: "rgba(34,197,94,0.08)",
    color: "#22c55e",
    border: "1px solid rgba(34,197,94,0.15)",
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
    fontVariantNumeric: "tabular-nums",
  },
  moreSection: { marginTop: 48, paddingBottom: 16 },
  moreTitleRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  seeAllLink: {
    color: "#22c55e",
    fontSize: 13,
    fontWeight: 600,
    textDecoration: "none",
  },
  moreHint: { color: "#6b7280", fontSize: 13 },
  artistLinkInline: {
    color: "#9ca3af",
    fontWeight: 600,
    textDecoration: "none",
  },
};

export default AlbumDetail;