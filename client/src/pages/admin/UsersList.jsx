import { useState, useEffect } from "react";
import axiosInstance, { extractUsers } from "../../services/api";
import Navbar from "../../components/layout/Navbar";
import Loader from "../../components/ui/Loader";

// FIX: createdAt is now an ISO string (serialized server-side in users.controller.js).
// Previously tried to call .toDate() on it, which always returned undefined on
// API responses (Firestore Timestamps don't survive JSON serialization).
const formatDate = (raw) => {
  if (!raw) return "—";
  const d = new Date(raw);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
};

const UsersList = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    const fetchUsers = async () => {
      try {
        const res = await axiosInstance.get("/users");
        // FIX: use extractUsers helper — res.data may be { users: [] } or { data: [] }
        // or a raw array. extractUsers normalizes all shapes to a safe array.
        // Previously did setUsers(res.data) which set an object → users.filter crash.
        setUsers(extractUsers(res.data));
      } catch (err) {
        console.error("Failed to fetch users:", err);
      }
      setLoading(false);
    };
    fetchUsers();
  }, []);

  const filtered = users.filter(
    (u) =>
      u.email?.toLowerCase().includes(search.toLowerCase()) ||
      u.displayName?.toLowerCase().includes(search.toLowerCase()),
  );

  if (loading) return <Loader />;

  return (
    <div style={styles.page}>
      <Navbar />
      <div style={styles.container}>
        <div style={styles.pageHeader}>
          <h1 style={styles.heading}>Users</h1>
          <p style={styles.subheading}>{users.length} registered accounts</p>
        </div>

        <div
          style={{
            ...styles.searchWrap,
            borderColor: focused ? "#22c55e" : "#2d2d2d",
          }}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 20 20"
            fill="none"
            style={{ flexShrink: 0 }}
          >
            <circle
              cx="8.5"
              cy="8.5"
              r="5.5"
              stroke={focused ? "#22c55e" : "#6b7280"}
              strokeWidth="1.5"
            />
            <path
              d="M14 14l3 3"
              stroke={focused ? "#22c55e" : "#6b7280"}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          <input
            type="text"
            placeholder="Search by name or email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            style={styles.searchInput}
          />
        </div>

        {filtered.length === 0 ? (
          <p style={styles.noResults}>No users match your search.</p>
        ) : (
          <div style={styles.table}>
            <div style={styles.tableHeader}>
              <span style={{ ...styles.col, flex: 2 }}>User</span>
              <span style={{ ...styles.col, flex: 1 }}>Role</span>
              <span style={{ ...styles.col, flex: 1 }}>Joined</span>
            </div>
            {filtered.map((user) => (
              <div key={user.id} style={styles.tableRow}>
                <div style={{ flex: 2, minWidth: 0 }}>
                  <div style={styles.userCell}>
                    <div style={styles.avatar}>
                      {(user.displayName || user.email || "?")[0].toUpperCase()}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <p style={styles.userName}>
                        {user.displayName || "No name"}
                      </p>
                      <p style={styles.userEmail}>{user.email}</p>
                    </div>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <span
                    style={{
                      ...styles.badge,
                      ...(user.role === "admin"
                        ? styles.badgeAdmin
                        : styles.badgeUser),
                    }}
                  >
                    {user.role || "user"}
                  </span>
                </div>
                {/* FIX: Use formatDate() instead of .toDate() — API returns ISO strings */}
                <span style={{ flex: 1, color: "#6b7280", fontSize: "12px" }}>
                  {formatDate(user.createdAt)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

const styles = {
  page: {
    minHeight: "100vh",
    background: "#0f0f0f",
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
  },
  container: { maxWidth: "900px", margin: "0 auto", padding: "32px 20px 80px" },
  pageHeader: { marginBottom: "24px" },
  heading: {
    color: "#fff",
    fontSize: "22px",
    fontWeight: "700",
    letterSpacing: "-0.3px",
    marginBottom: "4px",
  },
  subheading: { color: "#6b7280", fontSize: "13px" },
  searchWrap: {
    display: "flex",
    alignItems: "center",
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    borderRadius: "8px",
    padding: "0 12px",
    gap: "10px",
    maxWidth: "360px",
    marginBottom: "20px",
    transition: "border-color 0.2s",
  },
  searchInput: {
    flex: 1,
    background: "transparent",
    border: "none",
    outline: "none",
    color: "#fff",
    fontSize: "13px",
    padding: "10px 0",
    fontFamily: "inherit",
  },
  noResults: { color: "#6b7280", fontSize: "14px" },
  table: {
    background: "#1a1a1a",
    border: "1px solid #2d2d2d",
    borderRadius: "12px",
    overflow: "hidden",
  },
  tableHeader: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "10px 16px",
    borderBottom: "1px solid #2d2d2d",
  },
  col: {
    color: "#4b5563",
    fontSize: "11px",
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  tableRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 16px",
    borderBottom: "1px solid #1f1f1f",
  },
  userCell: { display: "flex", alignItems: "center", gap: "10px", minWidth: 0 },
  avatar: {
    width: "34px",
    height: "34px",
    background: "#2d2d2d",
    borderRadius: "8px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#9ca3af",
    fontSize: "13px",
    fontWeight: "700",
    flexShrink: 0,
  },
  userName: {
    color: "#fff",
    fontSize: "13px",
    fontWeight: "500",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  userEmail: {
    color: "#6b7280",
    fontSize: "11px",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },
  badge: {
    borderRadius: "4px",
    padding: "2px 8px",
    fontSize: "11px",
    fontWeight: "500",
  },
  badgeAdmin: {
    background: "rgba(34,197,94,0.1)",
    color: "#22c55e",
    border: "1px solid rgba(34,197,94,0.2)",
  },
  badgeUser: {
    background: "#2d2d2d",
    color: "#9ca3af",
    border: "1px solid transparent",
  },
};

export default UsersList;
