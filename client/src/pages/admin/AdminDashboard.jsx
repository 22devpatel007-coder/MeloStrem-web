/**
 * client/src/pages/admin/AdminDashboard.jsx
 *
 * BUG-012 FIX — Replaced raw axios song fetch with React Query useQuery.
 *
 * WHAT CHANGED vs previous version:
 *   1. Imported useQuery from @tanstack/react-query.
 *   2. Imported QUERY_KEYS from constants/queryKeys.
 *   3. Imported getSongs from songs.service.js (same service used by useSongs hook).
 *   4. Replaced the manual axiosInstance.get("/songs?limit=200") + setSongs()
 *      pattern with a useQuery({ queryKey: [QUERY_KEYS.SONGS], queryFn }) call.
 *      This plugs AdminDashboard into the shared React Query cache so that:
 *        a. After UploadMusic or BulkUpload invalidates QUERY_KEYS.SONGS, the
 *           dashboard stats (total songs, genre breakdown, recent uploads) refresh
 *           automatically on the next navigation — no stale counts.
 *        b. The dashboard no longer has a private copy of songs data that goes
 *           stale silently. It reads from the same cache as MusicList and Home.
 *   5. Users fetch (GET /api/users) stays as a raw axios call — users are not
 *      mutated by any admin page in the current feature set, so no stale risk.
 *   6. Removed now-unused setSongs/setStats/setLoading local state for songs —
 *      derived directly from useQuery result instead.
 *
 * WHAT DID NOT CHANGE:
 *   - All chart components and recharts usage — identical
 *   - buildMonthlyData helper — identical
 *   - StatCard, ActionLink, icon components — identical
 *   - All styles — identical
 *   - Users fetch logic — identical
 */

import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query"; // ← BUG-012 FIX
import axiosInstance from "../../services/api";
import { extractSong as normalizeSong } from "../../services/songs.service";
import { QUERY_KEYS } from "../../constants/queryKeys";
import { useAdminPlaylists } from "../../hooks/usePlaylists";
import { LinkIcon as HeroLinkIcon } from "@heroicons/react/24/outline";
import { usePlaylists } from "../../hooks/usePlaylists";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  CartesianGrid,
} from "recharts";

const COLORS = [
  "#22c55e",
  "#3b82f6",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#ec4899",
  "#14b8a6",
];

