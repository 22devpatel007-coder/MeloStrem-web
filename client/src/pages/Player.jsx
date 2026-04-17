/**
 * client/src/pages/Player.jsx
 *
 * TASK 5.3 — Dead Code Audit Result: FIXED (not removed)
 *
 * ROOT CAUSE OF BREAKAGE (before this fix):
 * ─────────────────────────────────────────
 * The route in index.jsx was registered as path="/player" (no :id param).
 * Player.jsx called useParams() to read `id`, but because there was no
 * :id segment in the route, id was always undefined. This caused:
 *   • song lookup: songs.find(s => s.id === undefined) → always null
 *   • render: always showed "Song not found" — the page was 100% broken
 *
 * WHY KEEP THIS PAGE (not delete it):
 * ─────────────────────────────────────
 * /player/:id is a valid deep-link use case — share a specific song URL,
 * open from a notification, or bookmark a track. The architecture mounts
 * MusicPlayer at shell level for continuous playback; this page is a
 * focused "now playing" view for a specific song ID, not a duplicate player.
 *
 * WHAT THIS FIX CHANGES:
 * ──────────────────────
 * 1. Route in index.jsx must be  path="/player/:id"  (documented below).
 * 2. Removed legacy <Navbar /> — PageWrapper already provides the top bar.
 * 3. Removed all inline style objects — replaced with Tailwind + CSS vars
 *    to match the rest of the design system.
 * 4. Removed the bottom spacer div (height:88) — PageWrapper + MiniPlayerBar
 *    handle the layout spacing via their own padding.
 * 5. playSong effect is guarded: only fires when id changes AND song is found,
 *    preventing double-play when the component re-renders for unrelated reasons.
 * 6. All data flows through existing hooks — no new state containers.
 *
 * REQUIRED CHANGE IN routes/index.jsx:
 * ──────────────────────────────────────
 *   Before:  path='/player'
 *   After:   path='/player/:id'
 * (The diff for index.jsx is included as a separate output file.)
 */

import { useEffect, useMemo, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSongs } from '../hooks/useSongs';
import { usePlayerStore } from '../store/playerStore';
import Loader from '../components/ui/Loader';

// ─── Component ────────────────────────────────────────────────────────────────

