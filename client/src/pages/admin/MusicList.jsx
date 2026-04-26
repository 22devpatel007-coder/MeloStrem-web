import { useState, useEffect, useCallback,useMemo  } from "react";
import { Link } from "react-router-dom";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import axiosInstance from "../../services/api";
import {
  extractSong as normalizeSong,
  bulkDeleteSongs,
} from "../../services/songs.service";
import { QUERY_KEYS } from "../../constants/queryKeys";
import Loader from "../../components/ui/Loader";
import EditSongModal from "../../components/admin/EditSongModal";

const fmtDuration = (secs) => {
  if (!secs && secs !== 0) return "—";
  const n = Number(secs);
  if (isNaN(n) || n <= 0) return "—";
  const m = Math.floor(n / 60);
  const s = Math.floor(n % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${s}`;
};

const MusicList = () => {
  const queryClient = useQueryClient(); // ← BUG-012 FIX
  const [songs, setSongs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const [editSong, setEditSong] = useState(null);
  const [featuringId, setFeaturingId] = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [bulkConfirm, setBulkConfirm] = useState(false);

  const allIds = useMemo(() => songs.map((s) => s.id), [songs]);
const allSelected = useMemo(
  () => allIds.length > 0 && allIds.every((id) => selectedIds.has(id)),
  [allIds, selectedIds]
);

  const toggleOne = useCallback((id) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelectedIds(allSelected ? new Set() : new Set(allIds));
  }, [allSelected, allIds]);

  const bulkDeleteMutation = useMutation({
    mutationFn: (ids) => bulkDeleteSongs(ids),
    onSuccess: (data, ids) => {
      setSongs((prev) => prev.filter((s) => !ids.includes(s.id)));
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SONGS] });
      setSelectedIds(new Set());
      setBulkConfirm(false);
    },
    onError: (err) => {
      console.error("Bulk delete failed:", err);
      setBulkConfirm(false);
    },
  });
  useEffect(() => {
    fetchSongs();
  }, []);

  const fetchSongs = async () => {
    try {
      const res = await axiosInstance.get("/songs?limit=200");
      const body = res?.data ?? {};
      const raw = Array.isArray(body)
        ? body
        : Array.isArray(body.songs)
          ? body.songs
          : [];
      setSongs(raw.map(normalizeSong).filter(Boolean));
    } catch (err) {
      console.error("Failed to fetch songs:", err);
    }
    setLoading(false);
  };

  const handleDelete = async (id) => {
    setDeletingId(id);
    try {
      await axiosInstance.delete(`/songs/${id}`);
      // Optimistic local update — removes the row immediately without a flash.
      setSongs((prev) => prev.filter((s) => s.id !== id));
      // BUG-012 FIX: Invalidate the shared React Query songs cache so that
      // Home, Search, and any other page that reads QUERY_KEYS.SONGS reflects
      // the deletion on their next render instead of serving stale data for
      // up to 2 minutes.
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SONGS] });
    } catch (err) {
      console.error("Delete failed:", err);
    }
    setDeletingId(null);
    setConfirmId(null);
  };

  const handleToggleFeatured = async (song) => {
    if (featuringId) return;
    setFeaturingId(song.id);
    // Optimistic toggle — flip the UI immediately.
    setSongs((prev) =>
      prev.map((s) => (s.id === song.id ? { ...s, featured: !s.featured } : s)),
    );
    try {
      await axiosInstance.patch(`/songs/${song.id}`, {
        featured: !song.featured,
      });
      // BUG-012 FIX: Invalidate the shared songs cache after a successful
      // featured toggle so the Home page featured carousel reflects the change
      // without waiting for the 2-minute staleTime to expire.
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.SONGS] });
    } catch (err) {
      // Revert optimistic update on failure.
      setSongs((prev) =>
        prev.map((s) =>
          s.id === song.id ? { ...s, featured: song.featured } : s,
        ),
      );
      console.error("Featured toggle failed:", err);
    }
    setFeaturingId(null);
  };

  const handleUpdated = (updatedSong) => {
    setSongs((prev) =>
      prev.map((s) => (s.id === updatedSong.id ? { ...s, ...updatedSong } : s)),
    );
  };

  if (loading) return <Loader />;

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <div>
          <h1 style={styles.heading}>Manage Songs</h1>
          <p style={styles.subheading}>{songs.length} tracks in library</p>
        </div>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {selectedIds.size > 0 &&
            (bulkConfirm ? (
              <>
                <span style={{ color: "#f87171", fontSize: 13 }}>
                  Delete {selectedIds.size} song
                  {selectedIds.size > 1 ? "s" : ""}?
                </span>
                <button
                  onClick={() => bulkDeleteMutation.mutate([...selectedIds])}
                  disabled={bulkDeleteMutation.isPending}
                  style={{
                    ...styles.btnDanger,
                    opacity: bulkDeleteMutation.isPending ? 0.6 : 1,
                  }}
                >
                  {bulkDeleteMutation.isPending ? "Deleting…" : "Confirm"}
                </button>
                <button
                  onClick={() => setBulkConfirm(false)}
                  style={styles.btnCancel}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <span style={{ color: "#9ca3af", fontSize: 13 }}>
                  {selectedIds.size} selected
                </span>
                <button
                  onClick={() => setBulkConfirm(true)}
                  style={styles.btnDelete}
                >
                  Delete Selected
                </button>
                <button
                  onClick={() => setSelectedIds(new Set())}
                  style={styles.btnCancel}
                >
                  Clear
                </button>
              </>
            ))}
          <Link to="/admin/bulk" style={styles.bulkBtn}>
            + Bulk Upload
          </Link>
        </div>
      </div>

      {songs.length === 0 ? (
        <div style={styles.empty}>
          <div style={styles.emptyIcon}>♪</div>
          <p style={styles.emptyTitle}>No songs yet</p>
          <p style={styles.emptyDesc}>
            Upload your first track from the admin dashboard.
          </p>
        </div>
      ) : (
        <div style={styles.table}>
          <div style={styles.tableHeader}>
            <div
              style={{
                width: 32,
                flex: "none",
                display: "flex",
                alignItems: "center",
              }}
            >
              <input
                type="checkbox"
                checked={allSelected}
                onChange={toggleAll}
                style={{ cursor: "pointer", accentColor: "#22c55e" }}
              />
            </div>
            <span style={{ ...styles.col, flex: 2 }}>Song</span>
            <span style={{ ...styles.col, flex: 1 }}>Artist</span>
            <span style={{ ...styles.col, flex: 1 }}>Genre</span>
            <span
              style={{
                ...styles.col,
                width: 56,
                flex: "none",
                textAlign: "center",
              }}
            >
              Dur.
            </span>
            <span
              style={{
                ...styles.col,
                width: 70,
                flex: "none",
                textAlign: "center",
              }}
            >
              ⭐
            </span>
            <span style={{ ...styles.col, width: 160, flex: "none" }}>
              Actions
            </span>
          </div>

          {songs.map((song) => (
            <div key={song.id} style={styles.tableRow}>
              <div
                style={{
                  width: 32,
                  flex: "none",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(song.id)}
                  onChange={() => toggleOne(song.id)}
                  style={{ cursor: "pointer", accentColor: "#22c55e" }}
                />
              </div>
              <div style={{ ...styles.cellFlex, flex: 2, minWidth: 0 }}>
                <img
                  src={song.coverUrl}
                  alt={song.title}
                  style={styles.cover}
                  onError={(e) => {
                    e.target.src = "https://placehold.co/40x40/111/555?text=♪";
                  }}
                />
                <span style={styles.songTitle}>{song.title}</span>
              </div>
              <span style={{ ...styles.cellText, flex: 1, color: "#9ca3af" }}>
                {song.artist}
              </span>
              <div style={{ flex: 1 }}>
                <span style={styles.badge}>{song.genre}</span>
              </div>
              <span
                style={{
                  width: 56,
                  flex: "none",
                  color: "#6b7280",
                  fontSize: 12,
                  textAlign: "center",
                }}
              >
                {fmtDuration(song.duration)}
              </span>
              <div
                style={{
                  width: 70,
                  flex: "none",
                  display: "flex",
                  justifyContent: "center",
                }}
              >
                <button
                  onClick={() => handleToggleFeatured(song)}
                  disabled={!!featuringId}
                  style={{
                    ...styles.starBtn,
                    color: song.featured ? "#f59e0b" : "#4b5563",
                    opacity: featuringId === song.id ? 0.5 : 1,
                  }}
                >
                  <StarIcon filled={song.featured} />
                </button>
              </div>
              <div
                style={{
                  width: 160,
                  flex: "none",
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                <button
                  onClick={() => setEditSong(song)}
                  style={styles.btnEdit}
                >
                  Edit
                </button>
                {confirmId === song.id ? (
                  <>
                    <button
                      onClick={() => handleDelete(song.id)}
                      disabled={deletingId === song.id}
                      style={{
                        ...styles.btnDanger,
                        opacity: deletingId === song.id ? 0.6 : 1,
                      }}
                    >
                      {deletingId === song.id ? "…" : "Confirm"}
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      style={styles.btnCancel}
                    >
                      ✕
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => setConfirmId(song.id)}
                    style={styles.btnDelete}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {editSong && (
        <EditSongModal
          song={editSong}
          onClose={() => setEditSong(null)}
          onUpdated={(updated) => {
            handleUpdated(updated);
            setEditSong(null);
          }}
        />
      )}
    </div>
  );
};

const StarIcon = ({ filled }) => (
  <svg
    width="16"
    height="16"
    viewBox="0 0 24 24"
    fill={filled ? "currentColor" : "none"}
    stroke="currentColor"
    strokeWidth="1.8"
  >
    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
  </svg>
);

const styles = {
  container: {
    maxWidth: "1100px",
    margin: "0 auto",
    padding: "32px 20px 80px",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 12,
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
  bulkBtn: {
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    color: "#9ca3af",
    textDecoration: "none",
    borderRadius: 8,
    padding: "8px 16px",
    fontSize: 13,
    fontWeight: 500,
    flexShrink: 0,
  },
  table: {
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    borderRadius: 12,
    overflow: "hidden",
  },
  tableHeader: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 16px",
    borderBottom: "1px solid #2d2d2d",
  },
  col: {
    color: "#4b5563",
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  tableRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderBottom: "1px solid #1f1f1f",
    transition: "background 0.15s",
  },
  cellFlex: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
    overflow: "hidden",
  },
  cellText: {
    fontSize: 13,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  cover: {
    width: 38,
    height: 38,
    borderRadius: 6,
    objectFit: "cover",
    background: "#111",
    flexShrink: 0,
  },
  songTitle: {
    color: "#fff",
    fontSize: 13,
    fontWeight: 500,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  badge: {
    background: "rgba(34,197,94,0.1)",
    color: "#22c55e",
    border: "1px solid rgba(34,197,94,0.2)",
    borderRadius: 4,
    padding: "2px 8px",
    fontSize: 11,
    fontWeight: 500,
  },
  starBtn: {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "color 0.15s",
    borderRadius: 4,
  },
  btnEdit: {
    background: "rgba(59,130,246,0.1)",
    color: "#60a5fa",
    border: "1px solid rgba(59,130,246,0.2)",
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  btnDelete: {
    background: "rgba(239,68,68,0.1)",
    color: "#f87171",
    border: "1px solid rgba(239,68,68,0.2)",
    borderRadius: 6,
    padding: "5px 12px",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  btnDanger: {
    background: "#ef4444",
    color: "#fff",
    border: "none",
    borderRadius: 6,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 600,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  btnCancel: {
    background: "#2d2d2d",
    color: "#9ca3af",
    border: "none",
    borderRadius: 6,
    padding: "5px 10px",
    fontSize: 12,
    fontWeight: 500,
    cursor: "pointer",
    fontFamily: "inherit",
  },
  empty: { textAlign: "center", padding: "80px 20px" },
  emptyIcon: {
    width: 56,
    height: 56,
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    borderRadius: 14,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 22,
    margin: "0 auto 16px",
  },
  emptyTitle: { color: "#fff", fontSize: 16, fontWeight: 600, marginBottom: 6 },
  emptyDesc: { color: "#6b7280", fontSize: 13 },
};

export default MusicList;
