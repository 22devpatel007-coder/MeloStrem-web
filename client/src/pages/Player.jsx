import { useEffect, useMemo } from "react";
import { useParams } from "react-router-dom";
import { useSongs } from "../hooks/useSongs";
import { usePlayerStore } from "../store/playerStore";
import Navbar from "../components/layout/Navbar";
import Loader from "../components/ui/Loader";

const Player = () => {
  const { id } = useParams();
  const { data, isLoading: loading } = useSongs();
  const songs = useMemo(() => data?.pages?.flatMap((p) => p.songs) || [], [data]);
  const { playSong, togglePlay, isPlaying, currentSong } = usePlayerStore();

  const song = useMemo(
    () => songs.find((s) => s.id === id) || null,
    [songs, id],
  );

  useEffect(() => {
    if (song) playSong(song);
    // playSong is stable (useCallback in PlayerActionsContext) — safe to include.
    // song identity changes only when the route id or songs list changes.
  }, [song, playSong]);

  if (loading) return <Loader />;

  if (!song)
    return (
      <div
        style={{
          ...styles.page,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          gap: 12,
        }}
      >
        <Navbar />
        <p style={{ color: "#6b7280", fontSize: "15px" }}>Song not found.</p>
      </div>
    );

  const active = currentSong?.id === song.id;

  return (
    <div style={styles.page}>
      <Navbar />
      <div style={styles.container}>
        <div style={styles.card}>
          <img
            src={song.coverUrl}
            alt={song.title}
            style={styles.cover}
            onError={(e) => {
              e.target.src = "https://placehold.co/280x280/1a1a1a/555?text=♪";
            }}
          />
          <div style={styles.info}>
            <span style={styles.genre}>{song.genre}</span>
            <h1 style={styles.title}>{song.title}</h1>
            <p style={styles.artist}>{song.artist}</p>
            <button onClick={togglePlay} style={styles.playBtn}>
              {isPlaying && active ? (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#000">
                    <rect x="6" y="5" width="4" height="14" rx="1" />
                    <rect x="14" y="5" width="4" height="14" rx="1" />
                  </svg>
                  Pause
                </>
              ) : (
                <>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="#000">
                    <path d="M8 5.14v14l11-7-11-7z" />
                  </svg>
                  Play
                </>
              )}
            </button>
          </div>
        </div>
      </div>
      <div style={{ height: 88 }} />
    </div>
  );
};

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0f0f0f",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  container: {
    maxWidth: "700px",
    margin: "0 auto",
    padding: "48px 20px",
    display: "flex",
    justifyContent: "center",
  },
  card: {
    display: "flex",
    gap: "36px",
    alignItems: "flex-start",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  cover: {
    width: "240px",
    height: "240px",
    borderRadius: "14px",
    objectFit: "cover",
    background: "#1a1a1a",
    boxShadow: "0 16px 48px rgba(0,0,0,0.5)",
    flexShrink: 0,
  },
  info: {
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    paddingTop: "8px",
    minWidth: "200px",
  },
  genre: {
    background: "rgba(34,197,94,0.1)",
    color: "#22c55e",
    border: "1px solid rgba(34,197,94,0.2)",
    borderRadius: "5px",
    padding: "3px 10px",
    fontSize: "11px",
    fontWeight: "500",
    alignSelf: "flex-start",
  },
  title: {
    color: "#fff",
    fontSize: "26px",
    fontWeight: "700",
    letterSpacing: "-0.5px",
    lineHeight: 1.2,
  },
  artist: { color: "#9ca3af", fontSize: "15px" },
  playBtn: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    background: "#22c55e",
    color: "#000",
    border: "none",
    borderRadius: "8px",
    padding: "12px 24px",
    fontSize: "14px",
    fontWeight: "700",
    cursor: "pointer",
    marginTop: "12px",
    alignSelf: "flex-start",
    transition: "background 0.2s",
    fontFamily: "inherit",
  },
};

export default Player;