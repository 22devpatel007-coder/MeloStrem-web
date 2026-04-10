/**
 * client/src/components/player/MiniPlayerBar.jsx — FIXED (production-ready)
 *
 * BUG FIXED: "Maximum update depth exceeded" (MiniPlayerBar.jsx:50)
 * ──────────────────────────────────────────────────────────────────
 * Root cause: The `update` function inside the timeupdate/loadedmetadata
 * useEffect closed over `seeking` from component state. Every time `seeking`
 * changed, the effect re-ran: it removed the old listeners and added new ones.
 * The new listener still called `setProgress` / `setDuration` on the NEXT
 * tick of `timeupdate`, which fired setState again, which caused another render,
 * which rebuilt the closure... infinite update loop.
 *
 * Fix: use a ref (`seekingRef`) to track the `seeking` boolean. The ref is
 * always current but never causes a re-render — so the audio event listeners
 * are added ONCE and never torn down/re-added due to `seeking` changes.
 * The `seeking` state variable is still kept for rendering the correct value
 * in the seek input, but it is no longer in the useEffect dependency array.
 *
 * All original features and layout preserved.
 */

import { useRef, useEffect, useState, useCallback, memo } from "react";
import { usePlayerStore, audio } from "../../store/playerStore";
import LikeButton from "./LikeButton";
import PlayerControls from "./PlayerControls";
import { QueueDrawer } from "./QueueDrawer";

const MiniPlayerBar = memo(({ onExpand, showQueue, onToggleQueue }) => {
  const currentSong = usePlayerStore((s) => s.currentSong);
  const volume      = usePlayerStore((s) => s.volume);
  const setVolume   = usePlayerStore((s) => s.setVolume);

  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [seeking,  setSeeking]  = useState(false);

  // ✅ FIX: use a ref to track seeking inside the audio event listener.
  // The listener is registered once; the ref stays current without
  // re-triggering the effect — eliminating the infinite update loop.
  const seekingRef = useRef(false);

  const seekRef   = useRef(null);
  const volumeRef = useRef(null);

  // Update CSS custom property for seek progress bar
  useEffect(() => {
    const pct = duration ? (progress / duration) * 100 : 0;
    seekRef.current?.style.setProperty("--pct", `${pct}%`);
  }, [progress, duration]);

  // Update CSS custom property for volume bar
  useEffect(() => {
    volumeRef.current?.style.setProperty("--pct", `${volume * 100}%`);
  }, [volume]);

  // ✅ FIX: Empty dependency array — registered once, reads seeking via ref.
  useEffect(() => {
    const update = () => {
      // Use the ref (always current) instead of the state variable (stale closure)
      if (!seekingRef.current) setProgress(audio.currentTime);
      setDuration(audio.duration || 0);
    };
    audio.addEventListener("timeupdate",    update);
    audio.addEventListener("loadedmetadata", update);
    return () => {
      audio.removeEventListener("timeupdate",    update);
      audio.removeEventListener("loadedmetadata", update);
    };
  }, []); // ← intentionally empty: listener never needs to be re-registered

  const handleSeekStart = useCallback(() => {
    seekingRef.current = true;
    setSeeking(true);
  }, []);

  const handleSeekChange = useCallback((e) => {
    setProgress(Number(e.target.value));
  }, []);

  const handleSeekEnd = useCallback((e) => {
    audio.currentTime  = Number(e.target.value);
    seekingRef.current = false;
    setSeeking(false);
  }, []);

  const handleVolume = useCallback((e) => {
    const v = Number(e.target.value);
    audio.volume = v;
    setVolume(v);
  }, [setVolume]);

  const fmt = (t) => {
    if (!t || isNaN(t)) return "0:00";
    return `${Math.floor(t / 60)}:${Math.floor(t % 60).toString().padStart(2, "0")}`;
  };

  if (!currentSong) return null;

  return (
    <>
      <QueueDrawer open={showQueue} onClose={onToggleQueue} />

      <style>{`
        .mini-bar-range {
          -webkit-appearance: none; appearance: none;
          height: 3px; border-radius: 2px; outline: none; cursor: pointer;
          background: linear-gradient(to right, #22c55e var(--pct, 0%), #3d3d3d var(--pct, 0%));
        }
        .mini-bar-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          width: 11px; height: 11px; border-radius: 50%;
          background: #fff; margin-top: -4px;
          box-shadow: 0 1px 4px rgba(0,0,0,0.5);
          transition: transform 0.15s;
        }
        .mini-bar-range:hover::-webkit-slider-thumb { transform: scale(1.3); }
        .mini-bar-range::-moz-range-thumb {
          width: 11px; height: 11px; border-radius: 50%;
          background: #fff; border: none;
        }
        .mini-bar-range::-moz-range-progress { height: 3px; background: #22c55e; border-radius: 2px; }
        .mini-bar-range::-moz-range-track    { height: 3px; background: #3d3d3d; border-radius: 2px; }

        .mini-bar-seek-row {
          display: flex; align-items: center;
          gap: 8px; padding: 6px 20px 0;
          max-width: 1200px; margin: 0 auto;
        }
        .mini-bar-inner {
          display: grid;
          grid-template-columns: 1fr auto 1fr;
          align-items: center; gap: 16px;
          max-width: 1200px; margin: 0 auto;
          padding: 0 20px; height: 72px;
        }
        .mini-bar-right { display: flex; align-items: center; gap: 8px; justify-content: flex-end; }
        .mini-bar-vol   { display: flex; align-items: center; gap: 6px; }

        @media (max-width: 1023px) {
          .mini-bar-desktop-only { display: none !important; }
          .mini-bar-inner { grid-template-columns: 1fr auto auto; }
        }
        @media (max-width: 639px) {
          .mini-bar-seek-row  { display: none !important; }
          .mini-bar-inner     { display: flex !important; padding: 0 12px; height: 64px; gap: 0; }
          .mini-bar-song-info { flex: 1; min-width: 0; }
          .mini-bar-center    { display: none !important; }
          .mini-bar-right     { gap: 4px !important; flex-shrink: 0; margin-left: 8px; }
          .mini-bar-mobile-play { display: flex !important; }
        }
        .mini-bar-mobile-play { display: none; }
      `}</style>

      <div
        style={{
          position: "fixed", bottom: 0, left: 0, right: 0,
          background: "#161616", borderTop: "1px solid #2a2a2a", zIndex: 100,
        }}
      >
        {/* Seek row — hidden on mobile */}
        <div className="mini-bar-seek-row">
          <span style={styles.timeLabel}>{fmt(progress)}</span>
          <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
            <input
              ref={seekRef}
              type="range"
              className="mini-bar-range"
              min="0"
              max={duration || 0}
              value={progress}
              step="0.1"
              style={{ width: "100%" }}
              onMouseDown={handleSeekStart}
              onTouchStart={handleSeekStart}
              onChange={handleSeekChange}
              onMouseUp={handleSeekEnd}
              onTouchEnd={handleSeekEnd}
            />
          </div>
          <span style={styles.timeLabel}>{fmt(duration)}</span>
        </div>

        {/* Main row */}
        <div className="mini-bar-inner">
          {/* Left — song info */}
          <div
            className="mini-bar-song-info"
            style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0, cursor: "pointer" }}
            onClick={onExpand}
          >
            <img
              src={currentSong.coverUrl}
              alt={currentSong.title}
              style={{ width: 44, height: 44, borderRadius: 8, objectFit: "cover", flexShrink: 0, background: "#111" }}
              onError={(e) => { e.target.src = "https://placehold.co/44x44/111/555?text=♪"; }}
            />
            <div style={{ minWidth: 0 }}>
              <p style={styles.songTitle}>{currentSong.title}</p>
              <p style={styles.songArtist}>{currentSong.artist}</p>
            </div>
          </div>

          {/* Center — full controls (hidden mobile) */}
          <div className="mini-bar-center" style={{ display: "flex", justifyContent: "center" }}>
            <PlayerControls size="md" showShuffle showRepeat />
          </div>

          {/* Right */}
          <div className="mini-bar-right">
            <div className="mini-bar-vol mini-bar-desktop-only">
              <VolumeIcon volume={volume} />
              <input
                ref={volumeRef}
                type="range"
                className="mini-bar-range"
                min="0" max="1" step="0.01"
                value={volume}
                onChange={handleVolume}
                style={{ width: 72 }}
              />
            </div>

            <LikeButton song={currentSong} size="sm" />

            <CtrlBtn onClick={onToggleQueue} title="Queue" active={showQueue}>
              <QueueIcon />
            </CtrlBtn>

            <CtrlBtn onClick={onExpand} title="Full player" className="mini-bar-desktop-only">
              <ExpandIcon />
            </CtrlBtn>

            <div className="mini-bar-mobile-play">
              <PlayerControls size="sm" showShuffle={false} showRepeat={false} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
});

