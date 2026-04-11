/**
 * client/src/components/playlists/ResumeBanner.jsx
 *
 * "Continue Where You Left Off" banner.
 * Shows the last played playlist + song with a Resume button.
 *
 * Props:
 *   lastPlayed   — { playlistId, playlistName, songTitle, songArtist, songIndex, timestamp }
 *   onResume     — (lastPlayed) => void  — called when Resume is clicked
 *   onDismiss    — () => void            — hides banner for the session
 */

import React, { useState, useCallback } from 'react';

// ── Helpers ───────────────────────────────────────────────────────────────────
const formatTimestamp = (timestamp) => {
  if (!timestamp) return '';
  const date = timestamp?.toDate?.() ?? new Date(timestamp);
  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 2) return 'Just now';
  if (diffMins < 60) return `${diffMins} minutes ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays === 1) return 'Yesterday';
  return `${diffDays} days ago`;
};

// ── Waveform animation (CSS only) ─────────────────────────────────────────────
const WaveformBars = ({ playing }) => {
  const bars = [0.4, 0.9, 0.6, 1.0, 0.7, 0.5, 0.8, 0.45, 0.75, 0.6];
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: 2,
        height: 20,
        opacity: playing ? 1 : 0.4,
      }}
    >
      {bars.map((h, i) => (
        <div
          key={i}
          style={{
            width: 3,
            height: `${h * 100}%`,
            background: '#22c55e',
            borderRadius: 2,
            animation: playing ? `resumeWave 0.8s ease-in-out ${i * 0.08}s infinite alternate` : 'none',
            transformOrigin: 'bottom',
          }}
        />
      ))}
      <style>{`
        @keyframes resumeWave {
          from { transform: scaleY(0.3); opacity: 0.6; }
          to   { transform: scaleY(1);   opacity: 1;   }
        }
      `}</style>
    </div>
  );
};

// ── Main Component ─────────────────────────────────────────────────────────────
const ResumeBanner = ({ lastPlayed, onResume, onDismiss }) => {
  const [resumeLoading, setResumeLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [hovered, setHovered] = useState(false);

  const handleResume = useCallback(async () => {
    if (resumeLoading) return;
    setResumeLoading(true);
    try {
      await onResume(lastPlayed);
    } catch (err) {
      console.error('[ResumeBanner] Resume failed:', err.message);
    } finally {
      setResumeLoading(false);
    }
  }, [lastPlayed, onResume, resumeLoading]);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    onDismiss?.();
  }, [onDismiss]);

  if (dismissed || !lastPlayed) return null;

  const timeLabel = formatTimestamp(lastPlayed.timestamp);

  return (
    <div
      role="region"
      aria-label="Continue where you left off"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'relative',
        background: hovered
          ? 'linear-gradient(135deg, #0d2818 0%, #1a1a1a 60%, #111 100%)'
          : 'linear-gradient(135deg, #0a1f12 0%, #141414 60%, #0e0e0e 100%)',
        border: '1px solid',
        borderColor: hovered ? '#22c55e40' : '#1f2f22',
        borderRadius: 14,
        padding: '16px 20px',
        marginBottom: 28,
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        transition: 'all 0.25s ease',
        overflow: 'hidden',
        cursor: 'default',
      }}
    >
      {/* Subtle glow accent */}
      <div
        style={{
          position: 'absolute',
          top: -40,
          left: -40,
          width: 160,
          height: 160,
          background: 'radial-gradient(circle, #22c55e18 0%, transparent 70%)',
          pointerEvents: 'none',
          transition: 'opacity 0.3s ease',
          opacity: hovered ? 1 : 0.5,
        }}
      />

      {/* Playlist icon / cover placeholder */}
      <div
        style={{
          width: 52,
          height: 52,
          borderRadius: 8,
          background: 'linear-gradient(135deg, #166534, #14532d)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          border: '1px solid #22c55e30',
          position: 'relative',
        }}
      >
        <WaveformBars playing={hovered} />
      </div>

      {/* Text content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p
          style={{
            color: '#22c55e',
            fontSize: 10,
            fontWeight: 600,
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            marginBottom: 4,
          }}
        >
          Continue where you left off
          {timeLabel && (
            <span style={{ color: '#4b5563', fontWeight: 400, marginLeft: 8 }}>
              · {timeLabel}
            </span>
          )}
        </p>
        <p
          style={{
            color: '#fff',
            fontSize: 14,
            fontWeight: 600,
            marginBottom: 2,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {lastPlayed.playlistName ?? 'Unknown Playlist'}
        </p>
        <p
          style={{
            color: '#6b7280',
            fontSize: 12,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {lastPlayed.songTitle
            ? `${lastPlayed.songTitle}${lastPlayed.songArtist ? ` · ${lastPlayed.songArtist}` : ''}`
            : 'Ready to play'}
        </p>
      </div>

      {/* Resume button */}
      <button
        onClick={handleResume}
        disabled={resumeLoading}
        aria-label={`Resume ${lastPlayed.playlistName}`}
        style={{
          background: resumeLoading ? '#166534' : '#22c55e',
          color: resumeLoading ? '#9ca3af' : '#000',
          border: 'none',
          borderRadius: 8,
          padding: '8px 18px',
          fontSize: 13,
          fontWeight: 700,
          cursor: resumeLoading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          transform: hovered && !resumeLoading ? 'scale(1.03)' : 'scale(1)',
          fontFamily: 'inherit',
        }}
      >
        {resumeLoading ? (
          <>
            <span
              style={{
                width: 12,
                height: 12,
                border: '2px solid #9ca3af',
                borderTopColor: 'transparent',
                borderRadius: '50%',
                display: 'inline-block',
                animation: 'spin 0.7s linear infinite',
              }}
            />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            Loading
          </>
        ) : (
          <>▶ Resume</>
        )}
      </button>

      {/* Dismiss button */}
      <button
        onClick={handleDismiss}
        aria-label="Dismiss banner"
        style={{
          background: 'none',
          border: 'none',
          color: '#4b5563',
          cursor: 'pointer',
          fontSize: 18,
          lineHeight: 1,
          padding: '4px 6px',
          borderRadius: 6,
          transition: 'color 0.15s ease',
          flexShrink: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = '#9ca3af')}
        onMouseLeave={(e) => (e.currentTarget.style.color = '#4b5563')}
      >
        ×
      </button>
    </div>
  );
};

export default ResumeBanner;