/**
 * client/src/pages/PlaylistDetail.jsx
 *
 * PHASE 4 — TASK 4.4 AUDIT: Replace raw error string renders.
 *
 * WHAT CHANGED (surgical — only error states):
 *
 *   1. Imported ErrorState from components/errors/ErrorState.
 *
 *   2. songsError block — was: plain <div style={styles.errorWrap}>
 *      with hardcoded <p> strings + a Retry button.
 *      Now: <ErrorState variant="page" ...> — consistent error UI.
 *      The handleRetry callback is passed as onAction — no logic change.
 *
 *   3. Removed now-unused styles: errorWrap, errorTitle, errorSub, retryBtn.
 *      These were only used by the old error block.
 *
 * WHAT DID NOT CHANGE:
 *   - All playlist header JSX — 100% identical
 *   - Song list rendering — 100% identical
 *   - handlePlayAll, handleShufflePlay, handlePlaySong — identical
 *   - handleMoveUp, handleMoveDown, handleSaveEdit — identical
 *   - handleRetry logic — identical (passed as onAction to ErrorState)
 *   - useParams, usePlaylists, usePlayerStore, useAuthStore — identical
 *   - All useEffect hooks — identical
 *   - orderedSongs / isReadOnly computation — identical
 *   - All remaining styles — identical
 *   - PERMANENT FIX comment (Navbar removed) — preserved
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useParams } from "react-router-dom";
import {
  useUserPlaylists,
  useAdminPlaylists,
  usePlaylistMutations,
} from "../hooks/usePlaylists";
import { usePlayerStore } from "../store/playerStore";
import { useAuthStore } from "../store/authStore";
import { getPlaylistSongsPaged } from "../services/playlists.service";
import Loader from "../components/ui/Loader";
import ErrorState from "../components/errors/ErrorState";

const PlaylistDetail = () => {
  const { id } = useParams();
  const { adminPlaylists } = useAdminPlaylists();
  const { playlists } = useUserPlaylists();
  const { removeSongFromPlaylist, reorderSongs, updatePlaylist } =
    usePlaylistMutations();
  const {
    currentSong,
    setPlaybackContext,
    logPick,
    currentSong: prevSong,
  } = usePlayerStore();
  const { user } = useAuthStore();

  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState("");
  const [songs, setSongs] = useState([]);
const [songsLoading, setSongsLoading] = useState(true);
const [songsError, setSongsError] = useState(null);
const [page, setPage] = useState(0);
const [hasMore, setHasMore] = useState(false);
const [loadingMore, setLoadingMore] = useState(false);
const PAGE_LIMIT = 20;;
const sentinelRef = useRef(null);

  const playlist = useMemo(
    () =>
      playlists.find((p) => p.id === id) ||
      adminPlaylists.find((p) => p.id === id) ||
      null,
    [playlists, adminPlaylists, id],
  );

  useEffect(() => {
    if (playlist) setEditName(playlist.name);
  }, [playlist]);

 useEffect(() => {
    if (!playlist?.songIds?.length) {
      setSongs([]);
      setSongsLoading(false);
      setHasMore(false);
      return;
    }
    setSongsLoading(true);
    setSongsError(null);
    setPage(0);
    setSongs([]);
    getPlaylistSongsPaged(playlist.songIds, 0, PAGE_LIMIT)
      .then(({ songs: fetched, hasMore: more }) => {
        setSongs(fetched);
        setHasMore(more);
        setPage(1);
      })
      .catch((err) => {
        console.error("[PlaylistDetail] getPlaylistSongsPaged error:", err.message);
        setSongsError("Could not load songs for this playlist. Please try again.");
      })
      .finally(() => setSongsLoading(false));
  }, [playlist?.songIds?.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  const orderedSongs = useMemo(() => {
    if (!songs.length) return [];
    return songs;
  }, [songs]);

  const isReadOnly = playlist?.isAdmin === true;

  const handlePlayAll = useCallback(() => {
    if (!orderedSongs.length) return;
    setPlaybackContext("playlist", id, orderedSongs, 0);
  }, [orderedSongs, id, setPlaybackContext]);

  const handleShufflePlay = useCallback(() => {
    if (!orderedSongs.length) return;
    usePlayerStore.getState().cycleShuffleMode();
    setPlaybackContext("playlist", id, orderedSongs, 0);
  }, [orderedSongs, id, setPlaybackContext]);

  const handlePlaySong = useCallback(
    (song, index) => {
      logPick(song, prevSong, user?.uid);
      setPlaybackContext("playlist", id, orderedSongs, index);
    },
    [orderedSongs, id, setPlaybackContext, logPick, prevSong, user?.uid],
  );

  const handleMoveUp = async (index) => {
    if (index === 0 || isReadOnly) return;
    const newIds = [...playlist.songIds];
    [newIds[index - 1], newIds[index]] = [newIds[index], newIds[index - 1]];
    await reorderSongs(id, newIds);
  };

  const handleMoveDown = async (index) => {
    if (index === playlist.songIds.length - 1 || isReadOnly) return;
    const newIds = [...playlist.songIds];
    [newIds[index], newIds[index + 1]] = [newIds[index + 1], newIds[index]];
    await reorderSongs(id, newIds);
  };

  const handleSaveEdit = async () => {
    if (!editName.trim() || isReadOnly) return;
    await updatePlaylist(id, { name: editName.trim() });
    setEditMode(false);
  };

  // ── handleRetry — identical logic, passed as onAction to ErrorState ─────────
  const handleRetry = useCallback(() => {
    setSongsError(null);
    setSongsLoading(true);
    setPage(0);
    setSongs([]);
    getPlaylistSongsPaged(playlist.songIds, 0, PAGE_LIMIT)
      .then(({ songs: fetched, hasMore: more }) => {
        setSongs(fetched);
        setHasMore(more);
        setPage(1);
      })
      .catch((err) => {
        console.error("[PlaylistDetail] retry error:", err.message);
        setSongsError("Could not load songs for this playlist. Please try again.");
      })
      .finally(() => setSongsLoading(false));
  }, [playlist?.songIds]); // eslint-disable-line react-hooks/exhaustive-deps

const handleLoadMore = useCallback(() => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    getPlaylistSongsPaged(playlist.songIds, page, PAGE_LIMIT)
      .then(({ songs: fetched, hasMore: more }) => {
        setSongs((prev) => [...prev, ...fetched]);
        setHasMore(more);
        setPage((p) => p + 1);
      })
      .catch((err) => {
        console.error("[PlaylistDetail] loadMore error:", err.message);
      })
      .finally(() => setLoadingMore(false));
  }, [playlist?.songIds, page, hasMore, loadingMore]);

  useEffect(() => {
    if (!sentinelRef.current) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore) {
          handleLoadMore();
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -100px 0px" }
    );
    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, handleLoadMore]);

  if (!playlist || songsLoading) return <Loader />;
  // ── TASK 4.4: Songs error — replaced with ErrorState ──────────────────────
  if (songsError) {
    return (
      <ErrorState
        variant="page"
        title="Could not load songs"
        message="Could not load songs for this playlist. Please try again."
        actionLabel="Retry"
        onAction={handleRetry}
        showHomeButton={true}
      />
    );
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <div style={styles.coverWrap}>
          {playlist.coverUrl ? (
            <img
              src={playlist.coverUrl}
              alt={playlist.name}
              style={styles.cover}
              onError={(e) => {
                e.target.src = "https://placehold.co/160x160/1a1a1a/555?text=♪";
              }}
            />
          ) : (
            <div style={styles.coverPlaceholder}>♪</div>
          )}
        </div>

        <div style={styles.meta}>
          <div style={styles.typeRow}>
            <span style={styles.type}>Playlist</span>
            {isReadOnly && <span style={styles.libraryBadge}>Library</span>}
          </div>

          {!isReadOnly && editMode ? (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <input
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                style={styles.editInput}
                autoFocus
              />
              <button onClick={handleSaveEdit} style={styles.saveBtn}>
                Save
              </button>
              <button
                onClick={() => setEditMode(false)}
                style={styles.cancelBtn}
              >
                Cancel
              </button>
            </div>
          ) : (
            <h1
              style={styles.name}
              onDoubleClick={() => !isReadOnly && setEditMode(true)}
              title={isReadOnly ? "" : "Double-click to rename"}
            >
              {playlist.name}
            </h1>
          )}

          {playlist.description && (
            <p style={styles.desc}>{playlist.description}</p>
          )}
          <p style={styles.count}>{orderedSongs.length} songs</p>

          {orderedSongs.length > 0 && (
            <div style={styles.controls}>
              <button style={styles.playBtn} onClick={handlePlayAll}>
                ▶ Play
              </button>
              <button style={styles.shuffleBtn} onClick={handleShufflePlay}>
                ⇌ Shuffle
              </button>
            </div>
          )}
        </div>
      </div>

      <div style={styles.divider} />

      {orderedSongs.length === 0 ? (
        <p style={styles.empty}>No songs in this playlist yet.</p>
      ) : (
        <div>
          {orderedSongs.map((song, index) => {
            const isActive = currentSong?.id === song.id;
            return (
              <div
                key={song.id}
                style={{
                  ...styles.songRow,
                  background: isActive ? "rgba(34,197,94,0.06)" : "transparent",
                }}
              >
                <span style={styles.rowNum}>{isActive ? "♪" : index + 1}</span>
                <img
                  src={
                    song.coverUrl || "https://placehold.co/40x40/111/555?text=♪"
                  }
                  alt={song.title}
                  style={styles.songCover}
                  onClick={() => handlePlaySong(song, index)}
                  onError={(e) => {
                    e.target.src = "https://placehold.co/40x40/111/555?text=♪";
                  }}
                />
                <div
                  style={styles.songInfo}
                  onClick={() => handlePlaySong(song, index)}
                >
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
                  <span style={styles.songGenre}>{song.tags[0]}</span>
                )}
                {!isReadOnly && (
                  <>
                    <div style={styles.reorderBtns}>
                      <button
                        onClick={() => handleMoveUp(index)}
                        style={styles.arrowBtn}
                        disabled={index === 0}
                      >
                        ↑
                      </button>
                      <button
                        onClick={() => handleMoveDown(index)}
                        style={styles.arrowBtn}
                        disabled={index === orderedSongs.length - 1}
                      >
                        ↓
                      </button>
                    </div>
                    <button
                      onClick={() => removeSongFromPlaylist(id, song.id)}
                      style={styles.removeBtn}
                    >
                      ✕
                    </button>
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div ref={sentinelRef} style={{ height: 32 }} />
      {loadingMore && (
        <div style={{ textAlign: "center", padding: "12px 0", color: "#6b7280", fontSize: 13 }}>
          Loading…
        </div>
      )}
    </div>
  );
};

const styles = {
  container: {
    maxWidth: "1000px",
    margin: "0 auto",
    padding: "36px 20px 0",
    fontFamily: "'Inter', sans-serif",
  },
  header: {
    display: "flex",
    gap: 32,
    alignItems: "flex-start",
    flexWrap: "wrap",
    marginBottom: 28,
  },
  coverWrap: { flexShrink: 0 },
  cover: {
    width: 160,
    height: 160,
    borderRadius: 12,
    objectFit: "cover",
    background: "#1a1a1a",
    boxShadow: "0 12px 40px rgba(0,0,0,0.5)",
  },
  coverPlaceholder: {
    width: 160,
    height: 160,
    borderRadius: 12,
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 48,
    color: "#4b5563",
  },
  meta: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    paddingTop: 8,
  },
  typeRow: { display: "flex", alignItems: "center", gap: 8 },
  type: {
    color: "#22c55e",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "1px",
  },
  libraryBadge: {
    background: "rgba(34,197,94,0.1)",
    color: "#22c55e",
    border: "1px solid rgba(34,197,94,0.2)",
    borderRadius: 4,
    padding: "2px 8px",
    fontSize: 10,
    fontWeight: 700,
  },
  name: {
    color: "#fff",
    fontSize: 28,
    fontWeight: 700,
    letterSpacing: "-0.5px",
  },
  desc: { color: "#9ca3af", fontSize: 14 },
  count: { color: "#6b7280", fontSize: 13 },
  editInput: {
    background: "#111",
    border: "1px solid #22c55e",
    borderRadius: 8,
    padding: "8px 12px",
    color: "#fff",
    fontSize: 22,
    fontWeight: 700,
    outline: "none",
    fontFamily: "inherit",
  },
  saveBtn: {
    background: "#22c55e",
    color: "#000",
    border: "none",
    borderRadius: 8,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  cancelBtn: {
    background: "#2d2d2d",
    color: "#9ca3af",
    border: "none",
    borderRadius: 8,
    padding: "8px 16px",
    fontSize: 13,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  controls: { display: "flex", gap: 10, marginTop: 8 },
  playBtn: {
    background: "#22c55e",
    color: "#000",
    border: "none",
    borderRadius: 8,
    padding: "10px 24px",
    fontSize: 14,
    fontWeight: 700,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  shuffleBtn: {
    background: "#1a1a1a",
    color: "#9ca3af",
    border: "1px solid #2d2d2d",
    borderRadius: 8,
    padding: "10px 24px",
    fontSize: 14,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  divider: { height: 1, background: "#2d2d2d", marginBottom: 20 },
  empty: {
    color: "#6b7280",
    fontSize: 14,
    padding: "40px 0",
    textAlign: "center",
  },
  songRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 12px",
    borderRadius: 8,
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
    cursor: "pointer",
  },
  songInfo: { flex: 1, minWidth: 0, cursor: "pointer" },
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
  },
  songGenre: {
    background: "rgba(34,197,94,0.1)",
    color: "#22c55e",
    border: "1px solid rgba(34,197,94,0.2)",
    borderRadius: 4,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 500,
    flexShrink: 0,
  },
  reorderBtns: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
    flexShrink: 0,
  },
  arrowBtn: {
    background: "none",
    border: "none",
    color: "#6b7280",
    cursor: "pointer",
    fontSize: 12,
    padding: "1px 4px",
    lineHeight: 1,
    fontFamily: "inherit",
  },
  removeBtn: {
    background: "none",
    border: "none",
    color: "#4b5563",
    cursor: "pointer",
    fontSize: 14,
    padding: "4px 6px",
    flexShrink: 0,
    fontFamily: "inherit",
  },
};

export default PlaylistDetail;