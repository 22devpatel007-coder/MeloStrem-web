import { useState } from "react";
import { usePlayerStore } from "../../store/playerStore";
import { useQueueStore } from "../../store/queueStore";
import { useAuthStore } from "../../store/authStore";
// ✅ FIX Bug 8: Previously imported BOTH useLikedSongs AND useToggleLikeSong
// — two separate hooks both firing Firestore reads per card.
// With 30 cards on screen = 60 Firestore reads just to show the page.
//
// Fix: use only useLikedSongs — it already has optimistic toggle built in.
// Remove useToggleLikeSong entirely from this file.
import { useLikedSongs } from "../../hooks/useLikedSongs";
import { formatDuration } from "../../utils/formatters";
import AddToPlaylist from "../playlists/AddToPlaylist";

const SongCard = ({ song, songList }) => {
  const { playSong, currentSong, isPlaying } = usePlayerStore();
  const { setQueue }                          = useQueueStore();
  const { user: currentUser }                 = useAuthStore();

  // ✅ Single hook — handles both reading liked state AND toggling
  // toggleLike(songId) has optimistic update built in — heart flips instantly
  const { likedSongs = [], toggleLike } = useLikedSongs(currentUser?.uid);

  const [hovered,         setHovered]  = useState(false);
  const [liking,          setLiking]   = useState(false);
  const [showAddToPlaylist, setShowAdd] = useState(false);

  const isActive = currentSong?.id === song.id;
  const isLiked  = likedSongs.includes(song.id);
  const dur      = formatDuration(song.duration);

  const handlePlay = (e) => {
    e.stopPropagation();
    const idx = songList ? songList.findIndex((s) => s.id === song.id) : 0;
    if (songList) {
      // Pass correct index so the right song plays (fixes Bug 2)
      setQueue(songList, idx !== -1 ? idx : 0);
    } else {
      playSong(song, [song]);
    }
  };

  const handleLike = async (e) => {
    e.stopPropagation();
    if (!currentUser || liking) return;
    setLiking(true);
    try {
      // ✅ toggleLike just needs songId — no { uid, songId } object needed
      // Optimistic update in useLikedSongs flips the heart instantly
      await toggleLike(song.id);
    } catch (err) {
      console.error("Like failed:", err.message || err);
    } finally {
      // ✅ Use finally so liking resets even if toggleLike throws
      setLiking(false);
    }
  };

  return (
    <div
      onClick={handlePlay}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        ...styles.card,
        outline:    isActive ? "2px solid #22c55e" : "2px solid transparent",
        background: hovered ? "#222" : "#1a1a1a",
        cursor:     "pointer",
      }}
    >
      {/* Cover image */}
      <div style={styles.imgWrap}>
        <img
          src={song.coverUrl || "https://placehold.co/200x200/1a1a1a/555?text=♪"}
          alt={song.title}
          style={styles.img}
          onError={(e) => {
            e.target.src = "https://placehold.co/200x200/1a1a1a/555?text=♪";
          }}
        />

        {/* Like button */}
        <button
          onClick={handleLike}
          disabled={liking}
          style={{
            ...styles.likeBtn,
            opacity: hovered || isLiked ? 1 : 0,
            color:   isLiked ? "#f43f5e" : "#fff",
          }}
          title={isLiked ? "Unlike" : "Like"}
        >
          <HeartIcon filled={isLiked} />
        </button>

        {/* Add to playlist */}
        <button
          onClick={(e) => { e.stopPropagation(); setShowAdd(true); }}
          style={{ ...styles.menuBtn, opacity: hovered ? 1 : 0 }}
          title="Add to playlist"
        >
          +
        </button>

        {/* Play overlay */}
        <div
          style={{
            ...styles.overlay,
            opacity: hovered || (isActive && isPlaying) ? 1 : 0,
          }}
        >
          <div style={styles.playBtn}>
            {isActive && isPlaying ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#000">
                <rect x="6" y="5" width="4" height="14" rx="1" />
                <rect x="14" y="5" width="4" height="14" rx="1" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#000">
                <path d="M8 5.14v14l11-7-11-7z" />
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* Info */}
      <div style={styles.info}>
        <p style={styles.title}>{song.title}</p>
        <p style={styles.artist}>{song.artist}</p>
        <div style={styles.footer}>
          {/* ✅ FIX Bug 17: previously always rendered genre span even when
              song.genre is undefined — showing an empty green badge.
              Now only renders when genre has a value. */}
          {song.genre && (
            <span style={styles.genre}>{song.genre}</span>
          )}
          {dur && dur !== "0:00" && (
            <span style={styles.dur}>{dur}</span>
          )}
          {song.featured && (
            <span style={styles.featuredBadge} title="Featured">⭐</span>
          )}
        </div>
      </div>

      {showAddToPlaylist && (
        <AddToPlaylist song={song} onClose={() => setShowAdd(false)} />
      )}
    </div>
  );
};

/* ── Icons ──────────────────────────────────────────────────────────────────── */
const HeartIcon = ({ filled }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </svg>
);

/* ── Styles ─────────────────────────────────────────────────────────────────── */
const styles = {
  card: {
    background:  "#1a1a1a",
    border:      "1px solid #2d2d2d",
    borderRadius: "12px",
    overflow:    "hidden",
    transition:  "background 0.2s, outline 0.2s",
    fontFamily:  "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  imgWrap:  { position: "relative", width: "100%", paddingBottom: "100%", background: "#111" },
  img:      { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "cover" },
  likeBtn:  {
    position: "absolute", top: 8, right: 8,
    background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%",
    width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", transition: "opacity 0.2s, color 0.2s", zIndex: 2,
    backdropFilter: "blur(4px)",
  },
  overlay:  {
    position: "absolute", inset: 0,
    background: "rgba(0,0,0,0.45)",
    display: "flex", alignItems: "center", justifyContent: "center",
    transition: "opacity 0.2s",
  },
  playBtn:  {
    width: 44, height: 44, background: "#22c55e", borderRadius: "50%",
    display: "flex", alignItems: "center", justifyContent: "center",
    boxShadow: "0 4px 16px rgba(34,197,94,0.4)",
  },
  info:     { padding: "12px 14px 14px" },
  title:    { color: "#fff", fontSize: 14, fontWeight: 600, marginBottom: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  artist:   { color: "#6b7280", fontSize: 12, marginBottom: 8, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  footer:   { display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" },
  genre:    { background: "rgba(34,197,94,0.1)", color: "#22c55e", border: "1px solid rgba(34,197,94,0.2)", borderRadius: 4, padding: "2px 8px", fontSize: 11, fontWeight: 500 },
  dur:      { color: "#4b5563", fontSize: 11 },
  featuredBadge: { fontSize: 11, lineHeight: 1 },
  menuBtn:  {
    position: "absolute", bottom: 8, left: 8,
    background: "rgba(0,0,0,0.6)", border: "none", borderRadius: "50%",
    width: 30, height: 30, display: "flex", alignItems: "center", justifyContent: "center",
    cursor: "pointer", color: "#fff", fontSize: 18, transition: "opacity 0.2s", zIndex: 2,
    backdropFilter: "blur(4px)", fontFamily: "inherit", lineHeight: 1,
  },
};

export default SongCard;