/**
 * client/src/components/player/OptionsSheet.jsx
 *
 * The "..." options bottom sheet rendered on top of the full-screen player.
 * Shows: Add to Playlist (live), Share / Go to Artist (future stubs).
 *
 * Props:
 *   song:     Song | null
 *   isOpen:   boolean
 *   onClose:  () => void
 */

import { useState, useEffect, memo } from "react";
import AddToPlaylist from "../playlists/AddToPlaylist";

const OptionsSheet = memo(({ song, isOpen, onClose }) => {
  const [showAddToPlaylist, setShowAddToPlaylist] = useState(false);
  const [visible, setVisible] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setVisible(true);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => setAnimateIn(true)),
      );
    } else {
      setAnimateIn(false);
      const t = setTimeout(() => setVisible(false), 300);
      return () => clearTimeout(t);
    }
  }, [isOpen]);

  // Close AddToPlaylist resets to options list
  // const handleAddToPlaylistClose = () => setShowAddToPlaylist(false);

  if (!visible) return null;

  // If AddToPlaylist is open, render it directly (it has its own backdrop)
  if (showAddToPlaylist && song) {
    return (
      <AddToPlaylist
        song={song}
        onClose={() => {
          setShowAddToPlaylist(false);
          onClose();
        }}
      />
    );
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        display: "flex",
        alignItems: "flex-end",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      {/* Backdrop */}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: `rgba(0,0,0,${animateIn ? 0.5 : 0})`,
          transition: "background 0.3s",
        }}
      />

      {/* Sheet */}
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "relative",
          width: "100%",
          maxWidth: 480,
          background: "#1a1a1a",
          borderTop: "1px solid #2d2d2d",
          borderRadius: "20px 20px 0 0",
          padding: "12px 0 32px",
          transform: `translateY(${animateIn ? "0" : "100%"})`,
          transition: "transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)",
          fontFamily: "'Inter', -apple-system, sans-serif",
        }}
      >
        {/* Handle */}
        <div
          style={{
            width: 40,
            height: 4,
            background: "#3d3d3d",
            borderRadius: 2,
            margin: "0 auto 16px",
          }}
        />

        {/* Song info header */}
        {song && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "0 20px 16px",
              borderBottom: "1px solid #2d2d2d",
              marginBottom: 8,
            }}
          >
            <img
              src={song.coverUrl}
              alt={song.title}
              style={{
                width: 44,
                height: 44,
                borderRadius: 8,
                objectFit: "cover",
                flexShrink: 0,
                background: "#111",
              }}
              onError={(e) => {
                e.target.src = "https://placehold.co/44x44/111/555?text=♪";
              }}
            />
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  color: "#fff",
                  fontSize: 14,
                  fontWeight: 600,
                  margin: 0,
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                }}
              >
                {song.title}
              </p>
              <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
                {song.artist}
              </p>
            </div>
          </div>
        )}

        {/* Options */}
        <OptionRow
          icon={<PlaylistAddIcon />}
          label="Add to Playlist"
          onClick={() => setShowAddToPlaylist(true)}
        />
        <OptionRow
          icon={<ShareIcon />}
          label="Share"
          sublabel="Coming soon"
          disabled
        />
        <OptionRow
          icon={<ArtistIcon />}
          label="Go to Artist"
          sublabel="Coming soon"
          disabled
        />

        {/* Cancel */}
        <button
          onClick={onClose}
          style={{
            display: "block",
            width: "calc(100% - 40px)",
            margin: "12px 20px 0",
            padding: "14px",
            background: "#2d2d2d",
            border: "none",
            borderRadius: 12,
            color: "#9ca3af",
            fontSize: 14,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
});

OptionsSheet.displayName = "OptionsSheet";

// ── Option Row ─────────────────────────────────────────────────────────────────
const OptionRow = ({ icon, label, sublabel, onClick, disabled }) => (
  <button
    onClick={disabled ? undefined : onClick}
    disabled={disabled}
    style={{
      display: "flex",
      alignItems: "center",
      gap: 14,
      width: "100%",
      padding: "14px 20px",
      background: "none",
      border: "none",
      cursor: disabled ? "default" : "pointer",
      opacity: disabled ? 0.4 : 1,
      textAlign: "left",
      fontFamily: "'Inter', -apple-system, sans-serif",
      transition: "background 0.1s",
    }}
    onMouseEnter={(e) => {
      if (!disabled)
        e.currentTarget.style.background = "rgba(255,255,255,0.04)";
    }}
    onMouseLeave={(e) => {
      e.currentTarget.style.background = "none";
    }}
  >
    <span style={{ color: "#9ca3af", flexShrink: 0 }}>{icon}</span>
    <div>
      <p style={{ color: "#fff", fontSize: 15, margin: 0, fontWeight: 500 }}>
        {label}
      </p>
      {sublabel && (
        <p style={{ color: "#6b7280", fontSize: 12, margin: "2px 0 0" }}>
          {sublabel}
        </p>
      )}
    </div>
  </button>
);

// ── Icons ──────────────────────────────────────────────────────────────────────
const PlaylistAddIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
const ShareIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <circle cx="18" cy="5" r="3" />
    <circle cx="6" cy="12" r="3" />
    <circle cx="18" cy="19" r="3" />
    <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
    <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
  </svg>
);
const ArtistIcon = () => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

export default OptionsSheet;