MiniPlayerBar.displayName = "MiniPlayerBar";

// ── Small control button ───────────────────────────────────────────────────────
const CtrlBtn = ({ onClick, title, active, children, className = "" }) => (
  <button
    onClick={onClick}
    title={title}
    className={className}
    style={{
      width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
      background: "none", border: "none", cursor: "pointer",
      color: active ? "#22c55e" : "#9ca3af",
      borderRadius: 8, flexShrink: 0, transition: "color 0.15s",
    }}
    onMouseEnter={(e) => { if (!active) e.currentTarget.style.color = "#fff"; }}
    onMouseLeave={(e) => { if (!active) e.currentTarget.style.color = "#9ca3af"; }}
  >
    {children}
  </button>
);

// ── Icons ──────────────────────────────────────────────────────────────────────
const QueueIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <line x1="8" y1="6" x2="21" y2="6" /><line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" /><line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" /><line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);
const ExpandIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <polyline points="18 15 12 9 6 15" />
  </svg>
);
const VolumeIcon = ({ volume }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="#6b7280">
    {volume === 0 ? (
      <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3 3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4 9.91 6.09 12 8.18V4z" />
    ) : volume < 0.5 ? (
      <path d="M18.5 12c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM5 9v6h4l5 5V4L9 9H5z" />
    ) : (
      <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02zM14 3.23v2.06c2.89.86 5 3.54 5 6.71s-2.11 5.85-5 6.71v2.06c4.01-.91 7-4.49 7-8.77s-2.99-7.86-7-8.77z" />
    )}
  </svg>
);

const styles = {
  timeLabel:  { color: "#6b7280", fontSize: "11px", fontVariantNumeric: "tabular-nums", minWidth: 28, flexShrink: 0 },
  songTitle:  { color: "#fff", fontSize: 13, fontWeight: 600, margin: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
  songArtist: { color: "#6b7280", fontSize: 11, margin: "2px 0 0", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" },
};

export default MiniPlayerBar;