const Player = () => {
  const { id } = useParams(); // Works correctly now that route is /player/:id

  const { data, isLoading } = useSongs();

  // Flatten all loaded pages into a single songs array — same pattern as Home.jsx
  const songs = useMemo(
    () => data?.pages?.flatMap((p) => p.songs) ?? [],
    [data],
  );

  const playSong    = usePlayerStore((s) => s.playSong);
  const togglePlay  = usePlayerStore((s) => s.togglePlay);
  const isPlaying   = usePlayerStore((s) => s.isPlaying);
  const currentSong = usePlayerStore((s) => s.currentSong);

  // Find the song matching the URL param
  const song = useMemo(
    () => (id ? songs.find((s) => s.id === id) ?? null : null),
    [songs, id],
  );

  // Guard ref: only call playSong when the resolved song ID actually changes.
  // Without this guard, any re-render that causes `song` to be a new object
  // reference (but same data) would re-trigger playSong unnecessarily.
  const lastPlayedIdRef = useRef(null);

  useEffect(() => {
    if (!song) return;
    if (lastPlayedIdRef.current === song.id) return; // already playing this song
    lastPlayedIdRef.current = song.id;
    playSong(song);
  }, [song, playSong]);

  // ── Loading state ──────────────────────────────────────────────────────────
  // Show loader while songs are being fetched (first load only).
  // After songs load, if id is not found we show the not-found state below.
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[60vh]">
        <Loader />
      </div>
    );
  }

  // ── Song not found ─────────────────────────────────────────────────────────
  if (!song) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] gap-4 px-4">
        <p className="text-white text-base font-semibold">Song not found</p>
        <p className="text-gray-500 text-sm">
          {id
            ? 'This song may have been removed or the link is invalid.'
            : 'No song ID was provided in the URL.'}
        </p>
        <Link
          to="/"
          className="bg-emerald-500 hover:bg-emerald-400 transition-colors text-black font-semibold text-sm px-6 py-2.5 rounded-lg"
        >
          Back to Library
        </Link>
      </div>
    );
  }

  // ── Song found ─────────────────────────────────────────────────────────────
  const isActive = currentSong?.id === song.id;

  return (
    <>
      <style>{PLAYER_PAGE_STYLES}</style>

      <div className="pp-page">
        <div className="pp-container">
          <div className="pp-card">

            {/* Cover art */}
            <img
              src={song.coverUrl}
              alt={song.title}
              className="pp-cover"
              onError={(e) => {
                e.currentTarget.src =
                  'https://placehold.co/280x280/1a1a1a/555?text=♪';
              }}
            />

            {/* Metadata + controls */}
            <div className="pp-info">

              {/* Genre badge */}
              {song.genre && (
                <span className="pp-genre">{song.genre}</span>
              )}

              {/* Title */}
              <h1 className="pp-title">{song.title}</h1>

              {/* Artist — link to artist page if artistId exists */}
              {song.artistId ? (
                <Link to={`/artist/${song.artistId}`} className="pp-artist pp-artist--link">
                  {song.artist}
                </Link>
              ) : (
                <p className="pp-artist">{song.artist}</p>
              )}

              {/* Album — link to album page if albumId exists */}
              {song.album && (
                song.albumId ? (
                  <Link to={`/album/${song.albumId}`} className="pp-album pp-album--link">
                    {song.album}
                  </Link>
                ) : (
                  <p className="pp-album">{song.album}</p>
                )
              )}

              {/* Play / Pause button */}
              <button
                onClick={togglePlay}
                className="pp-play-btn"
                aria-label={isPlaying && isActive ? 'Pause' : 'Play'}
              >
                {isPlaying && isActive ? (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <rect x="6" y="5" width="4" height="14" rx="1" />
                      <rect x="14" y="5" width="4" height="14" rx="1" />
                    </svg>
                    Pause
                  </>
                ) : (
                  <>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <path d="M8 5.14v14l11-7-11-7z" />
                    </svg>
                    Play
                  </>
                )}
              </button>

              {/* Back link */}
              <Link to="/" className="pp-back-link">
                ← Back to Library
              </Link>

            </div>
          </div>
        </div>
      </div>
    </>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────
// Uses CSS variables from colors.css — theme-safe, no hardcoded hex values
// except for the green accent which is the app's brand color.
const PLAYER_PAGE_STYLES = `
  .pp-page {
    min-height: 100%;
    background: var(--color-bg, #0f0f0f);
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  }

  .pp-container {
    max-width: 700px;
    margin: 0 auto;
    padding: 48px 20px 80px;
    display: flex;
    justify-content: center;
  }

  .pp-card {
    display: flex;
    gap: 36px;
    align-items: flex-start;
    flex-wrap: wrap;
    justify-content: center;
    width: 100%;
  }

  /* Cover art */
  .pp-cover {
    width: 240px;
    height: 240px;
    border-radius: 14px;
    object-fit: cover;
    background: var(--color-surface, #1a1a1a);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
    flex-shrink: 0;
  }

  /* Info column */
  .pp-info {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding-top: 8px;
    min-width: 200px;
    flex: 1;
  }

  /* Genre badge */
  .pp-genre {
    background: rgba(34, 197, 94, 0.1);
    color: #22c55e;
    border: 1px solid rgba(34, 197, 94, 0.2);
    border-radius: 5px;
    padding: 3px 10px;
    font-size: 11px;
    font-weight: 500;
    align-self: flex-start;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  /* Title */
  .pp-title {
    color: var(--color-text, #fff);
    font-size: 26px;
    font-weight: 700;
    letter-spacing: -0.5px;
    line-height: 1.2;
    margin: 0;
  }

  /* Artist */
  .pp-artist {
    color: var(--color-text-muted, #9ca3af);
    font-size: 15px;
    margin: 0;
    text-decoration: none;
  }
  .pp-artist--link {
    color: #4ade80;
    transition: color 0.15s;
  }
  .pp-artist--link:hover { color: #22c55e; text-decoration: underline; text-underline-offset: 2px; }

  /* Album */
  .pp-album {
    color: var(--color-text-subtle, #6b7280);
    font-size: 13px;
    margin: 0;
    text-decoration: none;
  }
  .pp-album--link {
    color: #4ade80;
    transition: color 0.15s;
  }
  .pp-album--link:hover { color: #22c55e; text-decoration: underline; text-underline-offset: 2px; }

  /* Play/Pause button */
  .pp-play-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: #22c55e;
    color: #000;
    border: none;
    border-radius: 8px;
    padding: 12px 24px;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    margin-top: 12px;
    align-self: flex-start;
    transition: background 0.2s, transform 0.1s;
    font-family: inherit;
  }
  .pp-play-btn:hover  { background: #4ade80; }
  .pp-play-btn:active { transform: scale(0.97); }

  /* Back link */
  .pp-back-link {
    display: inline-block;
    margin-top: 4px;
    font-size: 13px;
    color: var(--color-text-subtle, #6b7280);
    text-decoration: none;
    transition: color 0.15s;
    align-self: flex-start;
  }
  .pp-back-link:hover { color: var(--color-text-muted, #9ca3af); }

  /* Responsive */
  @media (max-width: 540px) {
    .pp-container { padding: 32px 16px 80px; }
    .pp-cover { width: 200px; height: 200px; }
    .pp-title { font-size: 22px; }
  }
`;

export default Player;