const AdminDashboard = () => {
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(true);
  const [deletingId, setDeletingId] = useState(null);
  const [confirmId, setConfirmId] = useState(null);
  const { adminPlaylists, isLoading: playlistsLoading } = useAdminPlaylists();
  const { deletePlaylist } = usePlaylists();
  // BUG-012 FIX: Use React Query for songs so this component participates in
  // the shared cache. When UploadMusic/BulkUpload/MusicList invalidate
  // QUERY_KEYS.SONGS, this query refetches automatically — the dashboard stats
  // (total songs count, genre breakdown, recent uploads list) stay accurate.
  const { data: songsData, isLoading: songsLoading } = useQuery({
    queryKey: [QUERY_KEYS.SONGS, "admin-list"],
    queryFn: async () => {
      let allSongs = [];
      let cursor = null;
      let hasMore = true;
      while (hasMore) {
        const url = cursor
          ? `/songs?limit=50&cursor=${cursor}`
          : `/songs?limit=50`;
        const res = await axiosInstance.get(url);
        const body = res?.data ?? {};
        const page = Array.isArray(body.songs) ? body.songs : [];
        allSongs = [...allSongs, ...page.map(normalizeSong).filter(Boolean)];
        cursor = body.nextCursor ?? null;
        hasMore = !!body.hasMore && !!cursor;
      }
      return allSongs;
    },
    // staleTime is 0 for QUERY_KEYS.SONGS (set via setQueryDefaults in App.jsx),
    // so this will always refetch when the query is invalidated by a mutation.
  });

  const songs = Array.isArray(songsData) ? songsData : [];

  // Users fetch stays as a direct call — not mutated by any current admin flow.
  const handleDeletePlaylist = (id) => {
    deletePlaylist(id, {
      onSuccess: () => setConfirmId(null),
      onError: () => setConfirmId(null),
    });
    setDeletingId(id);
  };
  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const usersRes = await axiosInstance.get("/users");
        const body = usersRes?.data ?? {};
        setUsers(
          Array.isArray(body)
            ? body
            : Array.isArray(body.users)
              ? body.users
              : Array.isArray(body.data)
                ? body.data
                : [],
        );
      } catch (err) {
        console.error("Failed to fetch users:", err);
      }
      setUsersLoading(false);
    };
    fetchUsers();
  }, []);

  const loading = songsLoading || usersLoading;

  const topSongs = [...songs]
    .sort((a, b) => (b.playCount || 0) - (a.playCount || 0))
    .slice(0, 8)
    .map((s) => ({
      name: s.title.length > 14 ? s.title.slice(0, 14) + "…" : s.title,
      plays: s.playCount || 0,
    }));

  const genreMap = {};
  songs.forEach((s) => {
    if (s.genre) genreMap[s.genre] = (genreMap[s.genre] || 0) + 1;
  });
  const genreData = Object.entries(genreMap).map(([name, value]) => ({
    name,
    value,
  }));

  const uploadsByMonth = buildMonthlyData(songs, "createdAt", "uploads");
  const usersByMonth = buildMonthlyData(users, "createdAt", "users");

  return (
    <div style={styles.container}>
      <div style={styles.pageHeader}>
        <h1 style={styles.heading}>Dashboard</h1>
        <p style={styles.subheading}>Overview of your MeloStream platform</p>
      </div>

      <div style={styles.statsRow}>
        <StatCard
          label="Total Songs"
          value={loading ? "…" : songs.length}
          icon={<MusicIcon />}
          color="#22c55e"
        />
        <StatCard
          label="Registered Users"
          value={loading ? "…" : users.length}
          icon={<UsersIcon />}
          color="#3b82f6"
        />
        <StatCard
          label="Total Plays"
          value={
            loading ? "…" : songs.reduce((a, s) => a + (s.playCount || 0), 0)
          }
          icon={<PlayIcon />}
          color="#f59e0b"
        />
        <StatCard
          label="Genres"
          value={loading ? "…" : Object.keys(genreMap).length}
          icon={<TagIcon />}
          color="#8b5cf6"
        />
      </div>
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Admin Playlists</h2>
        {playlistsLoading ? (
          <p style={{ color: "#6b7280", fontSize: 13 }}>Loading playlists…</p>
        ) : adminPlaylists.length === 0 ? (
          <p style={{ color: "#6b7280", fontSize: 13 }}>
            No admin playlists yet.
          </p>
        ) : (
          <div style={styles.recentList}>
            {adminPlaylists.map((pl) => (
              <div key={pl.id} style={styles.recentItem}>
                <img
                  src={
                    pl.coverUrl || "https://placehold.co/40x40/111/555?text=♪"
                  }
                  alt={pl.name}
                  style={styles.recentCover}
                  onError={(e) => {
                    e.target.src = "https://placehold.co/40x40/111/555?text=♪";
                  }}
                />
                <div style={styles.recentInfo}>
                  <p style={styles.recentTitle}>{pl.name}</p>
                  <p style={styles.recentArtist}>
                    {pl.songIds?.length ?? 0} songs
                  </p>
                </div>
                {confirmId === pl.id ? (
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      onClick={() => handleDeletePlaylist(pl.id)}
                      disabled={deletingId === pl.id}
                      style={styles.btnDanger}
                    >
                      {deletingId === pl.id ? "Deleting…" : "Confirm"}
                    </button>
                    <button
                      onClick={() => setConfirmId(null)}
                      style={styles.btnGhost}
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmId(pl.id)}
                    style={styles.btnDanger}
                  >
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div style={styles.section}>
        <h2 style={styles.sectionTitle}>Quick Actions</h2>
        <div style={styles.actionsRow}>
          <ActionLink
            to="/admin/upload"
            primary
            label="Upload Song"
            desc="Add a single track"
            icon={<UploadIcon />}
          />
          <ActionLink
            to="/admin/playlist-zip"
            label="Upload Playlist"
            desc="ZIP → library playlist"
            icon={<PlaylistIcon />}
          />
          <ActionLink
            to="/admin/bulk"
            label="Bulk Upload"
            desc="Multiple songs at once"
            icon={<UploadIcon />}
          />
          <ActionLink
            to="/admin/music"
            label="Manage Songs"
            desc="View & delete tracks"
            icon={<MusicIcon />}
          />
          <ActionLink
            to="/admin/users"
            label="View Users"
            desc="All registered accounts"
            icon={<UsersIcon />}
          />
          <ActionLink
            to="/admin/suggestions"
            label="Suggestions"
            desc="User playlist links"
            icon={<LinkIcon />}
          />
        </div>
      </div>

      {!loading && (
        <>
          <div style={styles.chartsGrid}>
            <div style={styles.chartCard}>
              <h3 style={styles.chartTitle}>Top Songs by Plays</h3>
              {topSongs.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={200}>
                  <BarChart
                    data={topSongs}
                    margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                  >
                    <XAxis
                      dataKey="name"
                      tick={{ fill: "#6b7280", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#6b7280", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={tooltipStyle}
                      cursor={{ fill: "rgba(255,255,255,0.04)" }}
                    />
                    <Bar dataKey="plays" fill="#22c55e" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>

            <div style={styles.chartCard}>
              <h3 style={styles.chartTitle}>Genre Breakdown</h3>
              {genreData.length === 0 ? (
                <EmptyChart />
              ) : (
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  <ResponsiveContainer width="50%" height={200}>
                    <PieChart>
                      <Pie
                        data={genreData}
                        cx="50%"
                        cy="50%"
                        innerRadius={50}
                        outerRadius={80}
                        dataKey="value"
                        paddingAngle={3}
                      >
                        {genreData.map((_, i) => (
                          <Cell key={i} fill={COLORS[i % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ flex: 1 }}>
                    {genreData.map((g, i) => (
                      <div
                        key={g.name}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          marginBottom: 8,
                        }}
                      >
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: 2,
                            background: COLORS[i % COLORS.length],
                            flexShrink: 0,
                          }}
                        />
                        <span
                          style={{
                            color: "#9ca3af",
                            fontSize: 12,
                            flex: 1,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {g.name}
                        </span>
                        <span
                          style={{
                            color: "#fff",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {g.value}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={styles.chartsGrid}>
            <div style={styles.chartCard}>
              <h3 style={styles.chartTitle}>Uploads by Month</h3>
              {uploadsByMonth.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart
                    data={uploadsByMonth}
                    margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: "#6b7280", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#6b7280", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="uploads"
                      stroke="#22c55e"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div style={styles.chartCard}>
              <h3 style={styles.chartTitle}>New Users by Month</h3>
              {usersByMonth.length === 0 ? (
                <EmptyChart />
              ) : (
                <ResponsiveContainer width="100%" height={180}>
                  <LineChart
                    data={usersByMonth}
                    margin={{ top: 4, right: 8, left: -20, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="#2d2d2d" />
                    <XAxis
                      dataKey="month"
                      tick={{ fill: "#6b7280", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: "#6b7280", fontSize: 11 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Line
                      type="monotone"
                      dataKey="users"
                      stroke="#3b82f6"
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {songs.length > 0 && (
            <div>
              <h2 style={{ ...styles.sectionTitle, marginBottom: 12 }}>
                Recent Uploads
              </h2>
              <div style={styles.recentList}>
                {[...songs]
                  .reverse()
                  .slice(0, 8)
                  .map((song) => (
                    <div key={song.id} style={styles.recentItem}>
                      <img
                        src={
                          song.coverUrl ||
                          "https://placehold.co/40x40/111/555?text=♪"
                        }
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
                      <span style={styles.recentGenre}>{song.genre}</span>
                    </div>
                  ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildMonthlyData(items, dateField, valueKey) {
  const map = {};
  items.forEach((item) => {
    const raw = item[dateField];
    if (!raw) return;
    const d = new Date(raw);
    if (isNaN(d.getTime())) return;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    map[key] = (map[key] || 0) + 1;
  });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-12)
    .map(([month, count]) => ({ month: month.slice(5), [valueKey]: count }));
}

const tooltipStyle = {
  background: "#1a1a1a",
  border: "1px solid #2d2d2d",
  borderRadius: 8,
  color: "#fff",
  fontSize: 12,
};

const EmptyChart = () => (
  <p
    style={{
      color: "#4b5563",
      fontSize: 13,
      textAlign: "center",
      padding: "40px 0",
    }}
  >
    No data yet
  </p>
);

const StatCard = ({ label, value, icon, color }) => (
  <div style={styles.statCard}>
    <div style={{ ...styles.statIconWrap, background: `${color}18` }}>
      {icon}
    </div>
    <div>
      <p style={{ ...styles.statValue, color }}>{value}</p>
      <p style={styles.statLabel}>{label}</p>
    </div>
  </div>
);

const ActionLink = ({ to, label, desc, icon, primary }) => (
  <Link
    to={to}
    style={{
      ...styles.actionCard,
      ...(primary ? styles.actionCardPrimary : {}),
    }}
  >
    <div
      style={{
        ...styles.actionIcon,
        ...(primary ? styles.actionIconPrimary : {}),
      }}
    >
      {icon}
    </div>
    <div>
      <p
        style={{
          ...styles.actionLabel,
          ...(primary ? styles.actionLabelPrimary : {}),
        }}
      >
        {label}
      </p>
      <p style={styles.actionDesc}>{desc}</p>
    </div>
  </Link>
);

const MusicIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </svg>
);
const UsersIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const PlayIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);
const TagIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
    <line x1="7" y1="7" x2="7.01" y2="7" />
  </svg>
);
const UploadIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <polyline points="16 16 12 12 8 16" />
    <line x1="12" y1="12" x2="12" y2="21" />
    <path d="M20.39 18.39A5 5 0 0 0 18 9h-1.26A8 8 0 1 0 3 16.3" />
  </svg>
);
const LinkIcon = () => <HeroLinkIcon style={{ width: 18, height: 18 }} />;
const PlaylistIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

const styles = {
  container: {
    maxWidth: "1000px",
    margin: "0 auto",
    padding: "32px 20px 80px",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  pageHeader: { marginBottom: "28px" },
  heading: {
    color: "#fff",
    fontSize: "22px",
    fontWeight: "700",
    letterSpacing: "-0.3px",
    marginBottom: "4px",
  },
  subheading: { color: "#6b7280", fontSize: "13px" },
  statsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: "14px",
    marginBottom: "32px",
  },
  statCard: {
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    borderRadius: "12px",
    padding: "20px",
    display: "flex",
    alignItems: "center",
    gap: "14px",
  },
  statIconWrap: {
    width: "44px",
    height: "44px",
    borderRadius: "10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    color: "#fff",
  },
  statValue: {
    fontSize: "28px",
    fontWeight: "800",
    letterSpacing: "-1px",
    lineHeight: 1,
    marginBottom: "4px",
  },
  statLabel: { color: "#6b7280", fontSize: "12px" },
  section: { marginBottom: "32px" },
  sectionTitle: {
    color: "#9ca3af",
    fontSize: "12px",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    marginBottom: "14px",
  },
  actionsRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))",
    gap: "12px",
  },
  actionCard: {
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    borderRadius: "12px",
    padding: "18px",
    textDecoration: "none",
    display: "flex",
    flexDirection: "column",
    gap: "10px",
    transition: "border-color 0.2s",
  },
  actionCardPrimary: {
    background: "rgba(34,197,94,0.08)",
    borderColor: "rgba(34,197,94,0.3)",
  },
  actionIcon: {
    width: "34px",
    height: "34px",
    background: "#2d2d2d",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#9ca3af",
  },
  actionIconPrimary: { background: "#22c55e", color: "#000" },
  actionLabel: {
    color: "#fff",
    fontSize: "14px",
    fontWeight: "600",
    marginBottom: "2px",
  },
  actionLabelPrimary: { color: "#22c55e" },
  actionDesc: { color: "#6b7280", fontSize: "12px" },
  chartsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
    gap: "14px",
    marginBottom: "16px",
  },
  chartCard: {
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    borderRadius: "12px",
    padding: "20px",
  },
  chartTitle: {
    color: "#9ca3af",
    fontSize: "12px",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.8px",
    marginBottom: "16px",
  },
  recentList: {
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    borderRadius: "12px",
    overflow: "hidden",
  },
  recentItem: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 16px",
    borderBottom: "1px solid #2d2d2d",
  },
  recentCover: {
    width: "40px",
    height: "40px",
    borderRadius: "7px",
    objectFit: "cover",
    background: "#111",
    flexShrink: 0,
  },
  recentInfo: { flex: 1, minWidth: 0 },
  recentTitle: {
    color: "#fff",
    fontSize: "13px",
    fontWeight: "600",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  recentArtist: { color: "#6b7280", fontSize: "11px" },
  recentGenre: {
    background: "rgba(34,197,94,0.1)",
    color: "#22c55e",
    border: "1px solid rgba(34,197,94,0.2)",
    borderRadius: "4px",
    padding: "2px 8px",
    fontSize: "11px",
    fontWeight: "500",
    flexShrink: 0,
  },
  btnDanger: {
    background: "rgba(239,68,68,0.12)",
    color: "#ef4444",
    border: "1px solid rgba(239,68,68,0.3)",
    borderRadius: "7px",
    padding: "6px 14px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    flexShrink: 0,
  },
  btnGhost: {
    background: "transparent",
    color: "#6b7280",
    border: "1px solid #2d2d2d",
    borderRadius: "7px",
    padding: "6px 14px",
    fontSize: "12px",
    fontWeight: "600",
    cursor: "pointer",
    flexShrink: 0,
  },
};

export default AdminDashboard;
